import express from 'express'
import Route from '../models/Route.js'
import { remainingPath, etaMinutes, isStale, isArriving } from '../services/tracking.js'
import { VEHICLE_PROFILES, ARRIVING_RADIUS_M, STALE_LOCATION_SEC } from '../config/fleet.js'

const router = express.Router()
const TOKEN_RE = /^[A-Za-z0-9_-]{20,64}$/

const firstName = name => (name || '').trim().split(/\s+/)[0] || 'Your driver'
const initials = name => (name || '').trim().split(/\s+/).map(p => p[0]).join('').slice(0, 2).toUpperCase() || '•'

// Public customer tracking page data. The unguessable token is the only credential;
// the response contains this customer's own delivery and nothing about other stops.
router.get('/:token', async (req, res) => {
  try {
    const { token } = req.params
    if (!TOKEN_RE.test(token)) return res.status(404).json({ message: 'Tracking link not found' })

    const route = await Route.findOne({ 'stops.trackingToken': token })
      .select('status stops geometry geometrySource vehicleType trafficEnabled driverLocation startedAt driver')
      .populate('driver', 'name')
    if (!route) return res.status(404).json({ message: 'Tracking link not found' })
    const stop = route.stops.find(s => s.trackingToken === token)

    const now = new Date()
    const location = route.driverLocation?.coordinates?.length === 2 ? route.driverLocation : null
    const stale = location ? isStale(location.updatedAt, now) : true
    const done = stop.status === 'completed' || stop.status === 'failed'

    let status = 'packed'
    if (route.status === 'cancelled') status = 'cancelled'
    else if (stop.status === 'completed') status = 'delivered'
    else if (stop.status === 'failed') status = 'failed'
    else if (route.status === 'active') status = location && isArriving(location.coordinates, stop) ? 'arriving' : 'on_the_way'

    const live = (status === 'on_the_way' || status === 'arriving') && location
    let eta = null
    let path = null
    if (live) {
      const remaining = remainingPath(route, stop, location.coordinates)
      path = remaining.path
      eta = etaMinutes({ route, target: stop, path, now })
    }

    const steps = ['packed', 'on_the_way', 'arriving', 'delivered']
    const reached = status === 'failed' || status === 'cancelled' ? 1 : steps.indexOf(status)
    res.set('Cache-Control', 'no-store')
    res.json({
      status,
      timeline: [
        { key: 'packed', label: 'Packed', done: true },
        { key: 'on_the_way', label: 'On the way', done: reached >= 1, at: route.startedAt || null },
        { key: 'arriving', label: 'Arriving', done: reached >= 2 },
        { key: 'delivered', label: 'Delivered', done: reached >= 3, at: stop.completedAt || null }
      ],
      delivery: {
        deliveryId: stop.deliveryId,
        customerFirstName: firstName(stop.customerName),
        address: stop.address,
        coordinates: stop.coordinates,
        windowStart: stop.windowStart || null,
        windowEnd: stop.windowEnd || null,
        plannedArrival: stop.plannedArrival || null,
        estimatedArrival: done ? null : stop.estimatedArrival || null,
        completedAt: stop.completedAt || null,
        failureReason: stop.status === 'failed' ? stop.failureReason : null
      },
      driver: route.driver ? { firstName: firstName(route.driver.name), initials: initials(route.driver.name) } : null,
      vehicle: VEHICLE_PROFILES[route.vehicleType]?.label || null,
      location: live ? { coordinates: location.coordinates, heading: location.heading ?? null, updatedAt: location.updatedAt, stale } : null,
      remainingPath: path,
      eta: eta ? { minutes: eta.minutes, distanceKm: eta.distanceKm, stopsBefore: eta.stopsBefore } : null,
      arrivingRadiusM: ARRIVING_RADIUS_M,
      staleAfterSec: STALE_LOCATION_SEC,
      serverTime: now.toISOString()
    })
  } catch (error) {
    res.status(500).json({ message: 'Tracking is temporarily unavailable' })
  }
})

export default router
