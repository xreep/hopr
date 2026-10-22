// Hopr routing engine.
//
// Single route: a depot plus up to 30 stops. Sequencing minimises an operating
// cost (INR) built from traffic-aware driving time, fuel, missed delivery-window
// penalties and a priority waiting cost. Search:
//   - up to 8 stops: exhaustive branch and bound, so the order is provably optimal
//   - larger routes: two seeded constructions (greedy cheapest-append and earliest-
//     deadline-first), local search (2-opt, Or-opt chains of 1-3 stops, swaps), then
//     iterated local search (double-bridge kicks) until it stops improving or the
//     time budget runs out. Seeded, so the same input always gives the same plan.
// The previous search (constructions + 2-opt + single relocate) is kept as the
// 'baseline' strategy so the benchmark can compare the two.
//
// Batch: stops are split across vehicles with a capacity-aware angular sweep around the
// depot, improved across vehicles (stops moved or swapped between them while the total
// cost drops), then each vehicle's route is optimised.

import { haversineKm, isValidCoordinate, angleFrom } from '../utils/geo.js'
import { formatIST, hhmmToMinutes, istMinutesOfDay, istHour, addMinutes, isHHMM } from '../utils/time.js'
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
function buildContext({ depot, stops, vehicle, departureTime, trafficEnabled, incidents, returnToDepot, fuelPrices, learnedFactors }) {
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
    const at = addMinutes(departure, firstHourStart + h * 60 + 1)
    // The traffic model, corrected by what the fleet's own drives have shown (learnedTraffic.js)
    hourFactors.push(trafficEnabled ? timeOfDayFactor(at) * (learnedFactors?.[istHour(at)] ?? 1) : 1)
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
// `partial` skips the return to the depot: the cost of a prefix is then a lower bound on
// every completion of it (all cost terms only grow), which branch and bound relies on.
function simulate(ctx, order, { detail = false, objective = 'cost', partial = false } = {}) {
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
  if (ctx.returnToDepot && order.length && !partial) {
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

// First-improvement local search. 'baseline' uses 2-opt and single-stop relocation;
// the default also moves chains of 2-3 stops (either way round) and swaps pairs.
function localSearch(ctx, initial, objective, deadline, { extended = true } = {}) {
  let order = [...initial]
  let best = simulate(ctx, order, { objective }).cost
  const n = order.length
  const tryOrder = candidate => {
    const c = simulate(ctx, candidate, { objective }).cost
    if (c < best - 1e-9) {
      order = candidate
      best = c
      return true
    }
    return false
  }
  const maxChain = extended ? Math.min(3, n - 1) : 1
  let improved = true
  while (improved && Date.now() < deadline) {
    improved = false
    // 2-opt: reverse a segment
    for (let i = 0; i < n - 1 && !improved; i++) {
      for (let j = i + 1; j < n && !improved; j++) {
        improved = tryOrder([...order.slice(0, i), ...order.slice(i, j + 1).reverse(), ...order.slice(j + 1)])
      }
    }
    // Or-opt: move a chain of 1..maxChain stops elsewhere, as is or reversed
    for (let len = 1; len <= maxChain && !improved; len++) {
      for (let i = 0; i + len <= n && !improved; i++) {
        const chain = order.slice(i, i + len)
        const rest = [...order.slice(0, i), ...order.slice(i + len)]
        for (let j = 0; j <= rest.length && !improved; j++) {
          if (j === i) continue
          improved = tryOrder([...rest.slice(0, j), ...chain, ...rest.slice(j)]) ||
            (len > 1 && extended && tryOrder([...rest.slice(0, j), ...[...chain].reverse(), ...rest.slice(j)]))
        }
      }
    }
    // Swap two stops
    if (extended) {
      for (let i = 0; i < n - 1 && !improved; i++) {
        for (let j = i + 1; j < n && !improved; j++) {
          const candidate = [...order]
          candidate[i] = order[j]
          candidate[j] = order[i]
          improved = tryOrder(candidate)
        }
      }
    }
  }
  return { order, cost: best }
}

// Routes this small are searched exhaustively (8! = 40,320 orders at most, far fewer
// after pruning), so the answer is the true optimum for the cost model
export const EXACT_MAX_STOPS = 8

function exhaustive(ctx, objective) {
  const n = ctx.stops.length
  const used = new Array(n).fill(false)
  const prefix = []
  let bestOrder = null
  let bestCost = Infinity
  const visit = () => {
    if (prefix.length === n) {
      const { cost } = simulate(ctx, prefix, { objective })
      if (cost < bestCost - 1e-9) {
        bestCost = cost
        bestOrder = [...prefix]
      }
      return
    }
    for (let i = 0; i < n; i++) {
      if (used[i]) continue
      prefix.push(i)
      // Every cost term only grows as stops are added: a prefix that already costs
      // more than the best full route cannot lead to a better one
      if (simulate(ctx, prefix, { objective, partial: true }).cost < bestCost - 1e-9) {
        used[i] = true
        visit()
        used[i] = false
      }
      prefix.pop()
    }
  }
  visit()
  return { order: bestOrder, cost: bestCost }
}

// Small deterministic random generator, so a plan never changes between runs
function mulberry32(seed) {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

// Kicks that move the search out of a local optimum. Double bridge: cut the order into
// four pieces A B C D and rejoin as A C B D, which local search cannot undo in one move.
// Alternated with a random segment reversal plus a random relocation, which suits
// short routes better.
function kick(order, rng, k) {
  if (k % 2 === 1 || order.length < 8) {
    const out = [...order]
    const i = Math.floor(rng() * out.length)
    const j = Math.floor(rng() * out.length)
    const [a, b] = i < j ? [i, j] : [j, i]
    out.splice(a, b - a + 1, ...out.slice(a, b + 1).reverse())
    const [moved] = out.splice(Math.floor(rng() * out.length), 1)
    out.splice(Math.floor(rng() * (out.length + 1)), 0, moved)
    return out
  }
  return doubleBridge(order, rng)
}

function doubleBridge(order, rng) {
  const n = order.length
  const cuts = [1 + Math.floor(rng() * (n - 3))]
  cuts.push(cuts[0] + 1 + Math.floor(rng() * (n - cuts[0] - 2)))
  cuts.push(cuts[1] + 1 + Math.floor(rng() * (n - cuts[1] - 1)))
  const [a, b, c] = cuts
  return [...order.slice(0, a), ...order.slice(b, c), ...order.slice(a, b), ...order.slice(c)]
}

function searchBestOrder(ctx, objective, deadline, { strategy = 'ils' } = {}) {
  const n = ctx.stops.length
  if (strategy === 'exact' || (strategy !== 'baseline' && n <= EXACT_MAX_STOPS)) return exhaustive(ctx, objective).order

  const extended = strategy !== 'baseline'
  const seeds = objective === 'distance'
    ? [greedyAppend(ctx, 'distance')]
    : [greedyAppend(ctx, objective), earliestDeadlineFirst(ctx)]
  let best = null
  for (const seed of seeds) {
    const result = localSearch(ctx, seed, objective, deadline, { extended })
    if (!best || result.cost < best.cost - 1e-9) best = result
  }
  if (strategy === 'baseline') return best.order

  // Iterated local search: kick the best order, improve it again, keep it if better.
  // Stops after enough kicks in a row find nothing, or at the deadline.
  const rng = mulberry32(n * 7919 + Math.round(best.cost))
  const patience = 30 + 2 * n
  let misses = 0
  for (let k = 0; k < 60 + 10 * n && misses < patience && Date.now() < deadline; k++) {
    const result = localSearch(ctx, kick(best.order, rng, k), objective, deadline, { extended })
    if (result.cost < best.cost - 1e-9) {
      best = result
      misses = 0
    } else {
      misses++
    }
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
  includeAlternatives = true,
  strategy = 'ils',
  learnedFactors = null
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
    fuelPrices,
    learnedFactors
  })
  const deadline = computeStarted + timeBudgetMs
  const order = searchBestOrder(ctx, 'cost', deadline, { strategy })

  let alternatives = []
  if (includeAlternatives) {
    const shortest = searchBestOrder(ctx, 'distance', deadline + timeBudgetMs, { strategy })
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

// The best visiting order a strategy finds, and its cost: 'ils' (what planning uses),
// 'baseline' (the previous search) or 'exact' (exhaustive; slow beyond ~10 stops).
// Used by the benchmark and the tests.
export function bestSequence({
  depot, stops, vehicle, departureTime, trafficEnabled = true, incidents = [], returnToDepot = false,
  fuelPrices = defaultFuelPrices()
}, { strategy = 'ils', objective = 'cost', timeBudgetMs = OPTIMIZER_TIME_BUDGET_MS } = {}) {
  const started = Date.now()
  const ctx = buildContext({
    depot: resolveDepot(depot), stops: normalizeStops(stops), vehicle: resolveVehicle(vehicle),
    departureTime, trafficEnabled, incidents, returnToDepot, fuelPrices
  })
  const order = searchBestOrder(ctx, objective, started + timeBudgetMs, { strategy })
  return { sequence: order, cost: simulate(ctx, order, { objective }).cost, ms: Date.now() - started }
}

// Full result (ETAs, windows, fuel) for a fixed visiting order. Used when a planned
// route is handed to a different vehicle: same stops and distance, new timings and fuel.
export function retimeSequence({
  depot, stops, vehicle, departureTime, trafficEnabled = true, incidents = [], returnToDepot = false,
  fuelPrices = defaultFuelPrices(), learnedFactors = null
}, sequence = stops.map((_, i) => i)) {
  const computeStarted = Date.now()
  const ctx = buildContext({
    depot: resolveDepot(depot), stops: normalizeStops(stops), vehicle: resolveVehicle(vehicle),
    departureTime, trafficEnabled, incidents, returnToDepot, fuelPrices, learnedFactors
  })
  return buildResult(ctx, sequence, { alternatives: [], computeStarted })
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
// Of which: moving stops between vehicles after the sweep split
export const INTER_ROUTE_BUDGET_MS = 2000

// Quick order for a subset of stops: greedy cheapest append, then local search
function orderSubset(ctx, indices, deadline) {
  const left = new Set(indices)
  const order = []
  while (left.size) {
    let best = -1
    let bestCost = Infinity
    for (const c of left) {
      order.push(c)
      const { cost } = simulate(ctx, order)
      order.pop()
      if (cost < bestCost - 1e-9) {
        bestCost = cost
        best = c
      }
    }
    order.push(best)
    left.delete(best)
  }
  return localSearch(ctx, order, 'cost', deadline, { extended: false })
}

// Cheapest place to put stop s into an order
function bestInsertion(ctx, order, s) {
  let best = { cost: Infinity, order: null }
  for (let p = 0; p <= order.length; p++) {
    const candidate = [...order.slice(0, p), s, ...order.slice(p)]
    const { cost } = simulate(ctx, candidate)
    if (cost < best.cost - 1e-9) best = { cost, order: candidate }
  }
  return best
}

// Cluster first, then improve across routes: move a stop to another vehicle, or swap two
// stops between vehicles, whenever the combined cost of the two routes drops. Each
// vehicle gets a context over all the batch's stops, so any stop can be priced in any
// vehicle; capacity and the per-route stop limit always hold. A vehicle can end up empty,
// which means the batch needs one vehicle fewer.
function improveAcrossRoutes(contexts, clusters, weights, deadline) {
  const routes = clusters.map((c, k) => (c.length ? orderSubset(contexts[k], c, deadline) : { order: [], cost: 0 }))
  const load = routes.map(r => r.order.reduce((sum, i) => sum + weights[i], 0))
  const fits = (k, extraKg, extraStops = 1) => routes[k].order.length + extraStops <= MAX_STOPS_PER_ROUTE && load[k] + extraKg <= contexts[k].vehicle.capacityKg
  const without = (k, i) => {
    const order = routes[k].order.filter(x => x !== i)
    return { order, cost: simulate(contexts[k], order).cost }
  }
  let moved = 0
  let improved = true
  while (improved && Date.now() < deadline) {
    improved = false
    // Relocate one stop
    for (let a = 0; a < routes.length && !improved; a++) {
      for (const i of routes[a].order) {
        if (improved || Date.now() >= deadline) break
        const fromA = without(a, i)
        for (let b = 0; b < routes.length && !improved; b++) {
          if (b === a || !fits(b, weights[i])) continue
          const intoB = bestInsertion(contexts[b], routes[b].order, i)
          if (fromA.cost + intoB.cost < routes[a].cost + routes[b].cost - 1e-6) {
            routes[a] = fromA
            routes[b] = intoB
            load[a] -= weights[i]
            load[b] += weights[i]
            moved++
            improved = true
          }
        }
      }
    }
    // Swap two stops between vehicles
    for (let a = 0; a < routes.length && !improved; a++) {
      for (let b = a + 1; b < routes.length && !improved; b++) {
        for (const i of routes[a].order) {
          if (improved || Date.now() >= deadline) break
          for (const j of routes[b].order) {
            const dA = weights[j] - weights[i]
            if (load[a] + dA > contexts[a].vehicle.capacityKg || load[b] - dA > contexts[b].vehicle.capacityKg) continue
            const intoA = bestInsertion(contexts[a], routes[a].order.filter(x => x !== i), j)
            const intoB = bestInsertion(contexts[b], routes[b].order.filter(x => x !== j), i)
            if (intoA.cost + intoB.cost < routes[a].cost + routes[b].cost - 1e-6) {
              routes[a] = intoA
              routes[b] = intoB
              load[a] += dA
              load[b] -= dA
              moved++
              improved = true
              break
            }
          }
        }
      }
    }
  }
  return { clusters: routes.map(r => r.order), moved }
}

export function planBatch({ depot, stops, vehicles, interRoute = true, ...options } = {}) {
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

  let clusters = vehicles.length === 1
    ? [normalized.map((_, i) => i)]
    : partitionStops(resolvedDepot, normalized, resolvedVehicles)

  const sweepClusters = clusters
  let movedBetweenRoutes = 0
  if (interRoute && vehicles.length > 1) {
    const contexts = resolvedVehicles.map(vehicle => buildContext({
      depot: resolvedDepot,
      stops: normalized,
      vehicle,
      departureTime: options.departureTime,
      trafficEnabled: options.trafficEnabled ?? true,
      incidents: options.incidents || [],
      returnToDepot: options.returnToDepot || false,
      fuelPrices: options.fuelPrices || defaultFuelPrices(),
      learnedFactors: options.learnedFactors
    }))
    const result = improveAcrossRoutes(contexts, clusters, normalized.map(s => s.packageWeightKg), Date.now() + INTER_ROUTE_BUDGET_MS)
    clusters = result.clusters
    movedBetweenRoutes = result.moved
  }

  // Vehicles whose stops changed are also optimised with their original stops, so the
  // batch keeps whichever split the full search makes cheaper: never worse than the sweep
  const sameStops = (a, b) => a.length === b.length && a.every(i => b.includes(i))
  const changed = clusters.map((c, k) => !sameStops(c, sweepClusters[k]))
  const searches = clusters.filter(c => c.length).length + changed.filter(Boolean).length || 1
  // Each search gets an equal share of what is left of the batch budget (search + alternatives)
  const remaining = Math.max(1000, BATCH_TIME_BUDGET_MS - (Date.now() - computeStarted))
  const perRouteBudget = Math.min(OPTIMIZER_TIME_BUDGET_MS, Math.floor(remaining / searches / 2))
  const solve = (indices, k, extra = {}) => (indices.length
    ? optimizeRoute({ timeBudgetMs: perRouteBudget, ...options, ...extra, depot: resolvedDepot, vehicle: vehicles[k], stops: indices.map(i => normalized[i]) })
    : null)
  const costOf = results => results.reduce((sum, r) => sum + (r ? r.totals.operatingCost : 0), 0)

  let results = clusters.map((c, k) => solve(c, k))
  if (changed.some(Boolean)) {
    const keys = changed.flatMap((c, k) => (c ? [k] : []))
    const sweepResults = keys.map(k => solve(sweepClusters[k], k, { includeAlternatives: false }))
    if (costOf(sweepResults) < costOf(keys.map(k => results[k])) - 1e-6) {
      keys.forEach((k, n) => {
        results[k] = options.includeAlternatives === false ? sweepResults[n] : solve(sweepClusters[k], k)
      })
      clusters = sweepClusters
      movedBetweenRoutes = 0
    }
  }
  const routes = results.filter(Boolean)

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
      violations: routes.reduce((acc, r) => acc + r.violations.length, 0),
      operatingCost: routes.reduce((acc, r) => acc + r.totals.operatingCost, 0),
      movedBetweenRoutes
    },
    computeMs: Date.now() - computeStarted
  }
}

export default { optimizeRoute, planBatch, partitionStops, resolveVehicle, normalizeStops, evaluateSequence, retimeSequence, bestSequence }
