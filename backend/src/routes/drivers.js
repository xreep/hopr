import express from 'express'
import { body, query } from 'express-validator'
import User from '../models/User.js'
import Route from '../models/Route.js'
import Vehicle from '../models/Vehicle.js'
import { authenticate, authorize } from '../middleware/auth.js'
import { protectDemoAccount } from '../middleware/demo.js'
import { validateRequest, escapeRegex, objectIdParam } from '../middleware/validate.js'
import { driverPerformance } from '../services/metrics.js'
import { daysOffValidators, normalizeDaysOff } from '../services/availability.js'

const router = express.Router()
router.param('id', objectIdParam)

router.get('/', authenticate, authorize('admin', 'fleet_manager'), [
  query('page').optional().isInt({ min: 1 }),
  query('limit').optional().isInt({ min: 1, max: 100 }),
  query('search').optional().trim().isLength({ max: 100 }),
  validateRequest
], async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1
    const limit = parseInt(req.query.limit) || 50
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
      User.find(filter).select('-password').sort({ createdAt: -1 }).skip(skip).limit(limit),
      User.countDocuments(filter)
    ])

    // One query each for routes and vehicles instead of one per driver
    const ids = drivers.map(d => d._id)
    const [routes, vehicles] = await Promise.all([
      Route.find({ driver: { $in: ids } }).select('driver status stops totalDistance actualDistance plannedStart startedAt createdAt routeId name').lean(),
      Vehicle.find({ driver: { $in: ids } }).select('driver vehicleId name type licensePlate capacity').lean()
    ])
    const routesByDriver = new Map()
    for (const r of routes) {
      const key = r.driver.toString()
      if (!routesByDriver.has(key)) routesByDriver.set(key, [])
      routesByDriver.get(key).push(r)
    }
    const vehicleByDriver = new Map(vehicles.map(v => [v.driver.toString(), v]))

    res.json({
      drivers: drivers.map(driver => {
        const mine = routesByDriver.get(driver._id.toString()) || []
        const active = mine.find(r => r.status === 'active')
        return {
          _id: driver._id,
          name: driver.name,
          email: driver.email,
          phone: driver.phone,
          isActive: driver.isActive,
          lastLogin: driver.lastLogin,
          lastLocation: driver.lastLocation,
          vehicle: vehicleByDriver.get(driver._id.toString()) || null,
          activeRoute: active ? { _id: active._id, routeId: active.routeId, name: active.name } : null,
          plannedRoutes: mine.filter(r => r.status === 'planned').length,
          ...driverPerformance(mine)
        }
      }),
      pagination: { page, limit, total, pages: Math.ceil(total / limit) }
    })
  } catch (error) {
    res.status(500).json({ message: 'Failed to fetch drivers' })
  }
})

// Active drivers with their vehicle and whether they are currently on a route
router.get('/available', authenticate, authorize('admin', 'fleet_manager'), async (req, res) => {
  try {
    const drivers = await User.find({ role: 'driver', isActive: true }).select('name email phone lastLocation').lean()
    const ids = drivers.map(d => d._id)
    const [vehicles, busy] = await Promise.all([
      Vehicle.find({ driver: { $in: ids } }).select('driver vehicleId name type capacity status').lean(),
      Route.distinct('driver', { driver: { $in: ids }, status: 'active' })
    ])
    const vehicleByDriver = new Map(vehicles.map(v => [v.driver.toString(), v]))
    const busySet = new Set(busy.map(String))
    res.json({
      drivers: drivers.map(d => ({
        ...d,
        vehicle: vehicleByDriver.get(d._id.toString()) || null,
        onRoute: busySet.has(d._id.toString())
      }))
    })
  } catch (error) {
    res.status(500).json({ message: 'Failed to fetch available drivers' })
  }
})

router.get('/:id', authenticate, authorize('admin', 'fleet_manager'), async (req, res) => {
  try {
    const driver = await User.findOne({ _id: req.params.id, role: 'driver' }).select('-password')
    if (!driver) {
      return res.status(404).json({ message: 'Driver not found' })
    }

    const [routes, vehicle] = await Promise.all([
      Route.find({ driver: driver._id })
        .select('-alternatives -geometry -stops.trackingToken')
        .populate('vehicle', 'vehicleId name')
        .sort({ createdAt: -1 })
        .limit(50),
      Vehicle.findOne({ driver: driver._id }).select('vehicleId name type licensePlate capacity')
    ])

    res.json({ driver, vehicle, routes: routes.slice(0, 20), stats: driverPerformance(routes) })
  } catch (error) {
    res.status(500).json({ message: 'Failed to fetch driver' })
  }
})

router.patch('/:id/status', authenticate, authorize('admin', 'fleet_manager'), protectDemoAccount(), [
  body('isActive').isBoolean().withMessage('isActive must be boolean'),
  validateRequest
], async (req, res) => {
  try {
    const { isActive } = req.body
    // Scoped to drivers: managers must not be able to deactivate admins or other managers
    const driver = await User.findOneAndUpdate(
      { _id: req.params.id, role: 'driver' },
      // Activating a new sign-up approves it
      { isActive, ...(isActive && { pendingApproval: false }) },
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

// A manager sets a driver's days off
router.put('/:id/days-off', authenticate, authorize('admin', 'fleet_manager'), protectDemoAccount(), [
  ...daysOffValidators,
  validateRequest
], async (req, res) => {
  try {
    const driver = await User.findOneAndUpdate(
      { _id: req.params.id, role: 'driver' },
      { $set: { daysOff: normalizeDaysOff(req.body.daysOff) } },
      { new: true }
    )
    if (!driver) return res.status(404).json({ message: 'Driver not found' })
    res.json({ daysOff: driver.daysOff })
  } catch (error) {
    res.status(500).json({ message: 'Failed to update days off' })
  }
})

export default router
