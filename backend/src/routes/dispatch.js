import express from 'express'
import { body } from 'express-validator'
import Route from '../models/Route.js'
import User from '../models/User.js'
import Vehicle from '../models/Vehicle.js'
import { authenticate, authorize } from '../middleware/auth.js'
import { validateRequest } from '../middleware/validate.js'
import { planDispatch, scoreCandidate } from '../services/dispatch.js'
import { applyVehicle } from '../services/routePlanning.js'
import * as notify from '../services/notify.js'

const router = express.Router()

// Active drivers with no active route and no planned route already assigned,
// paired with the vehicle they drive
export async function availableCandidates() {
  const drivers = await User.find({ role: 'driver', isActive: true }).select('name lastLocation').lean()
  const busy = new Set((await Route.distinct('driver', { status: { $in: ['planned', 'active'] }, driver: { $ne: null } })).map(String))
  const free = drivers.filter(d => !busy.has(String(d._id)))
  const vehicles = await Vehicle.find({ driver: { $in: free.map(d => d._id) }, status: 'active' }).select('name vehicleId type capacity fuelType mileage driver base').lean()
  const byDriver = new Map(vehicles.map(v => [String(v.driver), v]))
  return free.map(driver => ({ driver, vehicle: byDriver.get(String(driver._id)) || null }))
}

function unassignedRoutes() {
  return Route.find({ status: 'planned', driver: { $in: [null] } })
    .select('routeId name depot loadKg vehicle vehicleType plannedStart stops.sequence totalDistance')
    .sort({ plannedStart: 1, createdAt: 1 })
    .lean()
}

const summarizeRoute = r => ({ _id: r._id, routeId: r.routeId, name: r.name, stops: r.stops?.length || 0, loadKg: r.loadKg, plannedStart: r.plannedStart, totalDistance: r.totalDistance })

router.post('/preview', authenticate, authorize('admin', 'fleet_manager'), async (req, res) => {
  try {
    const [routes, candidates] = await Promise.all([unassignedRoutes(), availableCandidates()])
    const { assignments, unassigned } = planDispatch(routes, candidates)
    res.json({
      assignments: assignments.map(a => ({
        route: summarizeRoute(a.route),
        driver: { _id: a.driver._id, name: a.driver.name },
        vehicle: { _id: a.vehicle._id, name: a.vehicle.name, vehicleId: a.vehicle.vehicleId, capacity: a.vehicle.capacity },
        score: a.score,
        distanceKm: a.distanceKm,
        fitPct: a.fitPct,
        origin: a.origin,
        reasons: a.reasons
      })),
      unassigned: unassigned.map(u => ({ route: summarizeRoute(u.route), reason: u.reason })),
      availableDrivers: candidates.length,
      unassignedRoutes: routes.length
    })
  } catch (error) {
    console.error('Dispatch preview failed:', error)
    res.status(500).json({ message: 'Failed to prepare dispatch' })
  }
})

// Apply a previewed plan. Every pair is re-validated so a stale preview cannot
// double-book a driver or overload a vehicle.
router.post('/confirm', authenticate, authorize('admin', 'fleet_manager'), [
  body('assignments').isArray({ min: 1, max: 50 }).withMessage('Nothing to assign'),
  body('assignments.*.route').isMongoId(),
  body('assignments.*.driver').isMongoId(),
  body('assignments.*.vehicle').isMongoId(),
  validateRequest
], async (req, res) => {
  try {
    const candidates = await availableCandidates()
    const byDriver = new Map(candidates.map(c => [String(c.driver._id), c]))
    const seenDrivers = new Set()
    const seenVehicles = new Set()
    const assigned = []
    const skipped = []
    for (const a of req.body.assignments) {
      const route = await Route.findOne({ _id: a.route, status: 'planned', driver: { $in: [null] } })
      const candidate = byDriver.get(String(a.driver))
      if (!route) { skipped.push({ route: a.route, reason: 'Route is no longer waiting for a driver' }); continue }
      if (!candidate || seenDrivers.has(String(a.driver))) { skipped.push({ route: a.route, reason: 'Driver is no longer available' }); continue }
      if (!candidate.vehicle || String(candidate.vehicle._id) !== String(a.vehicle) || seenVehicles.has(String(a.vehicle))) {
        skipped.push({ route: a.route, reason: 'Vehicle is no longer available' })
        continue
      }
      const check = scoreCandidate({ route, driver: candidate.driver, vehicle: candidate.vehicle })
      if (!check.feasible) { skipped.push({ route: a.route, reason: check.reason }); continue }

      route.driver = candidate.driver._id
      route.assignedAt = new Date()
      await applyVehicle(route, candidate.vehicle)
      await route.save()
      notify.inBackground(notify.routeAssigned(route, candidate.driver._id))
      seenDrivers.add(String(a.driver))
      seenVehicles.add(String(a.vehicle))
      assigned.push({ route: route._id, routeId: route.routeId, driver: candidate.driver.name })
    }
    res.json({ assigned, skipped })
  } catch (error) {
    console.error('Dispatch confirm failed:', error)
    res.status(500).json({ message: 'Failed to apply dispatch' })
  }
})

export default router
