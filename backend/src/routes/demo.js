import express from 'express'
import { authenticate, authorize } from '../middleware/auth.js'
import { seedDemo, demoMode } from '../services/demo.js'
import Route from '../models/Route.js'
import { planDispatch } from '../services/dispatch.js'
import { applyVehicle } from '../services/routePlanning.js'
import { startSimulatedRoute, resetSimulatedRoute, simulatingFilter, simulationSettled, SIM_SPEEDUP } from '../services/simulation.js'
import { availableCandidates } from './dispatch.js'
import { requireDemoMode } from '../middleware/demo.js'

const router = express.Router()

// Public: lets the web app show or hide its demo buttons
router.get('/status', (req, res) => res.json({ enabled: demoMode() }))

router.use(requireDemoMode)

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
    const dispatched = new Set()
    if (waiting.length) {
      const { assignments } = planDispatch(waiting, await availableCandidates())
      for (const a of assignments) {
        const route = await Route.findOne({ _id: a.route._id, status: 'planned', driver: { $in: [null] } })
        if (!route) continue
        route.driver = a.driver._id
        route.assignedAt = new Date()
        await applyVehicle(route, a.vehicle)
        await route.save()
        dispatched.add(String(route._id))
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
      route.simulation.dispatched = dispatched.has(String(route._id))
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

// Stop the demo morning and put its routes back as they were before it: planned, nothing
// delivered, and the drivers it dispatched free again, so the fleet can be dispatched or
// the demo morning run afresh. Real routes are never touched.
router.delete('/simulate', authenticate, authorize('admin', 'fleet_manager'), async (req, res) => {
  try {
    // Take the routes out of the drive first, so no new tick moves them, and let a tick
    // already in progress finish. A route that finished in that tick stays completed.
    const ids = await Route.distinct('_id', simulatingFilter())
    await Route.updateMany({ _id: { $in: ids } }, { $unset: { 'simulation.startedAt': 1 } })
    await simulationSettled()
    const routes = await Route.find({ _id: { $in: ids }, status: 'active' })
    for (const route of routes) {
      resetSimulatedRoute(route)
      await route.save()
    }
    res.json({ stopped: ids.length })
  } catch (error) {
    console.error('Stopping the demo morning failed:', error)
    res.status(500).json({ message: 'Failed to stop the demo morning' })
  }
})

export default router
