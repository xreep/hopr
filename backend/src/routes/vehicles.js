import express from 'express'
import { body, query } from 'express-validator'
import Vehicle from '../models/Vehicle.js'
import { authenticate, authorize } from '../middleware/auth.js'
import { validateRequest, pick, escapeRegex, objectIdParam } from '../middleware/validate.js'

const router = express.Router()
router.param('id', objectIdParam)


// H4: Whitelist allowed fields for vehicle creation/update
const vehicleCreateFields = [
  'vehicleId', 'name', 'type', 'fuelType', 'mileage', 'capacity',
  'licensePlate', 'driver', 'status', 'purchaseDate', 'lastMaintenance', 'nextMaintenance'
]

const vehicleUpdateFields = [
  'vehicleId', 'name', 'type', 'fuelType', 'mileage', 'capacity',
  'licensePlate', 'driver', 'status', 'purchaseDate', 'lastMaintenance', 'nextMaintenance'
]


router.post('/', authenticate, authorize('admin', 'fleet_manager'), [
  body('vehicleId').trim().notEmpty().withMessage('Vehicle ID is required'),
  body('name').trim().notEmpty().withMessage('Name is required'),
  body('type').isIn(['van', 'truck', 'bike', 'ev_van']).withMessage('Invalid type'),
  body('fuelType').isIn(['diesel', 'petrol', 'electric', 'cng', 'hybrid']).withMessage('Invalid fuel type'),
  body('mileage').optional().isFloat({ min: 0 }),
  body('capacity').isFloat({ min: 0 }).withMessage('Capacity is required'),
  body('licensePlate').trim().notEmpty().withMessage('License plate is required'),
  body('driver').optional().isMongoId(),
  body('status').optional().isIn(['active', 'maintenance', 'inactive']),
  body('purchaseDate').optional().isISO8601(),
  body('lastMaintenance').optional().isISO8601(),
  body('nextMaintenance').optional().isISO8601(),
  validateRequest
], async (req, res) => {
  try {
    const allowedData = pick(req.body, vehicleCreateFields)
    const existing = await Vehicle.findOne({ 
      $or: [
        { vehicleId: allowedData.vehicleId?.toUpperCase() },
        { licensePlate: allowedData.licensePlate?.toUpperCase() }
      ]
    })
    if (existing) {
      return res.status(400).json({ message: 'Vehicle ID or license plate already exists' })
    }

    const vehicle = await Vehicle.create({
      ...allowedData,
      vehicleId: allowedData.vehicleId?.toUpperCase(),
      licensePlate: allowedData.licensePlate?.toUpperCase()
    })

    if (req.body.driver) {
      await vehicle.populate('driver', 'name email')
    }

    res.status(201).json({ vehicle })
  } catch (error) {
    res.status(500).json({ message: 'Failed to create vehicle' })
  }
})

router.get('/', authenticate, [
  query('page').optional().isInt({ min: 1 }),
  query('limit').optional().isInt({ min: 1, max: 100 }),
  query('status').optional().isIn(['active', 'maintenance', 'inactive']),
  query('fuelType').optional().isIn(['diesel', 'petrol', 'electric', 'cng', 'hybrid']),
  query('search').optional().trim(),
  validateRequest
], async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1
    const limit = parseInt(req.query.limit) || 20
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
      pagination: {
        page,
        limit,
        total,
        pages: Math.ceil(total / limit)
      }
    })
  } catch (error) {
    res.status(500).json({ message: 'Failed to fetch vehicles' })
  }
})

router.get('/available', authenticate, authorize('admin', 'fleet_manager'), async (req, res) => {
  try {
    const vehicles = await Vehicle.find({ 
      status: 'active',
      driver: { $exists: false } 
    }).select('vehicleId name type capacity licensePlate')
    res.json({ vehicles })
  } catch (error) {
    res.status(500).json({ message: 'Failed to fetch available vehicles' })
  }
})

router.get('/:id', authenticate, async (req, res) => {
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

router.put('/:id', authenticate, authorize('admin', 'fleet_manager'), [
  body('vehicleId').optional().trim().notEmpty(),
  body('name').optional().trim().notEmpty(),
  body('type').optional().isIn(['van', 'truck', 'bike', 'ev_van']),
  body('fuelType').optional().isIn(['diesel', 'petrol', 'electric', 'cng', 'hybrid']),
  body('mileage').optional().isFloat({ min: 0 }),
  body('capacity').optional().isFloat({ min: 0 }),
  body('licensePlate').optional().trim().notEmpty(),
  body('driver').optional().isMongoId(),
  body('status').optional().isIn(['active', 'maintenance', 'inactive']),
  body('purchaseDate').optional().isISO8601(),
  body('lastMaintenance').optional().isISO8601(),
  body('nextMaintenance').optional().isISO8601(),
  validateRequest
], async (req, res) => {
  try {
    const allowedData = pick(req.body, vehicleUpdateFields)
    if (allowedData.vehicleId) allowedData.vehicleId = allowedData.vehicleId.toUpperCase()
    if (allowedData.licensePlate) allowedData.licensePlate = allowedData.licensePlate.toUpperCase()

    const vehicle = await Vehicle.findByIdAndUpdate(
      req.params.id,
      allowedData,
      { new: true, runValidators: true }
    ).populate('driver', 'name email phone')

    if (!vehicle) {
      return res.status(404).json({ message: 'Vehicle not found' })
    }

    res.json({ vehicle })
  } catch (error) {
    res.status(500).json({ message: 'Failed to update vehicle' })
  }
})

router.patch('/:id/assign-driver', authenticate, authorize('admin', 'fleet_manager'), [
  body('driverId').optional().isMongoId(),
  validateRequest
], async (req, res) => {
  try {
    const { driverId } = req.body
    const vehicle = await Vehicle.findById(req.params.id)
    if (!vehicle) {
      return res.status(404).json({ message: 'Vehicle not found' })
    }

    if (vehicle.driver && vehicle.driver.toString() !== driverId) {
      return res.status(400).json({ message: 'Vehicle already assigned to another driver' })
    }

    vehicle.driver = driverId || null
    await vehicle.save()

    await vehicle.populate('driver', 'name email phone')
    res.json({ vehicle })
  } catch (error) {
    res.status(500).json({ message: 'Failed to assign driver' })
  }
})

router.delete('/:id', authenticate, authorize('admin'), async (req, res) => {
  try {
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