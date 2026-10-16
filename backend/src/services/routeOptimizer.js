// Hopr routing engine.
//
// Single route: a depot plus up to 30 stops. Sequencing minimises an operating
// cost (INR) built from traffic-aware driving time, fuel, missed delivery-window
// penalties and a priority waiting cost. Search = two seeded constructions
// (greedy cheapest-append and earliest-deadline-first) improved with 2-opt and
// Or-opt (relocate) local search under a time budget.
//
// Batch: stops are split across vehicles with a capacity-aware angular sweep
// around the depot, then each vehicle's route is optimised independently.

import { haversineKm, isValidCoordinate, angleFrom } from '../utils/geo.js'
import { formatIST, hhmmToMinutes, istMinutesOfDay, addMinutes, isHHMM } from '../utils/time.js'
import { timeOfDayFactor, legIncidentEffect, trafficLevel } from './traffic.js'
import { estimateFuel } from './fuel.js'
import {
  VEHICLE_PROFILES, ROAD_CIRCUITY, MAX_STOPS_PER_ROUTE, MAX_STOPS_PER_BATCH, MAX_VEHICLES_PER_BATCH,
  DEFAULT_DEPOT, DRIVER_COST_PER_MIN, LATE_PENALTY_PER_MIN, PRIORITY_WAIT_COST, OPTIMIZER_TIME_BUDGET_MS,
  defaultFuelPrices
} from '../config/fleet.js'

export class OptimizationError extends Error {
  constructor(message, status = 422) {
    super(message)
    this.name = 'OptimizationError'
    this.status = status
  }
}

const round = (n, d = 1) => Math.round(n * 10 ** d) / 10 ** d

export function resolveVehicle(vehicle = {}) {
  const type = vehicle.type || 'van'
  const profile = VEHICLE_PROFILES[type]
  if (!profile) throw new OptimizationError(`Unknown vehicle type "${type}"`, 400)
  const capacity = Number(vehicle.capacity ?? vehicle.capacityKg)
  const mileage = Number(vehicle.mileage)
  return {
    id: vehicle._id?.toString?.() ?? vehicle.id ?? null,
    name: vehicle.name || profile.label,
    vehicleId: vehicle.vehicleId ?? null,
    type,
    fuelType: vehicle.fuelType || profile.fuelType,
    mileage: mileage > 0 ? mileage : profile.mileage,
    capacityKg: capacity > 0 ? capacity : profile.capacityKg,
    speedKmh: profile.speedKmh,
    serviceMin: profile.serviceMin
  }
}

function resolveDepot(depot) {
  const d = depot && isValidCoordinate(depot.coordinates) ? depot : DEFAULT_DEPOT
  return { name: d.name || 'Depot', address: d.address || d.name || 'Depot', coordinates: [...d.coordinates] }
}

export function normalizeStops(stops, { maxStops = MAX_STOPS_PER_ROUTE } = {}) {
  if (!Array.isArray(stops) || stops.length < 1) {
    throw new OptimizationError('At least 1 delivery stop is required', 400)
  }
  if (stops.length > maxStops) {
    throw new OptimizationError(
      maxStops === MAX_STOPS_PER_ROUTE
        ? `A route can have at most ${MAX_STOPS_PER_ROUTE} stops (got ${stops.length}). Add vehicles to split the batch.`
        : `A batch can have at most ${maxStops} stops (got ${stops.length}).`,
      400
    )
  }
  return stops.map((stop, i) => {
    const coordinates = Array.isArray(stop.coordinates) ? stop.coordinates.map(Number) : null
    if (!isValidCoordinate(coordinates)) {
      throw new OptimizationError(`Stop ${i + 1} (${stop.address || 'no address'}) has invalid coordinates`, 400)
    }
    for (const key of ['windowStart', 'windowEnd']) {
      if (stop[key] && !isHHMM(stop[key])) {
        throw new OptimizationError(`Stop ${i + 1}: ${key} must be HH:MM (24h)`, 400)
      }
    }
    if (stop.windowStart && stop.windowEnd && hhmmToMinutes(stop.windowEnd) <= hhmmToMinutes(stop.windowStart)) {
      throw new OptimizationError(`Stop ${i + 1}: delivery window must end after it starts`, 400)
    }
    return {
      ...stop,
      coordinates,
      inputIndex: stop.inputIndex ?? i,
      priority: Object.hasOwn(PRIORITY_WAIT_COST, stop.priority) ? stop.priority : 'standard',
      packageWeightKg: Math.max(0, Number(stop.packageWeightKg) || 0),
      windowStart: stop.windowStart || null,
      windowEnd: stop.windowEnd || null
    }
  })
}

