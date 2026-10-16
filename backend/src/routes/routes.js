import express from 'express'
import { body, query, validationResult } from 'express-validator'
import Route from '../models/Route.js'
import Vehicle from '../models/Vehicle.js'
import { authenticate, authorize } from '../middleware/auth.js'
import RouteOptimizer from '../services/routeOptimizer.js'

const router = express.Router()

const validateRequest = (req, res, next) => {
  const errors = validationResult(req)
  if (!errors.isEmpty()) {
    return res.status(400).json({ errors: errors.array() })
  }
  next()
}

// H4: Whitelist allowed fields for route creation/update
const routeCreateFields = [
  'name', 'stops', 'vehicle', 'driver', 'vehicleType', 'vehicleCount',
  'fuelPrice', 'totalDistance', 'estimatedTime', 'fuelEstimate', 'fuelCost',
  'geometry', 'optimizedStops'
]

const routeUpdateFields = [
  'name', 'stops', 'vehicle', 'driver', 'vehicleType', 'vehicleCount',
  'fuelPrice', 'totalDistance', 'estimatedTime', 'fuelEstimate', 'fuelCost',
  'geometry', 'optimizedStops', 'status', 'currentStopIndex', 'actualTime',
  'fuelPrice', 'trafficEnabled'
]

function pick(obj, allowed) {
  const picked = {}
  for (const key of allowed) {
    if (obj[key] !== undefined) picked[key] = obj[key]
  }
  return picked
}

router.post('/optimize', authenticate, [
  body('stops').isArray({ min: 2 }).withMessage('At least 2 stops required'),
  body('stops.*.address').notEmpty().withMessage('Address is required'),
  body('stops.*.coordinates').isArray({ min: 2, max: 2 }).withMessage('Valid coordinates required'),
  body('stops.*.priority').optional().isIn(['urgent', 'standard', 'low']),
  body('vehicleType').optional().isIn(['van', 'truck', 'bike', 'ev_van']),
  body('vehicleCount').optional().isInt({ min: 1, max: 10 }),
  body('fuelPrice').optional().isFloat({ min: 0 }),
  body('trafficEnabled').optional().isBoolean(),
  validateRequest
], async (req, res) => {
  try {
    const { stops, vehicleType = 'van', vehicleCount = 1, fuelPrice = 1.5, trafficEnabled = true } = req.body
    const trafficFactor = trafficEnabled ? 1.2 : 1.0

    const result = RouteOptimizer.optimize(stops, { vehicleType, vehicleCount, fuelPrice, trafficFactor })

    res.json(result)
  } catch (error) {
    res.status(400).json({ message: error.message })
  }
})

router.post('/', authenticate, [
  body('name').optional().trim(),
  body('stops').isArray({ min: 2 }).withMessage('At least 2 stops required'),
  body('vehicle').optional().isMongoId(),
  body('driver').optional().isMongoId(),
  body('vehicleType').optional().isIn(['van', 'truck', 'bike', 'ev_van']),
  body('vehicleCount').optional().isInt({ min: 1, max: 10 }),
  body('fuelPrice').optional().isFloat({ min: 0 }),
  body('totalDistance').isFloat({ min: 0 }),
  body('estimatedTime').isInt({ min: 0 }),
  body('fuelEstimate').isFloat({ min: 0 }),
  body('fuelCost').isFloat({ min: 0 }),
  body('geometry').isObject(),
  body('optimizedStops').isArray(),
  validateRequest
], async (req, res) => {
  try {
    const routeId = `RT-${Date.now().toString(36).toUpperCase()}`
    
    const allowedData = pick(req.body, routeCreateFields)
    
    const route = await Route.create({
      ...allowedData,
      routeId,
      createdBy: req.user.id
    })

    if (allowedData.vehicle) {
      await Vehicle.findByIdAndUpdate(allowedData.vehicle, { $inc: { totalDistance: allowedData.totalDistance } })
    }

    res.status(201).json({ route })
  } catch (error) {
    res.status(500).json({ message: 'Failed to create route' })
  }
})

