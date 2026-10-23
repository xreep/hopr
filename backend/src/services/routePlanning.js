import crypto from 'crypto'
import Vehicle from '../models/Vehicle.js'
import User from '../models/User.js'
import TrafficIncident from '../models/TrafficIncident.js'
import { planBatch, optimizeRoute, retimeSequence, OptimizationError } from './routeOptimizer.js'
import { learnedFactors } from './learnedTraffic.js'
import { buildRouteGeometry, isRoadGeometry } from './geometry.js'
import { DEFAULT_DEPOT, MAX_VEHICLES_PER_BATCH } from '../config/fleet.js'

const STOP_FIELDS = [
  'address', 'coordinates', 'customerName', 'customerPhone', 'priority', 'windowStart', 'windowEnd',
  'packageWeightKg', 'packageSize', 'notes'
]

export const randomCode = (prefix, bytes = 4) => `${prefix}-${crypto.randomBytes(bytes).toString('hex').toUpperCase()}`
export const trackingToken = () => crypto.randomBytes(18).toString('base64url')

function pickStop(stop) {
  const out = {}
  for (const key of STOP_FIELDS) if (stop[key] !== undefined && stop[key] !== '') out[key] = stop[key]
  return out
}

export function incidentsForOptimizer(docs) {
  return docs.map(d => ({
    id: d._id.toString(),
    type: d.type,
    label: d.label,
    coordinates: d.coordinates,
    radiusKm: d.radiusKm,
    severity: d.severity
  }))
}

// Turns {vehicleIds} or {vehicleType, vehicleCount} into the optimizer's vehicle list
export async function resolvePlanningVehicles({ vehicleIds, vehicleType = 'van', vehicleCount = 1 }) {
  if (Array.isArray(vehicleIds) && vehicleIds.length) {
    const unique = [...new Set(vehicleIds.map(String))]
    if (unique.length > MAX_VEHICLES_PER_BATCH) {
      throw new OptimizationError(`At most ${MAX_VEHICLES_PER_BATCH} vehicles per batch`, 400)
    }
    const docs = await Vehicle.find({ _id: { $in: unique } })
    if (docs.length !== unique.length) throw new OptimizationError('One or more selected vehicles do not exist', 400)
    const inactive = docs.find(v => v.status !== 'active')
    if (inactive) throw new OptimizationError(`${inactive.name} is ${inactive.status} and cannot be planned`, 400)
    const byId = new Map(docs.map(d => [d._id.toString(), d]))
    return unique.map(id => byId.get(id).toObject())
  }
  return Array.from({ length: vehicleCount }, () => ({ type: vehicleType }))
}

export async function planFromRequest(body) {
  const vehicles = await resolvePlanningVehicles(body)
  const incidents = incidentsForOptimizer(await TrafficIncident.findActive())
  const depot = body.depot?.coordinates ? body.depot : DEFAULT_DEPOT
  const plan = planBatch({
    depot,
    learnedFactors: await learnedFactors(depot.coordinates, body.departureTime || new Date()),
    stops: body.stops.map(pickStop),
    vehicles,
    departureTime: body.departureTime || new Date(),
    trafficEnabled: body.trafficEnabled !== false,
    returnToDepot: Boolean(body.returnToDepot),
    incidents
  })
  plan.incidentsConsidered = incidents.length
  return plan
}

function savingsFrom(result) {
  const optimized = result.alternatives?.find(a => a.key === 'optimized')
  const entered = result.alternatives?.find(a => a.key === 'as_entered')
  if (!optimized || !entered) return undefined
  return {
    distanceKm: Math.round((entered.distanceKm - optimized.distanceKm) * 100) / 100,
    fuelCost: Math.round((entered.fuelCost - optimized.fuelCost) * 100) / 100,
    minutes: entered.totalMinutes - optimized.totalMinutes
  }
}

function plannedFields(result) {
  return {
    plannedStart: result.departureTime,
    returnToDepot: result.returnToDepot,
    trafficEnabled: result.trafficEnabled,
    trafficImpactFactor: result.totals.trafficImpactFactor,
    trafficLevel: result.totals.trafficLevel,
    totalDistance: result.totals.distanceKm,
    estimatedTime: result.totals.totalMinutes,
    fuelType: result.totals.fuel.fuelType,
    fuelUnit: result.totals.fuel.unit,
    fuelEstimate: result.totals.fuel.quantity,
    fuelPrice: result.totals.fuel.unitPrice,
    fuelCost: result.totals.fuel.cost,
    co2Kg: result.totals.fuel.co2Kg,
    loadKg: result.totals.loadKg,
    capacityKg: result.totals.capacityKg,
    violations: result.violations,
    savings: savingsFrom(result),
    alternatives: result.alternatives
  }
}