// Precomputes everything the simulation needs so the local search inner loop is cheap.
function buildContext({ depot, stops, vehicle, departureTime, trafficEnabled, incidents, returnToDepot, fuelPrices }) {
  const points = [depot.coordinates, ...stops.map(s => s.coordinates)]
  const n = points.length
  const closures = (incidents || []).filter(i => i.type === 'closure')
  const congestion = trafficEnabled ? (incidents || []).filter(i => i.type !== 'closure') : []

  const km = Array.from({ length: n }, () => new Float64Array(n))
  const incidentFactor = Array.from({ length: n }, () => new Float64Array(n).fill(1))
  const incidentHits = Array.from({ length: n }, () => new Array(n))
  for (let i = 0; i < n; i++) {
    for (let j = 0; j < n; j++) {
      if (i === j) continue
      const base = haversineKm(points[i], points[j]) * ROAD_CIRCUITY
      const closure = legIncidentEffect(points[i], points[j], closures)
      const jam = legIncidentEffect(points[i], points[j], congestion)
      km[i][j] = base + closure.extraKm
      incidentFactor[i][j] = closure.timeFactor * jam.timeFactor
      const hits = [...closure.incidents, ...jam.incidents]
      if (hits.length) incidentHits[i][j] = hits
    }
  }

  const departure = new Date(departureTime ?? Date.now())
  if (Number.isNaN(departure.getTime())) throw new OptimizationError('Invalid departure time', 400)
  const depMinOfDay = istMinutesOfDay(departure)

  // Time-of-day traffic factor for each hour after departure (minute offset -> hour slot)
  const hourFactors = []
  const firstHourStart = -(depMinOfDay % 60)
  for (let h = 0; h < 72; h++) {
    hourFactors.push(trafficEnabled ? timeOfDayFactor(addMinutes(departure, firstHourStart + h * 60 + 1)) : 1)
  }
  const factorAt = t => hourFactors[Math.min(71, Math.max(0, Math.floor((t - firstHourStart) / 60)))]

  const windows = stops.map(s => ({
    start: s.windowStart ? hhmmToMinutes(s.windowStart) - depMinOfDay : null,
    end: s.windowEnd ? hhmmToMinutes(s.windowEnd) - depMinOfDay : null
  }))

  const fuelProbe = estimateFuel(1, vehicle, fuelPrices)
  return {
    depot, stops, vehicle, departure, trafficEnabled, returnToDepot, fuelPrices,
    km, incidentFactor, incidentHits, factorAt, windows,
    fuelCostPerKm: fuelProbe.cost
  }
}

