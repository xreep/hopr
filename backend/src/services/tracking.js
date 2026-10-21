// Live tracking maths: where the driver is along the planned path, what is left
// to drive to a given stop, and how long that should take.
import { haversineKm, pointToSegment } from '../utils/geo.js'
import { timeOfDayFactor } from './traffic.js'
import { VEHICLE_PROFILES, ARRIVING_RADIUS_M, STALE_LOCATION_SEC, ROAD_CIRCUITY } from '../config/fleet.js'

const OFF_ROUTE_KM = 0.35

// Distance along a polyline (km) to the point nearest `p`, and how far p is from it
export function projectAlong(line, p) {
  let best = { alongKm: 0, offKm: Infinity, segment: 0, t: 0 }
  let along = 0
  for (let i = 1; i < line.length; i++) {
    const segKm = haversineKm(line[i - 1], line[i])
    const { distanceKm, t } = pointToSegment(p, line[i - 1], line[i])
    if (distanceKm < best.offKm) best = { alongKm: along + t * segKm, offKm: distanceKm, segment: i - 1, t }
    along += segKm
  }
  if (line.length === 1) best = { alongKm: 0, offKm: haversineKm(line[0], p), segment: 0, t: 0 }
  return best
}

export function pointAt(line, km) {
  let remaining = Math.max(0, km)
  for (let i = 1; i < line.length; i++) {
    const seg = haversineKm(line[i - 1], line[i])
    if (remaining <= seg) {
      const t = seg ? remaining / seg : 0
      return [line[i - 1][0] + (line[i][0] - line[i - 1][0]) * t, line[i - 1][1] + (line[i][1] - line[i - 1][1]) * t]
    }
    remaining -= seg
  }
  return line[line.length - 1]
}

export function sliceLine(line, fromKm, toKm) {
  const out = [pointAt(line, fromKm)]
  let along = 0
  for (let i = 1; i < line.length; i++) {
    along += haversineKm(line[i - 1], line[i])
    if (along > fromKm && along < toKm) out.push(line[i])
  }
  out.push(pointAt(line, toKm))
  return out
}

export function lengthKm(line) {
  let total = 0
  for (let i = 1; i < line.length; i++) total += haversineKm(line[i - 1], line[i])
  return total
}

// The path still to drive from the driver to `target` stop: along the planned route
// geometry when the driver is on it, otherwise straight through the remaining stops.
export function remainingPath(route, target, driverPos) {
  const line = route.geometry?.coordinates?.length > 1 ? route.geometry.coordinates : null
  const pending = route.stops.filter(s => (s.status === 'pending' || s.status === 'in_progress') && s.sequence <= target.sequence)
  const fallback = [driverPos, ...pending.map(s => s.coordinates)]
  if (!line) return { path: fallback, onRoute: false }

  const driver = projectAlong(line, driverPos)
  const stop = projectAlong(line, target.coordinates)
  // Pick the stop's occurrence after the driver if the line passes it more than once
  if (driver.offKm > OFF_ROUTE_KM || stop.alongKm < driver.alongKm - 0.05) return { path: fallback, onRoute: false }
  return { path: [driverPos, ...sliceLine(line, driver.alongKm, stop.alongKm).slice(1)], onRoute: true }
}

export function etaMinutes({ route, target, path, now = new Date() }) {
  const profile = VEHICLE_PROFILES[route.vehicleType] || VEHICLE_PROFILES.van
  const km = lengthKm(path) * (route.geometrySource === 'mapbox' ? 1 : ROAD_CIRCUITY)
  const traffic = route.trafficEnabled === false ? 1 : timeOfDayFactor(now)
  const stopsBefore = route.stops.filter(s => (s.status === 'pending' || s.status === 'in_progress') && s.sequence < target.sequence).length
  const minutes = (km / profile.speedKmh) * 60 * traffic + stopsBefore * profile.serviceMin
  return { minutes: Math.max(1, Math.round(minutes)), distanceKm: Math.round(km * 100) / 100, stopsBefore }
}

export function isStale(updatedAt, now = Date.now()) {
  return !updatedAt || now - new Date(updatedAt).getTime() > STALE_LOCATION_SEC * 1000
}

export function isArriving(driverPos, stop) {
  return haversineKm(driverPos, stop.coordinates) * 1000 <= ARRIVING_RADIUS_M
}
