// Travel times learned from the fleet's own deliveries. Free live-traffic data does not
// exist for Indian cities, so Hopr learns from its drivers instead: each delivered leg
// records how its actual drive time compared with the planned one, by area and hour.
// Planning multiplies the traffic model by the learned correction, blended in gradually
// as samples build up, so a few odd trips cannot swing the ETAs.
import TravelTimeStat from '../models/TravelTimeStat.js'
import { VEHICLE_PROFILES } from '../config/fleet.js'
import { istHour, istDay } from '../utils/time.js'

export const MIN_SAMPLES = 5 // an hour's correction is ignored until it has this many legs
export const PRIOR_SAMPLES = 20 // weight of the model itself: 20 legs count as much as it
const RATIO_RANGE = [0.4, 3] // outside this, the leg had a break or a detour: not traffic
const BOUNDS = [0.6, 2.2] // the correction never moves the model further than this

// Sunday traffic is lighter than Monday to Saturday (the traffic model says so too)
export const dayTypeOf = date => (istDay(new Date(date)) === 0 ? 'sunday' : 'weekday')

// Areas are cells of 0.1 degree (about 11 km), keyed by the route's hub
export const areaOf = coordinates => (coordinates?.length === 2 ? `${coordinates[1].toFixed(1)},${coordinates[0].toFixed(1)}` : null)

// One delivered leg: when the driver left the previous stop (or the hub), when they
// reached this one (delivery time minus time at the door), against the planned leg time
export function legSample(route, stop) {
  if (stop.status !== 'completed' || !stop.completedAt || !(stop.legMinutes > 0)) return null
  const ordered = [...route.stops].sort((a, b) => a.sequence - b.sequence)
  const previous = ordered.filter(s => s.sequence < stop.sequence && (s.completedAt || s.failedAt)).pop()
  const leftAt = previous ? previous.completedAt || previous.failedAt : route.startedAt
  if (!leftAt) return null
  const serviceMin = (VEHICLE_PROFILES[route.vehicleType] || VEHICLE_PROFILES.van).serviceMin
  const actual = (new Date(stop.completedAt) - new Date(leftAt)) / 60000 - serviceMin
  const ratio = actual / stop.legMinutes
  if (!(ratio >= RATIO_RANGE[0] && ratio <= RATIO_RANGE[1])) return null
  const area = areaOf(route.depot?.coordinates)
  return area ? { area, dayType: dayTypeOf(leftAt), hour: istHour(new Date(leftAt)), ratio } : null
}

export async function recordLeg(route, stop) {
  if (route.isDemo || route.simulation?.startedAt) return null // only real drives teach the model
  const sample = legSample(route, stop)
  if (!sample) return null
  // Counted for its kind of day and for all days, which stands in until the kind of day
  // has enough legs of its own
  const inc = { $inc: { samples: 1, sumLogRatio: Math.log(sample.ratio) } }
  await Promise.all([sample.dayType, 'all'].map(dayType =>
    TravelTimeStat.updateOne({ area: sample.area, dayType, hour: sample.hour }, inc, { upsert: true })))
  return sample
}

export function correction(stat) {
  if (!stat || stat.samples < MIN_SAMPLES) return 1
  const weight = stat.samples / (stat.samples + PRIOR_SAMPLES)
  const learned = Math.exp((weight * stat.sumLogRatio) / stat.samples)
  return Math.min(BOUNDS[1], Math.max(BOUNDS[0], learned))
}

// Corrections for each IST hour (0-23) around a hub on the day of `when`: that kind of
// day's own figure once it has enough legs, else all days together; 1 if nothing yet
export async function learnedFactors(depotCoordinates, when = new Date()) {
  const area = areaOf(depotCoordinates)
  const factors = new Array(24).fill(1)
  if (!area) return factors
  const dayType = dayTypeOf(when)
  const stats = await TravelTimeStat.find({ area, dayType: { $in: [dayType, 'all'] } }).lean()
  for (const hour of factors.keys()) {
    const own = stats.find(s => s.hour === hour && s.dayType === dayType)
    const all = stats.find(s => s.hour === hour && s.dayType === 'all')
    factors[hour] = correction(own && own.samples >= MIN_SAMPLES ? own : all)
  }
  return factors
}

export async function learningSummary() {
  const stats = await TravelTimeStat.find({ dayType: 'all' }).lean()
  return {
    legs: stats.reduce((sum, s) => sum + s.samples, 0),
    areas: new Set(stats.map(s => s.area)).size,
    hoursInUse: stats.filter(s => s.samples >= MIN_SAMPLES).length
  }
}
