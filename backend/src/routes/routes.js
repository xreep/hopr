import express from 'express'
import { body, query } from 'express-validator'
import Route from '../models/Route.js'
import Vehicle from '../models/Vehicle.js'
import Upload from '../models/Upload.js'
import { proofUpload, sniffImageType } from '../middleware/upload.js'
import { authenticate, authorize, isManager } from '../middleware/auth.js'
import { validateRequest, pick, objectIdParam } from '../middleware/validate.js'
import {
  planFromRequest, routeDocsFromPlan, assertAssignableDriver, recalculateRoute, applyVehicle
} from '../services/routePlanning.js'
import { OptimizationError } from '../services/routeOptimizer.js'
import { VEHICLE_TYPES, PRIORITIES, MAX_STOPS_PER_BATCH, MAX_VEHICLES_PER_BATCH } from '../config/fleet.js'
import { addMinutes } from '../utils/time.js'
import { haversineKm } from '../utils/geo.js'
import User from '../models/User.js'

const router = express.Router()
router.param('id', objectIdParam)
router.param('stopId', objectIdParam)

const HHMM = /^([01]\d|2[0-3]):([0-5]\d)$/

// Shared validation for planning requests (optimize + save)
const planValidators = [
  body('stops').isArray({ min: 1, max: MAX_STOPS_PER_BATCH }).withMessage(`Provide 1-${MAX_STOPS_PER_BATCH} stops`),
  body('stops.*.address').isString().trim().notEmpty().isLength({ max: 300 }).withMessage('Every stop needs an address'),
  body('stops.*.coordinates').isArray({ min: 2, max: 2 }).withMessage('Every stop needs [lng, lat] coordinates'),
  body('stops.*.coordinates.*').isFloat({ min: -180, max: 180 }).withMessage('Invalid coordinates'),
  body('stops.*.priority').optional().isIn(PRIORITIES),
  body('stops.*.windowStart').optional({ values: 'falsy' }).matches(HHMM).withMessage('Window start must be HH:MM'),
  body('stops.*.windowEnd').optional({ values: 'falsy' }).matches(HHMM).withMessage('Window end must be HH:MM'),
  body('stops.*.packageWeightKg').optional({ values: 'falsy' }).isFloat({ min: 0, max: 5000 }),
  body('stops.*.packageSize').optional().isIn(['small', 'medium', 'large']),
  body('stops.*.customerName').optional().isString().trim().isLength({ max: 100 }),
  body('stops.*.customerPhone').optional().isString().trim().isLength({ max: 20 }),
  body('stops.*.notes').optional().isString().trim().isLength({ max: 500 }),
  body('vehicleIds').optional().isArray({ max: MAX_VEHICLES_PER_BATCH }),
  body('vehicleIds.*').isMongoId(),
  body('vehicleType').optional().isIn(VEHICLE_TYPES),
  body('vehicleCount').optional().isInt({ min: 1, max: MAX_VEHICLES_PER_BATCH }).toInt(),
  body('departureTime').optional({ values: 'falsy' }).isISO8601(),
  body('trafficEnabled').optional().isBoolean(),
  body('returnToDepot').optional().isBoolean(),
  body('depot').optional().isObject(),
  body('depot.address').optional().isString().isLength({ max: 300 }),
  body('depot.coordinates').optional().isArray({ min: 2, max: 2 }),
  body('depot.coordinates.*').optional().isFloat({ min: -180, max: 180 })
]

function sendError(res, error, fallback) {
  if (error instanceof OptimizationError) {
    return res.status(error.status).json({ message: error.message })
  }
  if (error.name === 'ValidationError') {
    return res.status(400).json({ message: Object.values(error.errors)[0]?.message || 'Invalid data' })
  }
  console.error(fallback, error)
  return res.status(500).json({ message: fallback })
}

const populateRoute = q => q
  .populate('vehicle', 'vehicleId name licensePlate type fuelType mileage capacity')
  .populate('driver', 'name email phone')
  .populate('createdBy', 'name')
  .populate('stops.proof.completedBy', 'name')

function canAccess(user, route) {
  if (isManager(user)) return true
  const driverId = route.driver?._id ? route.driver._id.toString() : route.driver?.toString()
  return user.role === 'driver' && driverId === user.id
}

