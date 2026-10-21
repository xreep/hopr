import express from 'express'
import { body, query } from 'express-validator'
import Vehicle from '../models/Vehicle.js'
import User from '../models/User.js'
import Route from '../models/Route.js'
import { authenticate, authorize } from '../middleware/auth.js'
import { validateRequest, pick, escapeRegex, objectIdParam } from '../middleware/validate.js'
import { VEHICLE_TYPES, FUEL_TYPES, VEHICLE_PROFILES } from '../config/fleet.js'

const router = express.Router()
router.param('id', objectIdParam)

// H4: Whitelist allowed fields for vehicle creation/update
const vehicleFields = [
  'vehicleId', 'name', 'type', 'fuelType', 'mileage', 'capacity',
  'licensePlate', 'status', 'purchaseDate', 'lastMaintenance', 'nextMaintenance'
]

const isObjectIdOrNull = v => v === null || v === '' || /^[a-f\d]{24}$/i.test(v)

const vehicleValidators = (optional) => {
  const req = chain => (optional ? chain.optional() : chain)
  return [
    req(body('vehicleId')).trim().notEmpty().isLength({ max: 30 }).withMessage('Vehicle ID is required'),
    req(body('name')).trim().notEmpty().isLength({ max: 80 }).withMessage('Name is required'),
    req(body('type')).isIn(VEHICLE_TYPES).withMessage('Invalid type'),
    req(body('fuelType')).isIn(FUEL_TYPES).withMessage('Invalid fuel type'),
    body('mileage').optional({ values: 'falsy' }).isFloat({ min: 0, max: 200 }).withMessage('Mileage must be 0-200'),
    req(body('capacity')).isFloat({ min: 1, max: 50000 }).withMessage('Capacity (kg) is required'),
    req(body('licensePlate')).trim().notEmpty().isLength({ max: 20 }).withMessage('License plate is required'),
    body('driver').optional({ nullable: true }).custom(isObjectIdOrNull).withMessage('Invalid driver'),
    body('status').optional().isIn(['active', 'maintenance', 'inactive']),
    // Blank date inputs arrive as "" and mean "not set"
    body('purchaseDate').optional({ values: 'falsy' }).isISO8601(),
    body('lastMaintenance').optional({ values: 'falsy' }).isISO8601(),
    body('nextMaintenance').optional({ values: 'falsy' }).isISO8601(),
    validateRequest
  ]
}

// `fallbackType` is used to default a blank mileage (e.g. electric vans entered without km/kWh)
function cleanVehicleData(source, { fallbackType } = {}) {
  const data = pick(source, vehicleFields)
  for (const key of ['purchaseDate', 'lastMaintenance', 'nextMaintenance']) {
    if (data[key] === '') data[key] = null
  }
  if (data.vehicleId) data.vehicleId = data.vehicleId.toUpperCase()
  if (data.licensePlate) data.licensePlate = data.licensePlate.toUpperCase().replace(/\s+/g, '')
  const type = data.type || fallbackType
  const mileageGiven = Object.hasOwn(source, 'mileage')
  if (mileageGiven && !(Number(source.mileage) > 0)) {
    data.mileage = VEHICLE_PROFILES[type]?.mileage
  } else if (!mileageGiven && !fallbackType) {
    data.mileage = VEHICLE_PROFILES[type]?.mileage // create without mileage
  }
  return data
}

// A driver drives one vehicle at a time: assigning moves them off any other vehicle
async function resolveDriver(driverValue, vehicleId) {
  if (driverValue === undefined) return undefined
  if (driverValue === null || driverValue === '') return null
  const driver = await User.findOne({ _id: driverValue, role: 'driver', isActive: true })
  if (!driver) {
    const err = new Error('Driver not found or inactive')
    err.status = 400
    throw err
  }
  await Vehicle.updateMany({ driver: driver._id, _id: { $ne: vehicleId } }, { driver: null })
  return driver._id
}

function handleError(res, error, fallback) {
  if (error.status) return res.status(error.status).json({ message: error.message })
  if (error.code === 11000) return res.status(409).json({ message: 'Vehicle ID or license plate already exists' })
  if (error.name === 'ValidationError') return res.status(400).json({ message: Object.values(error.errors)[0]?.message })
  return res.status(500).json({ message: fallback })
}

router.post('/', authenticate, authorize('admin', 'fleet_manager'), vehicleValidators(false), async (req, res) => {
  try {
    const data = cleanVehicleData(req.body)
    const existing = await Vehicle.findOne({ $or: [{ vehicleId: data.vehicleId }, { licensePlate: data.licensePlate }] })
    if (existing) {
      return res.status(409).json({ message: 'Vehicle ID or license plate already exists' })
    }

    const vehicle = new Vehicle(data)
    const driver = await resolveDriver(req.body.driver, vehicle._id)
    if (driver !== undefined) vehicle.driver = driver
    await vehicle.save()
    await vehicle.populate('driver', 'name email phone')

    res.status(201).json({ vehicle })
  } catch (error) {
    handleError(res, error, 'Failed to create vehicle')
  }
})

