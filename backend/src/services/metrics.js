// KPI definitions shared by analytics, the dashboard and driver performance.
// Every figure is derived from recorded deliveries — nothing is simulated.
import { addMinutes, windowMinutes } from '../utils/time.js'

export const ON_TIME_GRACE_MIN = 15

const isTerminal = s => s.status === 'completed' || s.status === 'failed'

// The latest acceptable completion time for a stop: its window end (IST, on the day the
// window is next open from the route's start, see windowMinutes) or, without a window,
// the promised ETA plus a grace period.
export function promiseFor(stop, route) {
  const day = route.plannedStart || route.startedAt || route.createdAt
  if (stop.windowEnd && day) {
    const start = new Date(day)
    return addMinutes(start, windowMinutes(stop.windowStart, stop.windowEnd, start).end)
  }
  const planned = stop.plannedArrival || stop.estimatedArrival
  if (planned) return new Date(new Date(planned).getTime() + ON_TIME_GRACE_MIN * 60000)
  return null
}

export function isOnTime(stop, route) {
  if (stop.status !== 'completed' || !stop.completedAt) return false
  const promise = promiseFor(stop, route)
  return !promise || new Date(stop.completedAt) <= promise
}

// Minutes from the route starting to this parcel reaching the customer
export function deliveryMinutes(stop, route) {
  if (stop.status !== 'completed' || !stop.completedAt || !route.startedAt) return null
  return Math.max(0, (new Date(stop.completedAt) - new Date(route.startedAt)) / 60000)
}

const avg = values => (values.length ? values.reduce((a, b) => a + b, 0) / values.length : null)
const round1 = n => (n === null || n === undefined ? null : Math.round(n * 10) / 10)
const pct = (num, den) => (den > 0 ? round1((num / den) * 100) : null)

// Per-driver performance metrics from a list of that driver's routes
export function driverPerformance(routes) {
  let completed = 0
  let failed = 0
  let onTime = 0
  let assignedStops = 0
  let distanceKm = 0
  const durations = []
  for (const route of routes) {
    if (route.status === 'cancelled') continue
    assignedStops += route.stops.length
    if (route.status === 'completed') distanceKm += route.actualDistance > 0 ? route.actualDistance : route.totalDistance
    for (const stop of route.stops) {
      if (stop.status === 'completed') {
        completed += 1
        if (isOnTime(stop, route)) onTime += 1
        const d = deliveryMinutes(stop, route)
        if (d !== null) durations.push(d)
      } else if (stop.status === 'failed') {
        failed += 1
      }
    }
  }
  const attempted = completed + failed
  return {
    totalDeliveries: completed,
    failedDeliveries: failed,
    assignedStops,
    onTimeRate: pct(onTime, completed),
    completionRate: pct(completed, attempted),
    avgDeliveryMinutes: round1(avg(durations)),
    distanceKm: round1(distanceKm),
    routesCompleted: routes.filter(r => r.status === 'completed').length,
    activeRoutes: routes.filter(r => r.status === 'active').length
  }
}

export { isTerminal, avg, round1, pct }