// Walks a visiting order (indices into ctx.stops, 0-based) and returns cost + metrics.
function simulate(ctx, order, { detail = false, objective = 'cost' } = {}) {
  const { km, incidentFactor, factorAt, windows, vehicle, stops } = ctx
  let t = 0
  let prev = 0
  let distance = 0
  let drive = 0
  let freeFlow = 0
  let wait = 0
  let service = 0
  let late = 0
  let priorityCost = 0
  const legs = detail ? [] : null

  const travel = (from, to) => {
    const legKm = km[from][to]
    const baseMin = (legKm / vehicle.speedKmh) * 60
    const factor = factorAt(t) * incidentFactor[from][to]
    return { legKm, baseMin, legMin: baseMin * factor, factor }
  }

  for (const s of order) {
    const node = s + 1
    const { legKm, baseMin, legMin, factor } = travel(prev, node)
    distance += legKm
    drive += legMin
    freeFlow += baseMin
    const arrival = t + legMin
    const w = windows[s]
    let start = arrival
    let waitMin = 0
    if (w.start !== null && arrival < w.start) {
      waitMin = w.start - arrival
      start = w.start
    }
    const lateMin = w.end !== null && arrival > w.end ? arrival - w.end : 0
    wait += waitMin
    late += lateMin
    priorityCost += PRIORITY_WAIT_COST[stops[s].priority] * arrival
    const serviceMin = stops[s].serviceMin ?? vehicle.serviceMin
    service += serviceMin
    if (detail) {
      legs.push({
        stop: s, legKm, legMin, factor, arrival, waitMin, lateMin, serviceMin,
        incidents: ctx.incidentHits[prev][node] || []
      })
    }
    t = start + serviceMin
    prev = node
  }

  let returnLeg = null
  if (ctx.returnToDepot && order.length) {
    const { legKm, baseMin, legMin, factor } = travel(prev, 0)
    distance += legKm
    drive += legMin
    freeFlow += baseMin
    t += legMin
    returnLeg = { legKm, legMin, factor }
  }

  const cost = objective === 'distance'
    ? distance
    : (drive + wait) * DRIVER_COST_PER_MIN + distance * ctx.fuelCostPerKm + late * LATE_PENALTY_PER_MIN + priorityCost

  return { cost, distance, drive, freeFlow, wait, service, late, totalMinutes: t, legs, returnLeg }
}

function greedyAppend(ctx, objective) {
  const remaining = new Set(ctx.stops.map((_, i) => i))
  const order = []
  while (remaining.size) {
    let best = -1
    let bestCost = Infinity
    for (const c of remaining) {
      order.push(c)
      const { cost } = simulate(ctx, order, { objective })
      order.pop()
      if (cost < bestCost - 1e-9) {
        bestCost = cost
        best = c
      }
    }
    order.push(best)
    remaining.delete(best)
  }
  return order
}

function earliestDeadlineFirst(ctx) {
  const depot = ctx.depot.coordinates
  return ctx.stops
    .map((s, i) => ({ i, end: ctx.windows[i].end ?? Infinity, p: PRIORITY_WAIT_COST[s.priority], d: haversineKm(depot, s.coordinates) }))
    .sort((a, b) => a.end - b.end || b.p - a.p || a.d - b.d)
    .map(x => x.i)
}

function localSearch(ctx, initial, objective, deadline) {
  let order = [...initial]
  let best = simulate(ctx, order, { objective }).cost
  const n = order.length
  let improved = true
  while (improved && Date.now() < deadline) {
    improved = false
    // 2-opt: reverse a segment
    for (let i = 0; i < n - 1 && !improved; i++) {
      for (let j = i + 1; j < n; j++) {
        const candidate = [...order.slice(0, i), ...order.slice(i, j + 1).reverse(), ...order.slice(j + 1)]
        const c = simulate(ctx, candidate, { objective }).cost
        if (c < best - 1e-9) {
          order = candidate
          best = c
          improved = true
          break
        }
      }
    }
    // Or-opt: relocate a single stop
    for (let i = 0; i < n && !improved; i++) {
      for (let j = 0; j < n; j++) {
        if (i === j) continue
        const candidate = [...order]
        const [moved] = candidate.splice(i, 1)
        candidate.splice(j, 0, moved)
        const c = simulate(ctx, candidate, { objective }).cost
        if (c < best - 1e-9) {
          order = candidate
          best = c
          improved = true
          break
        }
      }
    }
  }
  return { order, cost: best }
}

function searchBestOrder(ctx, objective, deadline) {
  const seeds = objective === 'distance'
    ? [greedyAppend(ctx, 'distance')]
    : [greedyAppend(ctx, objective), earliestDeadlineFirst(ctx)]
  let best = null
  for (const seed of seeds) {
    const result = localSearch(ctx, seed, objective, deadline)
    if (!best || result.cost < best.cost - 1e-9) best = result
  }
  return best.order
}

