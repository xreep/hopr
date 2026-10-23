// Demo morning: drives demo routes along their planned roads, faster than real time, so
// the dashboard, live monitor and customer tracking links can be watched working without
// anyone holding a phone. Only routes flagged isDemo are ever simulated.
//
// State is derived from the clock (start time x speed-up), not stored per tick, so a
// restarted server picks up exactly where the drive should be.
import Route from '../models/Route.js'
import User from '../models/User.js'
import { haversineKm, pointToSegment } from '../utils/geo.js'
import { VEHICLE_PROFILES } from '../config/fleet.js'
import { timeOfDayFactor } from './traffic.js'
import { pointAt, lengthKm } from './tracking.js'
import { recordCompletion } from '../routes/routes.js'

export const SIM_SPEEDUP = 20
export const SIM_TICK_MS = 2000
export const SIM_PROOF_NOTE = 'Demo delivery (simulated)'

const open = s => s.status === 'pending' || s.status === 'in_progress'

// Where each stop sits along the line, in order: the nearest pass at or after the previous
// stop, so a road that doubles back does not send the van to a later visit
function stopsAlong(line, stops) {
  const out = []
  let fromSeg = 0
  let fromKm = 0
  const segKm = line.slice(1).map((p, i) => haversineKm(line[i], p))
  const startKm = segKm.reduce((acc, km, i) => { acc.push((acc[i] ?? 0) + km); return acc }, [0])
  for (const stop of stops) {
    let best = null
    for (let i = fromSeg; i < segKm.length; i++) {
      const { distanceKm, t } = pointToSegment(stop.coordinates, line[i], line[i + 1])
      const along = startKm[i] + t * segKm[i]
      if (along < fromKm - 1e-9) continue
      if (!best || distanceKm < best.offKm - 0.05) best = { offKm: distanceKm, alongKm: along, seg: i }
    }
    if (!best) best = { alongKm: fromKm, seg: fromSeg }
    out.push({ stop, alongKm: best.alongKm })
    fromSeg = best.seg
    fromKm = best.alongKm
  }
  return out
}

// The drive as a timeline: road line, where each stop is along it, and the pace
export function simulationPlan(route, startedAt = route.simulation?.startedAt || new Date()) {
  const ordered = [...route.stops].sort((a, b) => a.sequence - b.sequence)
  const geometry = route.geometry?.coordinates
  const line = geometry?.length > 1
    ? geometry
    : [...(route.depot?.coordinates?.length === 2 ? [route.depot.coordinates] : []), ...ordered.map(s => s.coordinates)]
  const profile = VEHICLE_PROFILES[route.vehicleType] || VEHICLE_PROFILES.van
  const traffic = route.trafficEnabled === false ? 1 : timeOfDayFactor(new Date(startedAt))
  const speedKmh = profile.speedKmh / traffic
  const stops = stopsAlong(line, ordered)

  // Minutes (simulated) at which the van reaches each stop
  let t = 0
  let prevKm = 0
  for (const s of stops) {
    t += ((s.alongKm - prevKm) / speedKmh) * 60
    s.arriveMin = t
    t += profile.serviceMin
    prevKm = s.alongKm
  }
  return { line, stops, speedKmh, serviceMin: profile.serviceMin, totalMin: t, totalKm: lengthKm(line) }
}

// Where the van is `simMin` simulated minutes after leaving: how far along, how many
// stops are delivered, and whether it is moving
export function simulatedState(plan, simMin) {
  let prevKm = 0
  for (let i = 0; i < plan.stops.length; i++) {
    const s = plan.stops[i]
    if (simMin < s.arriveMin) {
      const leftAt = i === 0 ? 0 : plan.stops[i - 1].arriveMin + plan.serviceMin
      const km = prevKm + ((simMin - leftAt) / 60) * plan.speedKmh
      return { alongKm: Math.min(s.alongKm, Math.max(prevKm, km)), delivered: i, moving: true, finished: false }
    }
    if (simMin < s.arriveMin + plan.serviceMin) return { alongKm: s.alongKm, delivered: i, moving: false, finished: false }
    prevKm = s.alongKm
  }
  return { alongKm: prevKm, delivered: plan.stops.length, moving: false, finished: true }
}

// Compass heading (0 = north, clockwise) from a to b
function heading(a, b) {
  const y = (b[0] - a[0]) * Math.cos(((a[1] + b[1]) / 2) * Math.PI / 180)
  const x = b[1] - a[1]
  return Math.round(((Math.atan2(y, x) * 180) / Math.PI + 360) % 360)
}

// Puts a planned demo route on the road as a simulated drive. ETAs follow the simulated
// clock, so customers see the same countdown the van actually keeps.
export function startSimulatedRoute(route, now = new Date(), speedup = SIM_SPEEDUP) {
  route.status = 'active'
  route.startedAt = now
  route.simulation = { startedAt: now, speedup }
  const plan = simulationPlan(route, now)
  for (const { stop, arriveMin } of plan.stops) {
    if (open(stop)) stop.estimatedArrival = new Date(now.getTime() + (arriveMin / speedup) * 60000)
  }
  const first = route.stops.find(s => s.status === 'pending')
  if (first) first.status = 'in_progress'
  route.driverLocation = { coordinates: plan.line[0], accuracy: 5, speed: 0, updatedAt: now }
  route.refreshProgress()
  return route
}

export async function advanceRoute(route, now = new Date()) {
  const { startedAt, speedup } = route.simulation
  const plan = simulationPlan(route, startedAt)
  const state = simulatedState(plan, ((now - startedAt) / 60000) * speedup)
  const coordinates = pointAt(plan.line, state.alongKm)
  const prev = route.driverLocation?.coordinates

  route.driverLocation = {
    coordinates,
    accuracy: 5,
    heading: prev?.length === 2 && haversineKm(prev, coordinates) > 0.005 ? heading(prev, coordinates) : route.driverLocation?.heading,
    speed: state.moving ? Math.round((plan.speedKmh / 3.6) * 10) / 10 : 0,
    updatedAt: now
  }
  route.actualDistance = Math.round(state.alongKm * 100) / 100

  for (const { stop } of plan.stops.slice(0, state.delivered)) {
    if (!open(stop)) continue
    stop.status = 'completed'
    stop.completedAt = now
    stop.proof = { note: SIM_PROOF_NOTE, completedAt: now, completedBy: route.driver }
  }
  const next = route.stops.find(s => s.status === 'pending')
  if (next && !route.stops.some(s => s.status === 'in_progress')) next.status = 'in_progress'

  route.refreshProgress()
  if (route.status === 'completed') route.simulation = undefined
  await route.save()
  await recordCompletion(route)
  if (route.driver) await User.updateOne({ _id: route.driver }, { $set: { lastLocation: { coordinates, updatedAt: now } } })
  return state
}

export const simulatingFilter = () => ({ isDemo: true, status: 'active', 'simulation.startedAt': { $ne: null } })

export async function advanceSimulations(now = new Date()) {
  const routes = await Route.find(simulatingFilter())
  for (const route of routes) {
    try {
      await advanceRoute(route, now)
    } catch (error) {
      console.error(`Demo drive ${route.routeId} failed:`, error.message)
    }
  }
  return routes.length
}

// One ticker per server process. Ticks never overlap; a slow database just skips a beat.
let timer = null
export function startSimulationClock(intervalMs = SIM_TICK_MS) {
  if (timer) return timer
  let busy = false
  timer = setInterval(async () => {
    if (busy) return
    busy = true
    try { await advanceSimulations() } finally { busy = false }
  }, intervalMs)
  timer.unref?.()
  return timer
}