async function geometryFor(depot, stops, returnToDepot) {
  const points = [depot.coordinates, ...stops.map(s => s.coordinates)]
  if (returnToDepot) points.push(depot.coordinates)
  return buildRouteGeometry(points)
}

// Builds Route documents (not yet saved) from a batch plan
export async function routeDocsFromPlan(plan, { name, createdBy, assignments = [], isDemo = false }) {
  const batchId = randomCode('BATCH', 3)
  const docs = []
  for (const [k, result] of plan.routes.entries()) {
    const assignment = assignments[k] || {}
    const stops = result.stops.map(s => ({
      ...pickStop(s),
      deliveryId: randomCode('DLV', 3),
      sequence: s.sequence,
      estimatedArrival: s.estimatedArrival,
      plannedArrival: s.estimatedArrival,
      windowStatus: s.windowStatus,
      lateByMin: s.lateByMin,
      legDistanceKm: s.legDistanceKm,
      legMinutes: s.legMinutes,
      trackingToken: trackingToken()
    }))
    const geometry = await geometryFor(result.depot, stops, result.returnToDepot)
    docs.push({
      routeId: randomCode('RT', 3),
      batchId,
      name: plan.routes.length > 1 ? `${name || 'Delivery batch'} · Route ${k + 1}` : (name || 'Delivery route'),
      depot: result.depot,
      vehicle: result.vehicle.id || assignment.vehicle || undefined,
      vehicleType: result.vehicle.type,
      driver: assignment.driver || undefined,
      assignedAt: assignment.driver ? new Date() : undefined,
      stops,
      geometry: { type: 'LineString', coordinates: geometry.coordinates },
      geometrySource: geometry.source,
      roadDistanceKm: geometry.distanceKm ?? undefined,
      // Mapbox driving-traffic drive time at planning (live traffic), when Mapbox is on
      liveTrafficDriveMin: geometry.source === 'mapbox' ? geometry.durationMin ?? undefined : undefined,
      createdBy,
      isDemo,
      ...plannedFields(result)
    })
  }
  return { batchId, docs }
}

// Re-times a route's stops in their current order for a vehicle and departure time,
// with today's traffic and active incidents. Returns [stopDoc, timedStop] pairs.
async function retimeStops(route, vehicle, departureTime) {
  const ordered = [...route.stops].sort((a, b) => a.sequence - b.sequence)
  const result = retimeSequence({
    depot: route.depot,
    stops: ordered.map(s => ({ ...pickStop(s.toObject ? s.toObject() : s), _stopId: s._id.toString() })),
    vehicle: vehicle?.toObject ? vehicle.toObject() : (vehicle || { type: route.vehicleType }),
    departureTime,
    trafficEnabled: route.trafficEnabled !== false,
    returnToDepot: Boolean(route.returnToDepot),
    incidents: incidentsForOptimizer(await TrafficIncident.findActive()),
    learnedFactors: await learnedFactors(route.depot?.coordinates, departureTime)
  })
  const byId = new Map(ordered.map(s => [s._id.toString(), s]))
  return { result, pairs: result.stops.map(r => [byId.get(r._stopId), r]) }
}

// When a driver starts a route, forecast every stop from the depot at the real start
// time. Starting early helps stops without a window but never lands a stop before its
// window opens; starting late pushes everything back. Planned ETAs are left as planned.
export async function forecastFromStart(route, now = new Date()) {
  if (!route.stops?.length) return route
  const vehicle = route.vehicle?._id ? route.vehicle : (route.vehicle ? await Vehicle.findById(route.vehicle) : null)
  const { pairs } = await retimeStops(route, vehicle, now)
  for (const [stop, r] of pairs) {
    stop.estimatedArrival = r.estimatedArrival
    stop.windowStatus = r.windowStatus
    stop.lateByMin = r.lateByMin
  }
  return route
}

// Puts a route on a vehicle. A route that is still planned keeps its stop order and
// distance but is re-timed for that vehicle: its speed and time at the door move the
// ETAs and window checks, its fuel type and mileage move fuel cost and CO2. Routes
// already on the road keep their planned figures for planned-vs-actual reporting.
export async function applyVehicle(route, vehicle) {
  route.vehicle = vehicle._id
  route.vehicleType = vehicle.type
  if (route.status !== 'planned' || !route.stops?.length) return route

  const { result, pairs } = await retimeStops(route, vehicle, route.plannedStart || new Date())
  for (const [stop, r] of pairs) {
    stop.estimatedArrival = r.estimatedArrival
    stop.plannedArrival = r.estimatedArrival
    stop.windowStatus = r.windowStatus
    stop.lateByMin = r.lateByMin
    stop.legMinutes = r.legMinutes
  }
  const { fuel } = result.totals
  Object.assign(route, {
    estimatedTime: result.totals.totalMinutes,
    trafficImpactFactor: result.totals.trafficImpactFactor,
    trafficLevel: result.totals.trafficLevel,
    fuelType: fuel.fuelType,
    fuelUnit: fuel.unit,
    fuelEstimate: fuel.quantity,
    fuelPrice: fuel.unitPrice,
    fuelCost: fuel.cost,
    co2Kg: fuel.co2Kg,
    capacityKg: result.totals.capacityKg,
    violations: result.violations
  })
  // Fuel is linear in distance, so the kilometres saved are re-priced for this vehicle
  if (route.savings?.distanceKm != null) {
    route.savings.fuelCost = Math.round(route.savings.distanceKm * fuel.costPerKm * 100) / 100
  }
  return route
}