router.get('/', authenticate, [
  query('page').optional().isInt({ min: 1 }),
  query('limit').optional().isInt({ min: 1, max: 100 }),
  query('status').optional().isIn(['planned', 'active', 'completed', 'cancelled']),
  query('driver').optional().isMongoId(),
  query('vehicle').optional().isMongoId(),
  query('sort').optional().isIn(['createdAt', '-createdAt', 'totalDistance', '-totalDistance']),
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
    if (req.user.role === 'driver') filter.driver = req.user.id

    const sort = req.query.sort || '-createdAt'

    const [routes, total] = await Promise.all([
      Route.find(filter)
        .populate('vehicle', 'vehicleId name licensePlate')
        .populate('driver', 'name email')
        .populate('createdBy', 'name')
        .sort(sort)
        .skip(skip)
        .limit(limit),
      Route.countDocuments(filter)
    ])

    res.json({
      routes,
      pagination: {
        page,
        limit,
        total,
        pages: Math.ceil(total / limit)
      }
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
      .populate('vehicle', 'vehicleId name licensePlate type fuelType')
      .sort({ createdAt: -1 })

    res.json({ routes })
  } catch (error) {
    res.status(500).json({ message: 'Failed to fetch assigned routes' })
  }
})

router.get('/:id', authenticate, async (req, res) => {
  try {
    const route = await Route.findById(req.params.id)
      .populate('vehicle', 'vehicleId name licensePlate type fuelType mileage capacity')
      .populate('driver', 'name email phone')
      .populate('createdBy', 'name')

    if (!route) {
      return res.status(404).json({ message: 'Route not found' })
    }

    if (req.user.role === 'driver' && route.driver?._id?.toString() !== req.user.id) {
      return res.status(403).json({ message: 'Not authorized' })
    }

    res.json({ route })
  } catch (error) {
    res.status(500).json({ message: 'Failed to fetch route' })
  }
})

router.patch('/:id', authenticate, authorize('admin', 'fleet_manager'), [
  body('name').optional().trim(),
  body('stops').optional().isArray({ min: 2 }),
  body('vehicle').optional().isMongoId(),
  body('driver').optional().isMongoId(),
  body('vehicleType').optional().isIn(['van', 'truck', 'bike', 'ev_van']),
  body('vehicleCount').optional().isInt({ min: 1, max: 10 }),
  body('fuelPrice').optional().isFloat({ min: 0 }),
  body('totalDistance').optional().isFloat({ min: 0 }),
  body('estimatedTime').optional().isInt({ min: 0 }),
  body('fuelEstimate').optional().isFloat({ min: 0 }),
  body('fuelCost').optional().isFloat({ min: 0 }),
  body('geometry').optional().isObject(),
  body('optimizedStops').optional().isArray(),
  body('status').optional().isIn(['planned', 'active', 'completed', 'cancelled']),
  body('currentStopIndex').optional().isInt({ min: 0 }),
  body('actualTime').optional().isInt({ min: 0 }),
  body('trafficEnabled').optional().isBoolean(),
  validateRequest
], async (req, res) => {
  try {
    const allowedData = pick(req.body, routeUpdateFields)
    
    const route = await Route.findByIdAndUpdate(
      req.params.id,
      allowedData,
      { new: true, runValidators: true }
    )
      .populate('vehicle', 'vehicleId name licensePlate')
      .populate('driver', 'name email')

    if (!route) {
      return res.status(404).json({ message: 'Route not found' })
    }

    res.json({ route })
  } catch (error) {
    res.status(500).json({ message: 'Failed to update route' })
  }
})

router.patch('/:id/start', authenticate, [
  validateRequest
], async (req, res) => {
  try {
    const route = await Route.findById(req.params.id)
    if (!route) {
      return res.status(404).json({ message: 'Route not found' })
    }

    if (req.user.role === 'driver' && route.driver?.toString() !== req.user.id) {
      return res.status(403).json({ message: 'Not authorized' })
    }

    route.status = 'active'
    route.startedAt = new Date()
    route.currentStopIndex = 0
    if (route.stops.length > 0) {
      route.stops[0].status = 'in_progress'
    }
    await route.save()

    res.json({ route })
  } catch (error) {
    res.status(500).json({ message: 'Failed to start route' })
  }
})

router.patch('/:id/stops/:stopIndex/status', authenticate, [
  body('status').isIn(['pending', 'in_progress', 'completed', 'failed']).withMessage('Invalid status'),
  validateRequest
], async (req, res) => {
  try {
    const { status } = req.body
    if (!['pending', 'in_progress', 'completed', 'failed'].includes(status)) {
      return res.status(400).json({ message: 'Invalid status' })
    }

    const route = await Route.findById(req.params.id)
    if (!route) {
      return res.status(404).json({ message: 'Route not found' })
    }

    if (req.user.role === 'driver' && route.driver?.toString() !== req.user.id) {
      return res.status(403).json({ message: 'Not authorized' })
    }

    const stopIndex = parseInt(req.params.stopIndex)
    if (stopIndex < 0 || stopIndex >= route.stops.length) {
      return res.status(400).json({ message: 'Invalid stop index' })
    }

    route.stops[stopIndex].status = status
    if (status === 'completed') {
      route.stops[stopIndex].completedAt = new Date()
      route.stops[stopIndex].actualArrival = new Date()
      route.currentStopIndex = Math.min(stopIndex + 1, route.stops.length - 1)
      if (route.currentStopIndex < route.stops.length) {
        route.stops[route.currentStopIndex].status = 'in_progress'
      }
    } else if (status === 'in_progress') {
      route.currentStopIndex = stopIndex
    }

    const allCompleted = route.stops.every(s => s.status === 'completed')
    if (allCompleted) {
      route.status = 'completed'
      route.completedAt = new Date()
      route.actualTime = Math.round((route.completedAt - route.startedAt) / 60000)
    }

    await route.save()

    res.json({ route })
  } catch (error) {
    res.status(500).json({ message: 'Failed to update stop status' })
  }
})

router.post('/:id/stops/:stopIndex/issues', authenticate, [
  body('issue').trim().notEmpty().withMessage('Issue description is required'),
  validateRequest
], async (req, res) => {
  try {
    const { issue } = req.body

    const route = await Route.findById(req.params.id)
    if (!route) {
      return res.status(404).json({ message: 'Route not found' })
    }

    if (req.user.role === 'driver' && route.driver?.toString() !== req.user.id) {
      return res.status(403).json({ message: 'Not authorized' })
    }

    const stopIndex = parseInt(req.params.stopIndex)
    if (stopIndex < 0 || stopIndex >= route.stops.length) {
      return res.status(400).json({ message: 'Invalid stop index' })
    }

    route.stops[stopIndex].issues.push({
      description: issue.trim(),
      reportedAt: new Date()
    })

    await route.save()
    res.json({ message: 'Issue reported successfully' })
  } catch (error) {
    res.status(500).json({ message: 'Failed to report issue' })
  }
})

router.delete('/:id', authenticate, authorize('admin', 'fleet_manager'), async (req, res) => {
  try {
    const route = await Route.findByIdAndDelete(req.params.id)
    if (!route) {
      return res.status(404).json({ message: 'Route not found' })
    }
    res.json({ message: 'Route deleted' })
  } catch (error) {
    res.status(500).json({ message: 'Failed to delete route' })
  }
})

export default router