function summarize(ctx, order, label, key) {
  const sim = simulate(ctx, order, { detail: true })
  const fuel = estimateFuel(sim.distance, ctx.vehicle, ctx.fuelPrices)
  return {
    key,
    label,
    sequence: order.map(i => ctx.stops[i].inputIndex),
    distanceKm: round(sim.distance, 2),
    totalMinutes: Math.round(sim.totalMinutes),
    driveMinutes: Math.round(sim.drive),
    fuelCost: fuel.cost,
    fuelQuantity: fuel.quantity,
    fuelUnit: fuel.unit,
    co2Kg: fuel.co2Kg,
    lateStops: sim.legs.filter(l => l.lateMin > 0.5).length,
    operatingCost: Math.round(sim.cost)
  }
}

function buildResult(ctx, order, { alternatives, computeStarted }) {
  const sim = simulate(ctx, order, { detail: true })
  const { departure, vehicle, stops } = ctx
  const fuel = estimateFuel(sim.distance, vehicle, ctx.fuelPrices)
  const violations = []

  const orderedStops = sim.legs.map((leg, seq) => {
    const stop = stops[leg.stop]
    const eta = addMinutes(departure, leg.arrival)
    const lateByMin = Math.round(leg.lateMin)
    let windowStatus = 'none'
    if (stop.windowStart || stop.windowEnd) {
      windowStatus = lateByMin > 0 ? 'late' : leg.waitMin > 0.5 ? 'early' : 'on_time'
    }
    if (lateByMin > 0) {
      violations.push({
        sequence: seq + 1,
        address: stop.address,
        eta: eta.toISOString(),
        windowEnd: stop.windowEnd,
        lateByMin,
        message: `Stop ${seq + 1} ETA ${formatIST(eta)}, window ends ${stop.windowEnd}`
      })
    }
    return {
      ...stop,
      sequence: seq + 1,
      estimatedArrival: eta.toISOString(),
      etaLabel: formatIST(eta),
      legDistanceKm: round(leg.legKm, 2),
      legMinutes: round(leg.legMin, 1),
      trafficFactor: round(leg.factor, 2),
      trafficLevel: trafficLevel(leg.factor),
      waitMinutes: Math.round(leg.waitMin),
      lateByMin,
      windowStatus,
      incidents: leg.incidents
    }
  })

  const loadKg = stops.reduce((sum, s) => sum + s.packageWeightKg, 0)
  const trafficImpactFactor = sim.freeFlow > 0 ? sim.drive / sim.freeFlow : 1
  const finish = addMinutes(departure, sim.totalMinutes)

  return {
    depot: ctx.depot,
    vehicle,
    departureTime: departure.toISOString(),
    finishTime: finish.toISOString(),
    stops: orderedStops,
    sequence: order.map(i => stops[i].inputIndex),
    returnToDepot: ctx.returnToDepot,
    trafficEnabled: ctx.trafficEnabled,
    totals: {
      distanceKm: round(sim.distance, 2),
      driveMinutes: Math.round(sim.drive),
      waitMinutes: Math.round(sim.wait),
      serviceMinutes: Math.round(sim.service),
      totalMinutes: Math.round(sim.totalMinutes),
      trafficImpactFactor: round(trafficImpactFactor, 2),
      trafficLevel: trafficLevel(trafficImpactFactor),
      fuel,
      loadKg: round(loadKg, 1),
      capacityKg: vehicle.capacityKg,
      utilizationPct: vehicle.capacityKg > 0 ? round((loadKg / vehicle.capacityKg) * 100, 1) : 0,
      operatingCost: Math.round(sim.cost)
    },
    capacityExceeded: loadKg > vehicle.capacityKg,
    violations,
    alternatives,
    vehicleComparison: Object.entries(VEHICLE_PROFILES).map(([type, profile]) => {
      const f = estimateFuel(sim.distance, { fuelType: profile.fuelType, mileage: profile.mileage }, ctx.fuelPrices)
      return {
        type,
        label: profile.label,
        fuelType: profile.fuelType,
        quantity: f.quantity,
        unit: f.unit,
        cost: f.cost,
        co2Kg: f.co2Kg,
        capacityKg: profile.capacityKg,
        fitsLoad: loadKg <= profile.capacityKg,
        estMinutes: Math.round(sim.drive * (vehicle.speedKmh / profile.speedKmh) + stops.length * profile.serviceMin + sim.wait)
      }
    }),
    computeMs: Date.now() - computeStarted
  }
}