export async function assertAssignableDriver(driverId) {
  const driver = await User.findOne({ _id: driverId, role: 'driver', isActive: true })
  if (!driver) throw new OptimizationError('Driver not found or inactive', 400)
  return driver
}

// Where the vehicle is now: live GPS, else the last finished stop, else the depot
export function currentPosition(route) {
  if (route.driverLocation?.coordinates?.length === 2) return route.driverLocation.coordinates
  const done = route.stops.filter(s => s.status === 'completed' || s.status === 'failed')
  if (done.length) return done[done.length - 1].coordinates
  return route.depot?.coordinates?.length === 2 ? route.depot.coordinates : DEFAULT_DEPOT.coordinates
}

// Dynamic re-routing: re-sequence the stops still to visit from the current
// position at the current time with today's traffic and active incidents.
export async function recalculateRoute(route, { reason = 'manual', now = new Date() } = {}) {
  const remaining = route.stops.filter(s => s.status === 'pending' || s.status === 'in_progress')
  if (!remaining.length) throw new OptimizationError('No remaining stops to re-optimize', 409)
  const vehicleDoc = route.vehicle?._id ? route.vehicle : (route.vehicle ? await Vehicle.findById(route.vehicle) : null)
  const incidents = incidentsForOptimizer(await TrafficIncident.findActive(now))
  const result = optimizeRoute({
    depot: { name: 'Current position', address: 'Current position', coordinates: currentPosition(route) },
    stops: remaining.map(s => ({ ...pickStop(s.toObject ? s.toObject() : s), _stopId: s._id.toString() })),
    vehicle: vehicleDoc ? vehicleDoc.toObject() : { type: route.vehicleType },
    departureTime: now,
    // Windows stay on the route's own day, so one missed while out on the road shows as late
    windowAnchor: route.plannedStart || route.startedAt || now,
    trafficEnabled: route.trafficEnabled !== false,
    incidents,
    learnedFactors: await learnedFactors(route.depot?.coordinates, now),
    includeAlternatives: false
  })

  const previousFinish = remaining.reduce((max, s) => (s.estimatedArrival > max ? s.estimatedArrival : max), new Date(0))
  const done = route.stops.filter(s => s.status === 'completed' || s.status === 'failed')
  const byId = new Map(remaining.map(s => [s._id.toString(), s]))
  const reordered = result.stops.map((r, i) => {
    const stop = byId.get(r._stopId)
    stop.sequence = done.length + i + 1
    stop.estimatedArrival = r.estimatedArrival
    stop.windowStatus = r.windowStatus
    stop.lateByMin = r.lateByMin
    stop.legDistanceKm = r.legDistanceKm
    stop.legMinutes = r.legMinutes
    return stop
  })
  route.stops = [...done, ...reordered]
  route.violations = result.violations.map(v => ({ ...v, sequence: v.sequence + done.length, message: v.message.replace(/^Stop \d+/, `Stop ${v.sequence + done.length}`) }))
  route.trafficImpactFactor = result.totals.trafficImpactFactor
  route.trafficLevel = result.totals.trafficLevel
  route.needsRecalculation = false
  const newFinish = new Date(result.finishTime)
  route.recalculations.push({ at: now, reason, previousFinish, newFinish })

  const geometry = await geometryFor({ coordinates: currentPosition(route) }, reordered, route.returnToDepot)
  if (!route.driverLocation?.coordinates?.length && done.length === 0) {
    route.geometry = { type: 'LineString', coordinates: geometry.coordinates }
    route.geometrySource = geometry.source
  } else {
    // Keep the travelled part of the polyline, replace the remainder
    const travelled = [route.depot.coordinates, ...done.map(s => s.coordinates)]
    route.geometry = { type: 'LineString', coordinates: [...travelled, ...geometry.coordinates] }
    route.geometrySource = isRoadGeometry(geometry.source) && isRoadGeometry(route.geometrySource) ? geometry.source : 'estimated'
  }
  route.refreshProgress()
  return { route, previousFinish, newFinish, violations: route.violations }
}
