import express from 'express'
import { authenticate, authorize } from '../middleware/auth.js'
import { seedDemo } from '../services/demo.js'
import Route from '../models/Route.js'
import { planDispatch } from '../services/dispatch.js'
import { applyVehicle } from '../services/routePlanning.js'
import { startSimulatedRoute, simulatingFilter, SIM_SPEEDUP } from '../services/simulation.js'
import { availableCandidates } from './dispatch.js'

const router = express.Router()

// One-click demo data for admins / fleet managers
router.post('/seed', authenticate, authorize('admin', 'fleet_manager'), async (req, res) => {
  try {
    const result = await seedDemo({ createdBy: req.user.id })
    res.status(201).json({
      message: 'Demo data ready',
      routeId: result.route._id,
      route: result.route.routeId,
      routes: result.routes.length,
      accounts: result.accounts,
      vehicles: result.vehicles
    })
  } catch (error) {
    console.error('Demo seed failed:', error)
    res.status(500).json({ message: 'Failed to create demo data' })
  }
})

// Demo morning: auto-dispatch the waiting demo routes, then drive every planned demo
// route along its roads at SIM_SPEEDUP x real time. Real routes are never touched.
router.post('/simulate', authenticate, authorize('admin', 'fleet_manager'), async (req, res) => {
  try {
    const waiting = await Route.find({ isDemo: true, status: 'planned', driver: { $in: [null] } })
      .select('routeId name depot loadKg vehicle vehicleType plannedStart stops.sequence totalDistance').lean()
    if (waiting.length) {
      const { assignments } = planDispatch(waiting, await availableCandidates())
      for (const a of assignments) {
        const route = await Route.findOne({ _id: a.route._id, status: 'planned', driver: { $in: [null] } })
        if (!route) continue
        route.driver = a.driver._id
        route.assignedAt = new Date()
        await applyVehicle(route, a.vehicle)
        await route.save()
      }
    }

    const now = new Date()
    const busyDrivers = new Set((await Route.distinct('driver', { status: 'active' })).map(String))
    const ready = await Route.find({ isDemo: true, status: 'planned', driver: { $ne: null } }).populate('driver', 'name')
    const started = []
    for (const route of ready) {
      const driverId = String(route.driver._id)
      if (busyDrivers.has(driverId)) continue
      busyDrivers.add(driverId)
      startSimulatedRoute(route, now)
      await route.save()
      started.push({ _id: route._id, routeId: route.routeId, name: route.name, driver: route.driver.name })
    }
    if (!started.length) {
      return res.status(409).json({ message: 'No demo routes are waiting to start. Load demo data first.' })
    }
    res.json({ started, speedup: SIM_SPEEDUP })
  } catch (error) {
    console.error('Demo morning failed:', error)
    res.status(500).json({ message: 'Failed to start the demo morning' })
  }
})

// Stop the simulated drives where they are; the routes stay on the road
router.delete('/simulate', authenticate, authorize('admin', 'fleet_manager'), async (req, res) => {
  try {
    const { modifiedCount } = await Route.updateMany(simulatingFilter(), { $unset: { simulation: 1 } })
    res.json({ stopped: modifiedCount })
  } catch (error) {
    console.error('Stopping the demo morning failed:', error)
    res.status(500).json({ message: 'Failed to stop the demo morning' })
  }
})

export default router