// Roll actual distance and fuel into the vehicle's lifetime totals once
async function recordCompletion(route, wasCompleted) {
  if (wasCompleted || route.status !== 'completed' || !route.vehicle) return
  const km = route.actualDistance > 0 ? route.actualDistance : route.totalDistance
  await Vehicle.findByIdAndUpdate(route.vehicle._id || route.vehicle, {
    $inc: { totalDistance: Math.round(km * 100) / 100, totalFuelConsumed: route.fuelEstimate || 0 }
  })
}

async function loadAccessibleRoute(req, res) {
  const route = await Route.findById(req.params.id)
  if (!route) {
    res.status(404).json({ message: 'Route not found' })
    return null
  }
  if (!canAccess(req.user, route)) {
    res.status(403).json({ message: 'Not authorized' })
    return null
  }
  return route
}

// Preview: optimize without saving
router.post('/optimize', authenticate, authorize('admin', 'fleet_manager'), planValidators, validateRequest, async (req, res) => {
  try {
    const plan = await planFromRequest(req.body)
    res.json(plan)
  } catch (error) {
    sendError(res, error, 'Failed to optimize route')
  }
})

// Save a batch: the server re-runs the optimizer so stored figures cannot be tampered with
router.post('/', authenticate, authorize('admin', 'fleet_manager'), [
  ...planValidators,
  body('name').optional().isString().trim().isLength({ max: 100 }),
  body('assignments').optional().isArray({ max: MAX_VEHICLES_PER_BATCH }),
  body('assignments.*.driver').optional({ values: 'falsy' }).isMongoId()
], validateRequest, async (req, res) => {
  try {
    const assignments = req.body.assignments || []
    const driverIds = assignments.map(a => a?.driver).filter(Boolean)
    if (new Set(driverIds.map(String)).size !== driverIds.length) {
      return res.status(400).json({ message: 'A driver can only be assigned one route per batch' })
    }
    for (const id of driverIds) await assertAssignableDriver(id)

    const plan = await planFromRequest(req.body)
    const { batchId, docs } = await routeDocsFromPlan(plan, {
      name: req.body.name,
      createdBy: req.user.id,
      assignments: assignments.map(a => ({ driver: a?.driver || undefined }))
    })
    const routes = await Route.insertMany(docs)
    res.status(201).json({ batchId, routes, totals: plan.totals })
  } catch (error) {
    sendError(res, error, 'Failed to create route')
  }
})

router.get('/', authenticate, [
  query('page').optional().isInt({ min: 1 }),
  query('limit').optional().isInt({ min: 1, max: 100 }),
  query('status').optional().isIn(['planned', 'active', 'completed', 'cancelled']),
  query('driver').optional().isMongoId(),
  query('vehicle').optional().isMongoId(),
  query('batchId').optional().isString().isLength({ max: 40 }),
  query('unassigned').optional().isBoolean(),
  query('withGeometry').optional().isBoolean(),
  query('sort').optional().isIn(['createdAt', '-createdAt', 'totalDistance', '-totalDistance', 'plannedStart', '-plannedStart']),
  validateRequest
], async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1
    const limit = parseInt(req.query.limit) || 20
    const skip = (page - 1) * limit

    const filter = {}
    if (req.query.status) filter.status = req.query.status
    if (req.query.driver) filter.driver = req.query.driver
    if (req.query.vehicle) filter.vehicle = req.query.vehicle
    if (req.query.batchId) filter.batchId = String(req.query.batchId).toUpperCase()
    if (req.query.unassigned === 'true') filter.driver = { $in: [null] }
    if (req.user.role === 'driver') filter.driver = req.user.id

    const sort = req.query.sort || '-createdAt'

    const [routes, total] = await Promise.all([
      Route.find(filter)
        .select(req.query.withGeometry === 'true' ? '-alternatives -stops.trackingToken' : '-alternatives -geometry -stops.trackingToken')
        .populate('vehicle', 'vehicleId name licensePlate type')
        .populate('driver', 'name email phone')
        .populate('createdBy', 'name')
        .sort(sort)
        .skip(skip)
        .limit(limit),
      Route.countDocuments(filter)
    ])

    res.json({
      routes,
      pagination: { page, limit, total, pages: Math.ceil(total / limit) }
    })
  } catch (error) {
    res.status(500).json({ message: 'Failed to fetch routes' })
  }
})

router.get('/driver/assigned', authenticate, authorize('driver'), async (req, res) => {
  try {
    const routes = await Route.find({
      driver: req.user.id,
      status: { $in: ['planned', 'active'] }
    })
      .select('-alternatives')
      .populate('vehicle', 'vehicleId name licensePlate type fuelType')
      .sort({ status: 1, plannedStart: 1, createdAt: -1 })

    res.json({ routes })
  } catch (error) {
    res.status(500).json({ message: 'Failed to fetch assigned routes' })
  }
})