export function optimizeRoute({
  depot,
  stops,
  vehicle,
  departureTime,
  trafficEnabled = true,
  incidents = [],
  returnToDepot = false,
  fuelPrices = defaultFuelPrices(),
  timeBudgetMs = OPTIMIZER_TIME_BUDGET_MS,
  includeAlternatives = true
} = {}) {
  const computeStarted = Date.now()
  const normalized = normalizeStops(stops)
  const ctx = buildContext({
    depot: resolveDepot(depot),
    stops: normalized,
    vehicle: resolveVehicle(vehicle),
    departureTime,
    trafficEnabled,
    incidents,
    returnToDepot,
    fuelPrices
  })
  const deadline = computeStarted + timeBudgetMs
  const order = searchBestOrder(ctx, 'cost', deadline)

  let alternatives = []
  if (includeAlternatives) {
    const shortest = searchBestOrder(ctx, 'distance', deadline + timeBudgetMs)
    const asEntered = normalized.map((_, i) => i)
    alternatives = [
      summarize(ctx, order, 'Hopr optimized (traffic, windows, priority, fuel)', 'optimized'),
      summarize(ctx, shortest, 'Shortest distance only', 'shortest'),
      summarize(ctx, asEntered, 'Order as entered', 'as_entered')
    ]
  }
  return buildResult(ctx, order, { alternatives, computeStarted })
}

// Cost and metrics of a caller-chosen visiting order (stop input indices).
// Used to score "as entered" plans and to verify optimality in tests.
export function evaluateSequence({
  depot, stops, vehicle, departureTime, trafficEnabled = true, incidents = [], returnToDepot = false,
  fuelPrices = defaultFuelPrices()
}, sequence, { objective = 'cost' } = {}) {
  const normalized = normalizeStops(stops)
  const ctx = buildContext({
    depot: resolveDepot(depot), stops: normalized, vehicle: resolveVehicle(vehicle),
    departureTime, trafficEnabled, incidents, returnToDepot, fuelPrices
  })
  const sim = simulate(ctx, sequence, { objective })
  return { cost: sim.cost, distanceKm: sim.distance, totalMinutes: sim.totalMinutes, lateMinutes: sim.late }
}

// Assigns stops to vehicles: sort by angle around the depot starting after the
// widest empty sector, then fill vehicles in turn up to an even share of stops
// without exceeding each vehicle's capacity or the per-route stop limit.
export function partitionStops(depot, stops, vehicles) {
  const centre = depot.coordinates
  const withAngle = stops.map((s, i) => ({ i, angle: angleFrom(centre, s.coordinates), w: s.packageWeightKg }))
    .sort((a, b) => a.angle - b.angle || a.i - b.i)

  if (withAngle.length > 1) {
    let gapIdx = 0
    let maxGap = -1
    for (let k = 0; k < withAngle.length; k++) {
      const next = withAngle[(k + 1) % withAngle.length]
      const gap = (next.angle - withAngle[k].angle + 360) % 360 || (k === withAngle.length - 1 ? 360 : 0)
      if (gap > maxGap) {
        maxGap = gap
        gapIdx = k
      }
    }
    withAngle.push(...withAngle.splice(0, gapIdx + 1))
  }

  const K = vehicles.length
  const target = Math.min(MAX_STOPS_PER_ROUTE, Math.ceil(stops.length / K))
  const clusters = vehicles.map(() => ({ items: [], load: 0 }))
  const leftovers = []
  let v = 0
  for (const item of withAngle) {
    // Move to the next vehicle once this one has its share, or cannot take the item.
    // The last vehicle never advances; anything it cannot take becomes a leftover.
    while (v < K - 1 && (clusters[v].items.length >= target ||
      (clusters[v].items.length > 0 && clusters[v].load + item.w > vehicles[v].capacityKg))) {
      v++
    }
    if (clusters[v].items.length < MAX_STOPS_PER_ROUTE && clusters[v].load + item.w <= vehicles[v].capacityKg) {
      clusters[v].items.push(item.i)
      clusters[v].load += item.w
    } else {
      leftovers.push(item)
    }
  }

  // Place anything that did not fit in sweep order into any vehicle with room
  for (const item of leftovers) {
    const candidates = clusters
      .map((c, k) => ({ c, k }))
      .filter(({ c, k }) => c.items.length < MAX_STOPS_PER_ROUTE && c.load + item.w <= vehicles[k].capacityKg)
      .sort((a, b) => (vehicles[b.k].capacityKg - b.c.load) - (vehicles[a.k].capacityKg - a.c.load))
    if (!candidates.length) {
      throw new OptimizationError('The selected vehicles do not have enough capacity or stop slots for this batch. Add a vehicle or a larger one.')
    }
    candidates[0].c.items.push(item.i)
    candidates[0].c.load += item.w
  }

  return clusters.map(c => c.items)
}

