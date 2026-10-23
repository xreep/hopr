import { istHour, istDay } from '../utils/time.js'
import { pointToSegment } from '../utils/geo.js'
import { closureDetourKm } from './shortestPath.js'

// Simulated traffic: a weekday congestion profile typical of Indian cities (multiplier
// on free-flow travel time, by IST hour), plus live incidents (congestion zones, road
// closures) that fleet managers report. ETAs use this model so they are deterministic
// and testable.
const WEEKDAY_PROFILE = [
  1.0, 1.0, 1.0, 1.0, 1.0, 1.05, // 00-05
  1.15, 1.3, 1.55, 1.6, 1.45, 1.3, // 06-11 school + office peak
  1.25, 1.25, 1.25, 1.3, 1.4, 1.6, // 12-17
  1.65, 1.5, 1.35, 1.2, 1.1, 1.05 // 18-23 evening peak
]
const SUNDAY_RELIEF = 0.85

export function timeOfDayFactor(date) {
  const base = WEEKDAY_PROFILE[istHour(date)]
  return istDay(date) === 0 ? Math.max(1, base * SUNDAY_RELIEF) : base
}

export function trafficLevel(factor) {
  if (factor >= 1.5) return 'heavy'
  if (factor >= 1.25) return 'moderate'
  return 'light'
}

export const INCIDENT_DEFAULTS = Object.freeze({
  congestion: { severity: 1.8 },
  closure: { severity: 1 }
})

// Effect of active incidents on a straight leg a -> b.
// Congestion multiplies travel time; a closure forces a detour around the zone.
export function legIncidentEffect(a, b, incidents = []) {
  let timeFactor = 1
  let extraKm = 0
  const hits = []
  const closed = []
  for (const incident of incidents) {
    if (!incident?.coordinates) continue
    const radiusKm = incident.radiusKm ?? 0.5
    const { distanceKm } = pointToSegment(incident.coordinates, a, b)
    if (distanceKm > radiusKm) continue
    hits.push(incident.id ?? incident._id?.toString() ?? incident.label)
    if (incident.type === 'closure') {
      closed.push({ centre: incident.coordinates, radiusKm })
      timeFactor *= 1.15
    } else {
      timeFactor *= incident.severity ?? INCIDENT_DEFAULTS.congestion.severity
    }
  }
  if (closed.length) {
    // The shortest way round every closure on this leg (A* on a visibility graph). A stop
    // inside a closed area has no way round: count half of each circle instead.
    extraKm = closureDetourKm(a, b, closed) ?? closed.reduce((km, c) => km + c.radiusKm * (Math.PI - 2), 0)
  }
  return { timeFactor, extraKm, incidents: hits }
}