router.get('/:id', authenticate, async (req, res) => {
  try {
    const route = await populateRoute(Route.findById(req.params.id))
    if (!route) {
      return res.status(404).json({ message: 'Route not found' })
    }
    if (!canAccess(req.user, route)) {
      return res.status(403).json({ message: 'Not authorized' })
    }
    res.json({ route })
  } catch (error) {
    res.status(500).json({ message: 'Failed to fetch route' })
  }
})

// Manage a route: rename, assign/unassign driver and vehicle, cancel
router.patch('/:id', authenticate, authorize('admin', 'fleet_manager'), [
  body('name').optional().isString().trim().notEmpty().isLength({ max: 120 }),
  body('driver').optional({ nullable: true }).custom(v => v === null || /^[a-f\d]{24}$/i.test(v)).withMessage('Invalid driver'),
  body('vehicle').optional({ nullable: true }).custom(v => v === null || /^[a-f\d]{24}$/i.test(v)).withMessage('Invalid vehicle'),
  body('status').optional().isIn(['planned', 'cancelled']),
  validateRequest
], async (req, res) => {
  try {
    const route = await Route.findById(req.params.id)
    if (!route) return res.status(404).json({ message: 'Route not found' })
    if (route.status === 'completed') return res.status(409).json({ message: 'Completed routes cannot be changed' })

    const updates = pick(req.body, ['name', 'status'])
    if (updates.status === 'planned' && route.status !== 'cancelled') delete updates.status
    Object.assign(route, updates)

    if (req.body.driver !== undefined) {
      if (req.body.driver === null) {
        if (route.status === 'active') return res.status(409).json({ message: 'Cannot unassign the driver of an active route' })
        route.driver = undefined
        route.assignedAt = undefined
      } else {
        await assertAssignableDriver(req.body.driver)
        route.driver = req.body.driver
        route.assignedAt = new Date()
      }
    }
    if (req.body.vehicle !== undefined) {
      if (req.body.vehicle === null) {
        route.vehicle = undefined
      } else {
        const vehicle = await Vehicle.findById(req.body.vehicle)
        if (!vehicle || vehicle.status !== 'active') return res.status(400).json({ message: 'Vehicle not found or not active' })
        await applyVehicle(route, vehicle)
      }
    }
    await route.save()
    res.json({ route: await populateRoute(Route.findById(route._id)) })
  } catch (error) {
    sendError(res, error, 'Failed to update route')
  }
})

router.patch('/:id/start', authenticate, async (req, res) => {
  try {
    const route = await loadAccessibleRoute(req, res)
    if (!route) return
    if (!route.driver) return res.status(409).json({ message: 'Assign a driver before starting the route' })
    if (route.status !== 'planned') return res.status(409).json({ message: `Route is already ${route.status}` })

    const now = new Date()
    const delay = route.plannedStart ? Math.round((now - route.plannedStart) / 60000) : 0
    route.status = 'active'
    route.startedAt = now
    // Shift forecast ETAs by the actual start time (planned ETAs are kept for planned-vs-actual)
    if (delay) {
      for (const stop of route.stops) {
        if (stop.estimatedArrival) stop.estimatedArrival = addMinutes(stop.estimatedArrival, delay)
      }
    }
    const first = route.stops.find(s => s.status === 'pending')
    if (first) first.status = 'in_progress'
    route.refreshProgress()
    await route.save()

    res.json({ route })
  } catch (error) {
    sendError(res, error, 'Failed to start route')
  }
})

