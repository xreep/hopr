// Auto-dispatch: match unassigned routes to available drivers.
//   score = 0.6 x proximity + 0.4 x capacity fit (+0.05 if the vehicle type matches the plan)
// proximity = 1 / (1 + km / 3) from the driver's last GPS fix (else the depot) to the
// route's start; capacity fit = load / capacity (overloaded vehicles are excluded, tight
// fits preferred so a truck is not sent for a 3 kg route). Greedy best-pair matching,
// one route per driver and per vehicle, deterministic tie-breaks.
import { haversineKm } from '../utils/geo.js'
import { DEFAULT_DEPOT } from '../config/fleet.js'

export const WEIGHTS = Object.freeze({ proximity: 0.6, fit: 0.4, typeMatch: 0.05 })
export const PROXIMITY_HALF_KM = 3
export const LOCATION_FRESH_HOURS = 12

const round = (n, d = 2) => Math.round(n * 10 ** d) / 10 ** d

export function driverOrigin(driver, depot, now = Date.now()) {
  const loc = driver.lastLocation
  const fresh = loc?.coordinates?.length === 2 && loc.updatedAt && now - new Date(loc.updatedAt).getTime() < LOCATION_FRESH_HOURS * 3600000
  return fresh ? { coordinates: loc.coordinates, source: 'gps' } : { coordinates: depot, source: 'depot' }
}

export function scoreCandidate({ route, driver, vehicle, now = Date.now() }) {
  const start = route.depot?.coordinates?.length === 2 ? route.depot.coordinates : DEFAULT_DEPOT.coordinates
  const origin = driverOrigin(driver, start, now)
  const load = route.loadKg || 0
  if (!vehicle) return { feasible: false, reason: `${driver.name} has no vehicle` }
  if (load > vehicle.capacity) {
    return { feasible: false, reason: `${vehicle.name} (${vehicle.capacity} kg) cannot carry ${load} kg` }
  }
  const distanceKm = haversineKm(origin.coordinates, start)
  const proximity = 1 / (1 + distanceKm / PROXIMITY_HALF_KM)
  const fit = vehicle.capacity > 0 ? load / vehicle.capacity : 0
  const typeMatch = route.vehicleType && route.vehicleType === vehicle.type ? WEIGHTS.typeMatch : 0
  const score = WEIGHTS.proximity * proximity + WEIGHTS.fit * fit + typeMatch
  const reasons = [
    origin.source === 'gps' ? `${round(distanceKm, 1)} km from the route start (live GPS)` : 'at the depot (no recent GPS)',
    `load ${load} kg uses ${Math.round(fit * 100)}% of ${vehicle.capacity} kg`
  ]
  if (typeMatch) reasons.push('vehicle type matches the plan')
  return { feasible: true, score: round(score, 4), distanceKm: round(distanceKm, 2), fitPct: Math.round(fit * 100), origin: origin.source, reasons }
}

// routes: unassigned planned routes; candidates: [{ driver, vehicle }] (vehicle may be null)
export function planDispatch(routes, candidates, { now = Date.now() } = {}) {
  const pairs = []
  const lastReason = new Map()
  for (const route of routes) {
    for (const c of candidates) {
      // Drivers take routes in the vehicle they drive; the route's planned vehicle is a hint
      const s = scoreCandidate({ route, driver: c.driver, vehicle: c.vehicle, now })
      if (s.feasible) pairs.push({ route, ...c, ...s })
      else lastReason.set(String(route._id), s.reason)
    }
  }
  pairs.sort((a, b) =>
    b.score - a.score ||
    new Date(a.route.plannedStart || 0) - new Date(b.route.plannedStart || 0) ||
    String(a.driver.name).localeCompare(String(b.driver.name)) ||
    String(a.route._id).localeCompare(String(b.route._id)))

  const usedRoutes = new Set()
  const usedDrivers = new Set()
  const usedVehicles = new Set()
  const assignments = []
  for (const p of pairs) {
    const r = String(p.route._id)
    const d = String(p.driver._id)
    const v = String(p.vehicle._id)
    if (usedRoutes.has(r) || usedDrivers.has(d) || usedVehicles.has(v)) continue
    usedRoutes.add(r)
    usedDrivers.add(d)
    usedVehicles.add(v)
    assignments.push(p)
  }

  const unassigned = routes
    .filter(r => !usedRoutes.has(String(r._id)))
    .map(r => ({
      route: r,
      reason: candidates.length === 0
        ? 'No available drivers'
        : usedDrivers.size >= candidates.length ? 'All available drivers are already assigned' : lastReason.get(String(r._id)) || 'No suitable driver'
    }))

  return { assignments, unassigned }
}