// Total search budget for a whole batch, so batch planning stays well under 10 s
export const BATCH_TIME_BUDGET_MS = 7000

export function planBatch({ depot, stops, vehicles, ...options } = {}) {
  const computeStarted = Date.now()
  if (!Array.isArray(vehicles) || vehicles.length < 1) {
    throw new OptimizationError('Select at least one vehicle', 400)
  }
  if (vehicles.length > MAX_VEHICLES_PER_BATCH) {
    throw new OptimizationError(`At most ${MAX_VEHICLES_PER_BATCH} vehicles per batch`, 400)
  }
  const resolvedDepot = resolveDepot(depot)
  const resolvedVehicles = vehicles.map(resolveVehicle)
  const normalized = normalizeStops(stops, { maxStops: Math.min(MAX_STOPS_PER_BATCH, MAX_STOPS_PER_ROUTE * vehicles.length) })

  const totalLoad = normalized.reduce((sum, s) => sum + s.packageWeightKg, 0)
  const totalCapacity = resolvedVehicles.reduce((sum, v) => sum + v.capacityKg, 0)
  if (totalLoad > totalCapacity) {
    throw new OptimizationError(`Total load ${round(totalLoad)} kg exceeds fleet capacity ${totalCapacity} kg. Add a vehicle or a larger one.`)
  }

  const clusters = vehicles.length === 1
    ? [normalized.map((_, i) => i)]
    : partitionStops(resolvedDepot, normalized, resolvedVehicles)

  const routes = []
  const nonEmpty = clusters.filter(c => c.length).length || 1
  // Each route gets an equal share of the batch budget (search + alternatives)
  const perRouteBudget = Math.min(OPTIMIZER_TIME_BUDGET_MS, Math.floor(BATCH_TIME_BUDGET_MS / nonEmpty / 2))
  clusters.forEach((indices, k) => {
    if (!indices.length) return
    routes.push(optimizeRoute({
      timeBudgetMs: perRouteBudget,
      ...options,
      depot: resolvedDepot,
      vehicle: vehicles[k],
      stops: indices.map(i => normalized[i])
    }))
  })

  const sum = key => round(routes.reduce((acc, r) => acc + r.totals[key], 0), 2)
  return {
    routes,
    totals: {
      routes: routes.length,
      stops: normalized.length,
      distanceKm: sum('distanceKm'),
      totalMinutes: routes.reduce((max, r) => Math.max(max, r.totals.totalMinutes), 0),
      fuelCost: round(routes.reduce((acc, r) => acc + r.totals.fuel.cost, 0), 2),
      co2Kg: round(routes.reduce((acc, r) => acc + r.totals.fuel.co2Kg, 0), 2),
      violations: routes.reduce((acc, r) => acc + r.violations.length, 0)
    },
    computeMs: Date.now() - computeStarted
  }
}

export default { optimizeRoute, planBatch, partitionStops, resolveVehicle, normalizeStops, evaluateSequence }