router.patch('/:id/stops/:stopId/status', authenticate, [
  body('status').isIn(['in_progress', 'completed', 'failed']).withMessage('Invalid status'),
  body('reason').if(body('status').equals('failed')).isString().trim().notEmpty().isLength({ max: 300 })
    .withMessage('A reason is required when a delivery fails'),
  validateRequest
], async (req, res) => {
  try {
    const route = await loadAccessibleRoute(req, res)
    if (!route) return
    if (route.status === 'completed' || route.status === 'cancelled') {
      return res.status(409).json({ message: `Route is ${route.status}` })
    }

    const stop = route.stops.id(req.params.stopId)
    if (!stop) return res.status(404).json({ message: 'Stop not found' })
    if (stop.status === 'completed' || stop.status === 'failed') {
      return res.status(409).json({ message: `Stop is already ${stop.status}` })
    }
    // Drivers complete deliveries with proof (POST .../complete); managers may override
    if (req.body.status === 'completed' && !isManager(req.user)) {
      return res.status(403).json({ message: 'Complete deliveries with proof of delivery' })
    }

    if (route.status === 'planned') {
      route.status = 'active'
      route.startedAt = new Date()
    }

    const wasCompleted = route.status === 'completed'
    const { status } = req.body
    stop.status = status
    if (status === 'completed') {
      stop.completedAt = new Date()
    } else if (status === 'failed') {
      stop.failedAt = new Date()
      stop.failureReason = req.body.reason.trim()
    }

    if (status !== 'in_progress') {
      const next = route.stops.find(s => s.status === 'pending')
      if (next && !route.stops.some(s => s.status === 'in_progress')) next.status = 'in_progress'
    }
    route.refreshProgress()
    await route.save()
    await recordCompletion(route, wasCompleted)

    res.json({ route })
  } catch (error) {
    sendError(res, error, 'Failed to update stop status')
  }
})

// Proof of delivery (Onfleet-style): photo and/or customer signature + optional note
router.post('/:id/stops/:stopId/complete', authenticate, proofUpload, [
  body('note').optional().isString().trim().isLength({ max: 500 }).withMessage('Note must be 500 characters or fewer'),
  validateRequest
], async (req, res) => {
  try {
    const route = await loadAccessibleRoute(req, res)
    if (!route) return
    if (route.status === 'completed' || route.status === 'cancelled') {
      return res.status(409).json({ message: `Route is ${route.status}` })
    }
    const stop = route.stops.id(req.params.stopId)
    if (!stop) return res.status(404).json({ message: 'Stop not found' })
    if (stop.status === 'completed' || stop.status === 'failed') {
      return res.status(409).json({ message: `Stop is already ${stop.status}` })
    }

    const files = { photo: req.files?.photo?.[0], signature: req.files?.signature?.[0] }
    if (!files.photo && !files.signature) {
      return res.status(400).json({ message: 'Add a delivery photo or the customer signature' })
    }
    for (const [kind, file] of Object.entries(files)) {
      if (file && !sniffImageType(file.buffer)) {
        return res.status(400).json({ message: `The ${kind} is not a valid image` })
      }
    }

    const saved = {}
    for (const [kind, file] of Object.entries(files)) {
      if (!file) continue
      const doc = await Upload.create({
        kind,
        contentType: sniffImageType(file.buffer),
        size: file.size,
        data: file.buffer,
        route: route._id,
        stopId: stop._id,
        uploadedBy: req.user.id
      })
      saved[kind] = doc._id
    }

    const now = new Date()
    if (route.status === 'planned') {
      route.status = 'active'
      route.startedAt = now
    }
    const wasCompleted = route.status === 'completed'
    stop.status = 'completed'
    stop.completedAt = now
    stop.proof = {
      photo: saved.photo,
      signature: saved.signature,
      note: req.body.note?.trim() || undefined,
      completedAt: now,
      completedBy: req.user.id
    }
    const next = route.stops.find(s => s.status === 'pending')
    if (next && !route.stops.some(s => s.status === 'in_progress')) next.status = 'in_progress'
    route.refreshProgress()
    await route.save()
    await recordCompletion(route, wasCompleted)

    res.json({ route: await populateRoute(Route.findById(route._id)) })
  } catch (error) {
    sendError(res, error, 'Failed to complete delivery')
  }
})

// Report an issue or a delay. A delay pushes back the ETAs of every stop not yet visited.
router.post('/:id/stops/:stopId/issues', authenticate, [
  body('type').optional().isIn(['issue', 'delay']),
  body('description').optional().isString().trim().isLength({ max: 500 }),
  body('issue').optional().isString().trim().isLength({ max: 500 }),
  body('delayMinutes').if(body('type').equals('delay')).isInt({ min: 1, max: 600 }).toInt()
    .withMessage('Delay must be 1-600 minutes'),
  validateRequest
], async (req, res) => {
  try {
    const description = (req.body.description || req.body.issue || '').trim()
    const type = req.body.type || 'issue'
    if (!description && type === 'issue') {
      return res.status(400).json({ message: 'Issue description is required' })
    }

    const route = await loadAccessibleRoute(req, res)
    if (!route) return
    const stop = route.stops.id(req.params.stopId)
    if (!stop) return res.status(404).json({ message: 'Stop not found' })

    stop.issues.push({
      type,
      description: description || `Running ${req.body.delayMinutes} min late`,
      delayMinutes: type === 'delay' ? req.body.delayMinutes : undefined,
      reportedAt: new Date(),
      reportedBy: req.user.id
    })

    if (type === 'delay') {
      for (const s of route.stops) {
        if ((s.status === 'pending' || s.status === 'in_progress') && s.estimatedArrival) {
          s.estimatedArrival = addMinutes(s.estimatedArrival, req.body.delayMinutes)
        }
      }
    }

    await route.save()
    res.json({ message: type === 'delay' ? 'Delay reported, ETAs updated' : 'Issue reported successfully', route })
  } catch (error) {
    sendError(res, error, 'Failed to report issue')
  }
})

