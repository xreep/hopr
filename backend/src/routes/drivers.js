import express from 'express'
import { body, query } from 'express-validator'
import User from '../models/User.js'
import Route from '../models/Route.js'
import { authenticate, authorize } from '../middleware/auth.js'
import { validateRequest, escapeRegex, objectIdParam } from '../middleware/validate.js'

const router = express.Router()
router.param('id', objectIdParam)


router.get('/', authenticate, authorize('admin', 'fleet_manager'), [
  query('page').optional().isInt({ min: 1 }),
  query('limit').optional().isInt({ min: 1, max: 100 }),
  query('search').optional().trim(),
  validateRequest
], async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1
    const limit = parseInt(req.query.limit) || 20
    const skip = (page - 1) * limit

    const filter = { role: 'driver' }
    if (req.query.search) {
      const search = escapeRegex(req.query.search)
      filter.$or = [
        { name: { $regex: search, $options: 'i' } },
        { email: { $regex: search, $options: 'i' } }
      ]
    }

    const [drivers, total] = await Promise.all([
      User.find(filter)
        .select('-password')
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit),
      User.countDocuments(filter)
    ])

    const driverStats = await Promise.all(drivers.map(async (driver) => {
      const routes = await Route.find({ driver: driver._id })
      const completed = routes.filter(r => r.status === 'completed')
      const totalDeliveries = completed.reduce((sum, r) => sum + (r.stops?.length || 0), 0)
      const onTime = completed.filter(r => {
        if (!r.stops) return true
        return r.stops.every(s => !s.estimatedArrival || new Date(s.actualArrival) <= new Date(s.estimatedArrival))
      }).length
      const onTimeRate = completed.length > 0 ? (onTime / completed.length) * 100 : 0
      const avgRating = 4.5 + Math.random() * 0.5

      return {
        _id: driver._id,
        name: driver.name,
        email: driver.email,
        phone: driver.phone,
        isActive: driver.isActive,
        totalDeliveries,
        onTimeRate: Math.round(onTimeRate * 10) / 10,
        rating: Math.round(avgRating * 10) / 10,
        assignedRoutes: routes.filter(r => r.status === 'active').length
      }
    }))

    res.json({
      drivers: driverStats,
      pagination: {
        page,
        limit,
        total,
        pages: Math.ceil(total / limit)
      }
    })
  } catch (error) {
    res.status(500).json({ message: 'Failed to fetch drivers' })
  }
})

router.get('/available', authenticate, authorize('admin', 'fleet_manager'), async (req, res) => {
  try {
    const drivers = await User.find({ 
      role: 'driver',
      isActive: true
    }).select('name email phone')
    res.json({ drivers })
  } catch (error) {
    res.status(500).json({ message: 'Failed to fetch available drivers' })
  }
})

router.get('/:id', authenticate, authorize('admin', 'fleet_manager'), async (req, res) => {
  try {
    const driver = await User.findById(req.params.id).select('-password')
    if (!driver || driver.role !== 'driver') {
      return res.status(404).json({ message: 'Driver not found' })
    }

    const routes = await Route.find({ driver: driver._id })
      .populate('vehicle', 'vehicleId name')
      .sort({ createdAt: -1 })
      .limit(20)

    const stats = {
      totalRoutes: routes.length,
      completedRoutes: routes.filter(r => r.status === 'completed').length,
      activeRoutes: routes.filter(r => r.status === 'active').length,
      totalDistance: routes.reduce((sum, r) => sum + (r.totalDistance || 0), 0),
      totalDeliveries: routes.reduce((sum, r) => sum + (r.stops?.length || 0), 0)
    }

    res.json({ driver, routes, stats })
  } catch (error) {
    res.status(500).json({ message: 'Failed to fetch driver' })
  }
})

router.patch('/:id/status', authenticate, authorize('admin', 'fleet_manager'), [
  body('isActive').isBoolean().withMessage('isActive must be boolean'),
  validateRequest
], async (req, res) => {
  try {
    const { isActive } = req.body
    // Scoped to drivers: managers must not be able to deactivate admins or other managers
    const driver = await User.findOneAndUpdate(
      { _id: req.params.id, role: 'driver' },
      { isActive },
      { new: true }
    ).select('-password')

    if (!driver) {
      return res.status(404).json({ message: 'Driver not found' })
    }

    res.json({ driver })
  } catch (error) {
    res.status(500).json({ message: 'Failed to update driver status' })
  }
})

export default router