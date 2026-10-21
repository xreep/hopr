import express from 'express'
import Route from '../models/Route.js'
import Vehicle from '../models/Vehicle.js'
import User from '../models/User.js'
import TrafficIncident from '../models/TrafficIncident.js'
import { authenticate } from '../middleware/auth.js'
import { isOnTime, driverPerformance, pct } from '../services/metrics.js'
import { istMinutesOfDay } from '../utils/time.js'

const router = express.Router()

function istDayStart(now = new Date()) {
  return new Date(now.getTime() - istMinutesOfDay(now) * 60000 - now.getUTCMilliseconds())
}

function liveSummary(route) {
  const done = route.stops.filter(s => s.status === 'completed' || s.status === 'failed').length
  const next = route.stops.find(s => s.status === 'pending' || s.status === 'in_progress')
  const lastPing = route.driverLocation?.updatedAt
  return {
    _id: route._id,
    routeId: route.routeId,
    name: route.name,
    status: route.status,
    driver: route.driver ? { _id: route.driver._id, name: route.driver.name } : null,
    vehicle: route.vehicle ? { vehicleId: route.vehicle.vehicleId, name: route.vehicle.name } : null,
    progress: { done, total: route.stops.length },
    nextStop: next ? { address: next.address, customerName: next.customerName, estimatedArrival: next.estimatedArrival, windowEnd: next.windowEnd } : null,
    lateStops: route.stops.filter(s => s.status !== 'completed' && s.status !== 'failed' && s.lateByMin > 0).length,
    driverLocation: route.driverLocation?.coordinates?.length ? route.driverLocation : null,
    lastPingSecondsAgo: lastPing ? Math.round((Date.now() - new Date(lastPing)) / 1000) : null,
    needsRecalculation: route.needsRecalculation,
    plannedStart: route.plannedStart,
    totalDistance: route.totalDistance,
    estimatedTime: route.estimatedTime
  }
}

router.get('/', authenticate, async (req, res) => {
  try {
    const today = istDayStart()

    if (req.user.role === 'driver') {
      const [mine, recent] = await Promise.all([
        Route.find({ driver: req.user.id, status: { $in: ['planned', 'active'] } })
          .select('-geometry -alternatives').populate('vehicle', 'vehicleId name').sort({ plannedStart: 1 }),
        Route.find({ driver: req.user.id, createdAt: { $gte: new Date(Date.now() - 30 * 86400000) } })
          .select('status stops totalDistance actualDistance plannedStart startedAt createdAt').lean()
      ])
      const deliveredToday = recent.flatMap(r => r.stops.filter(s => s.status === 'completed' && s.completedAt >= today))
      const perf = driverPerformance(recent)
      return res.json({
        role: 'driver',
        assignedRoutes: mine.length,
        activeRoute: mine.find(r => r.status === 'active')?._id || null,
        completedToday: deliveredToday.length,
        distanceTodayKm: Math.round(recent.filter(r => r.startedAt >= today)
          .reduce((s, r) => s + (r.actualDistance || 0), 0) * 10) / 10,
        onTimeRate: perf.onTimeRate,
        completionRate: perf.completionRate,
        routes: mine.map(liveSummary)
      })
    }

    const [activeRoutes, todaysRoutes, unassigned, needsRecalc, incidents, vehicleStats, drivers, recent, users] = await Promise.all([
      Route.find({ status: 'active' }).select('-geometry -alternatives').populate('driver', 'name').populate('vehicle', 'vehicleId name'),
      Route.find({ $or: [{ plannedStart: { $gte: today } }, { completedAt: { $gte: today } }, { status: 'active' }] })
        .select('status stops plannedStart startedAt createdAt').lean(),
      Route.countDocuments({ status: 'planned', driver: { $in: [null] } }),
      Route.countDocuments({ status: { $in: ['planned', 'active'] }, needsRecalculation: true }),
      TrafficIncident.findActive().countDocuments(),
      Vehicle.aggregate([{ $group: { _id: '$status', count: { $sum: 1 } } }]),
      User.countDocuments({ role: 'driver', isActive: true }),
      Route.find().select('-geometry -alternatives -stops').sort({ createdAt: -1 }).limit(6)
        .populate('driver', 'name').populate('vehicle', 'vehicleId name'),
      req.user.role === 'admin' ? User.aggregate([{ $group: { _id: '$role', count: { $sum: 1 } } }]) : null
    ])

    const stopsToday = todaysRoutes.flatMap(r => r.stops.map(s => ({ s, r })))
    const deliveredToday = stopsToday.filter(({ s }) => s.status === 'completed' && s.completedAt >= today)
    const failedToday = stopsToday.filter(({ s }) => s.status === 'failed' && s.failedAt >= today)
    const onTimeToday = deliveredToday.filter(({ s, r }) => isOnTime(s, r)).length
    const vehiclesByStatus = Object.fromEntries(vehicleStats.map(v => [v._id, v.count]))

    res.json({
      role: req.user.role,
      activeRoutes: activeRoutes.length,
      unassignedRoutes: unassigned,
      routesNeedingRecalculation: needsRecalc,
      activeIncidents: incidents,
      deliveriesToday: deliveredToday.length,
      failedToday: failedToday.length,
      pendingToday: stopsToday.filter(({ s }) => s.status === 'pending' || s.status === 'in_progress').length,
      onTimeRateToday: pct(onTimeToday, deliveredToday.length),
      vehicles: {
        active: vehiclesByStatus.active || 0,
        maintenance: vehiclesByStatus.maintenance || 0,
        inactive: vehiclesByStatus.inactive || 0
      },
      drivers: {
        active: drivers,
        onRoute: new Set(activeRoutes.filter(r => r.driver).map(r => r.driver._id.toString())).size
      },
      users: users ? Object.fromEntries(users.map(u => [u._id, u.count])) : undefined,
      liveRoutes: activeRoutes.map(liveSummary),
      recentRoutes: recent
    })
  } catch (error) {
    console.error('Dashboard error:', error)
    res.status(500).json({ message: 'Failed to load dashboard' })
  }
})

export default router