// Live GPS from the driver app (every ~5 s while the route is active)
router.patch('/:id/location', authenticate, authorize('driver'), [
  body('coordinates').isArray({ min: 2, max: 2 }).withMessage('coordinates must be [lng, lat]'),
  body('coordinates.0').isFloat({ min: -180, max: 180 }).withMessage('Invalid longitude').toFloat(),
  body('coordinates.1').isFloat({ min: -90, max: 90 }).withMessage('Invalid latitude').toFloat(),
  body('accuracy').optional({ nullable: true }).isFloat({ min: 0, max: 100000 }).toFloat(),
  body('heading').optional({ nullable: true }).isFloat({ min: 0, max: 360 }).toFloat(),
  body('speed').optional({ nullable: true }).isFloat({ min: 0, max: 100 }).toFloat(),
  validateRequest
], async (req, res) => {
  try {
    const route = await Route.findById(req.params.id).select('driver status driverLocation')
    if (!route) return res.status(404).json({ message: 'Route not found' })
    if (route.driver?.toString() !== req.user.id) return res.status(403).json({ message: 'Not authorized' })
    if (route.status !== 'active') return res.status(409).json({ message: 'Start the route to share your location' })

    const coordinates = req.body.coordinates.map(Number)
    const now = new Date()
    const accuracy = req.body.accuracy ?? null
    // Odometer: add movement between fixes, ignoring GPS jitter (<15 m), poor fixes and jumps
    let movedKm = 0
    const prev = route.driverLocation?.coordinates
    if (prev?.length === 2 && (accuracy === null || accuracy <= 100)) {
      const d = haversineKm(prev, coordinates)
      if (d >= 0.015 && d < 3) movedKm = d
    }
    const driverLocation = {
      coordinates,
      accuracy: accuracy ?? undefined,
      heading: req.body.heading ?? undefined,
      speed: req.body.speed ?? undefined,
      updatedAt: now
    }
    await Promise.all([
      Route.updateOne({ _id: route._id }, { $set: { driverLocation }, $inc: { actualDistance: movedKm } }),
      User.updateOne({ _id: req.user.id }, { $set: { lastLocation: { coordinates, updatedAt: now } } })
    ])
    res.json({ ok: true, updatedAt: now, movedKm: Math.round(movedKm * 1000) / 1000 })
  } catch (error) {
    sendError(res, error, 'Failed to update location')
  }
})

// Dynamic recalculation: re-optimize remaining stops from the current position and time
router.post('/:id/recalculate', authenticate, [
  body('reason').optional().isString().trim().isLength({ max: 120 }),
  validateRequest
], async (req, res) => {
  try {
    const route = await loadAccessibleRoute(req, res)
    if (!route) return
    if (route.status === 'completed' || route.status === 'cancelled') {
      return res.status(409).json({ message: `Route is ${route.status}` })
    }
    const result = await recalculateRoute(route, { reason: req.body.reason || 'manual' })
    await route.save()
    res.json({
      route: await populateRoute(Route.findById(route._id)),
      previousFinish: result.previousFinish,
      newFinish: result.newFinish,
      violations: result.violations
    })
  } catch (error) {
    sendError(res, error, 'Failed to recalculate route')
  }
})

router.delete('/:id', authenticate, authorize('admin', 'fleet_manager'), async (req, res) => {
  try {
    const route = await Route.findById(req.params.id)
    if (!route) {
      return res.status(404).json({ message: 'Route not found' })
    }
    if (route.status === 'active') {
      return res.status(409).json({ message: 'Cancel or complete an active route before deleting it' })
    }
    await Promise.all([route.deleteOne(), Upload.deleteMany({ route: route._id })])
    res.json({ message: 'Route deleted' })
  } catch (error) {
    res.status(500).json({ message: 'Failed to delete route' })
  }
})

export { recordCompletion, loadAccessibleRoute, canAccess, populateRoute, sendError }
export default router