router.get('/', authenticate, authorize('admin', 'fleet_manager'), [
  query('page').optional().isInt({ min: 1 }),
  query('limit').optional().isInt({ min: 1, max: 100 }),
  query('status').optional().isIn(['active', 'maintenance', 'inactive']),
  query('fuelType').optional().isIn(FUEL_TYPES),
  query('search').optional().trim().isLength({ max: 100 }),
  validateRequest
], async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1
    const limit = parseInt(req.query.limit) || 50
    const skip = (page - 1) * limit

    const filter = {}
    if (req.query.status) filter.status = req.query.status
    if (req.query.fuelType) filter.fuelType = req.query.fuelType
    if (req.query.search) {
      const search = escapeRegex(req.query.search)
      filter.$or = [
        { name: { $regex: search, $options: 'i' } },
        { vehicleId: { $regex: search, $options: 'i' } },
        { licensePlate: { $regex: search, $options: 'i' } }
      ]
    }

    const [vehicles, total] = await Promise.all([
      Vehicle.find(filter)
        .populate('driver', 'name email phone')
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit),
      Vehicle.countDocuments(filter)
    ])

    res.json({
      vehicles,
      pagination: { page, limit, total, pages: Math.ceil(total / limit) }
    })
  } catch (error) {
    res.status(500).json({ message: 'Failed to fetch vehicles' })
  }
})

// Active vehicles without a driver
router.get('/available', authenticate, authorize('admin', 'fleet_manager'), async (req, res) => {
  try {
    const vehicles = await Vehicle.find({ status: 'active', driver: null })
      .select('vehicleId name type fuelType capacity mileage licensePlate')
    res.json({ vehicles })
  } catch (error) {
    res.status(500).json({ message: 'Failed to fetch available vehicles' })
  }
})

router.get('/:id', authenticate, authorize('admin', 'fleet_manager'), async (req, res) => {
  try {
    const vehicle = await Vehicle.findById(req.params.id).populate('driver', 'name email phone')
    if (!vehicle) {
      return res.status(404).json({ message: 'Vehicle not found' })
    }
    res.json({ vehicle })
  } catch (error) {
    res.status(500).json({ message: 'Failed to fetch vehicle' })
  }
})

router.put('/:id', authenticate, authorize('admin', 'fleet_manager'), vehicleValidators(true), async (req, res) => {
  try {
    const vehicle = await Vehicle.findById(req.params.id)
    if (!vehicle) {
      return res.status(404).json({ message: 'Vehicle not found' })
    }
    const data = cleanVehicleData(req.body, { fallbackType: vehicle.type })
    Object.assign(vehicle, data)
    const driver = await resolveDriver(req.body.driver, vehicle._id)
    if (driver !== undefined) vehicle.driver = driver
    await vehicle.save()
    await vehicle.populate('driver', 'name email phone')

    res.json({ vehicle })
  } catch (error) {
    handleError(res, error, 'Failed to update vehicle')
  }
})

router.patch('/:id/assign-driver', authenticate, authorize('admin', 'fleet_manager'), [
  body('driverId').optional({ nullable: true }).custom(isObjectIdOrNull).withMessage('Invalid driver'),
  validateRequest
], async (req, res) => {
  try {
    const vehicle = await Vehicle.findById(req.params.id)
    if (!vehicle) {
      return res.status(404).json({ message: 'Vehicle not found' })
    }
    vehicle.driver = await resolveDriver(req.body.driverId ?? null, vehicle._id)
    await vehicle.save()
    await vehicle.populate('driver', 'name email phone')
    res.json({ vehicle })
  } catch (error) {
    handleError(res, error, 'Failed to assign driver')
  }
})

router.delete('/:id', authenticate, authorize('admin'), async (req, res) => {
  try {
    const inUse = await Route.exists({ vehicle: req.params.id, status: { $in: ['planned', 'active'] } })
    if (inUse) {
      return res.status(409).json({ message: 'Vehicle is assigned to a planned or active route' })
    }
    const vehicle = await Vehicle.findByIdAndDelete(req.params.id)
    if (!vehicle) {
      return res.status(404).json({ message: 'Vehicle not found' })
    }
    res.json({ message: 'Vehicle deleted' })
  } catch (error) {
    res.status(500).json({ message: 'Failed to delete vehicle' })
  }
})

export default router
