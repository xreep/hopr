import { INDIA_BBOX, KNOWN_PLACES } from '../data/indiaCities.js'

// Hopr covers all of India. Searches are limited to the country and, when the
// caller passes `near` (usually the batch's hub), ranked by distance from it.
export { INDIA_BBOX }

// Names people actually type for curated places
const ALIASES = {
  ranchiJunction: 'railway station rly',
  birsaMundaAirport: 'airport',
  albertEkkaChowk: 'firayalal',
  morabadiMaidan: 'morhabadi ground',
  'Santacruz Station': 'railway rly',
  'MG Road Metro': 'station'
}
// Words that say nothing about the place itself
const NOISE = new Set(['india', 'the', 'near', 'opp', 'opposite', 'road', 'rd'])
// City and state names: needed to tell two "MG Road"s apart, but on their own
// they describe a whole city, which the geocoder answers better than a landmark
const PLACE_WORDS = new Set(['ranchi', 'jharkhand', 'new', 'delhi', 'mumbai', 'maharashtra', 'bengaluru', 'bangalore', 'karnataka', 'kolkata', 'west', 'bengal'])

const words = text => String(text).toLowerCase().split(/[^a-z0-9]+/).filter(Boolean)
const camelWords = key => key.replace(/([a-z])([A-Z])/g, '$1 $2')

const LANDMARKS = KNOWN_PLACES.map(place => ({
  place,
  vocabulary: [...new Set(words(`${camelWords(place.key)} ${place.name || ''} ${place.address} ${ALIASES[place.key] || ''}`))]
}))

function metresBetween([lng1, lat1], [lng2, lat2]) {
  const toRad = d => (d * Math.PI) / 180
  const a = Math.sin(toRad(lat2 - lat1) / 2) ** 2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(toRad(lng2 - lng1) / 2) ** 2
  return 2 * 6371000 * Math.asin(Math.sqrt(a))
}

// Curated places whose names cover every meaningful word typed (prefixes count),
// nearest to `near` first when given
export function matchLandmarks(q, limit = 3, near = null) {
  const typed = words(q).filter(w => !NOISE.has(w) && !/^\d+$/.test(w))
  if (!typed.length || typed.every(w => PLACE_WORDS.has(w))) return []
  const hits = LANDMARKS.filter(({ vocabulary }) => typed.every(w => vocabulary.some(v => v.startsWith(w))))
  if (near) hits.sort((a, b) => metresBetween(near, a.place.coordinates) - metresBetween(near, b.place.coordinates))
  return hits.slice(0, limit)
    .map(({ place }) => ({ label: place.address, address: place.address, coordinates: place.coordinates, source: 'hopr' }))
}

export function insideIndia([lng, lat]) {
  const [minLng, minLat, maxLng, maxLat] = INDIA_BBOX
  return lng >= minLng && lng <= maxLng && lat >= minLat && lat <= maxLat
}

// Drops repeats: the same label, or a place within 30 m of one already listed
export function dedupeSuggestions(list, limit = Infinity) {
  const out = []
  for (const s of list) {
    const label = s.label.toLowerCase().replace(/\s+/g, ' ').trim()
    const repeat = out.some(o => o.label.toLowerCase().replace(/\s+/g, ' ').trim() === label || metresBetween(o.coordinates, s.coordinates) < 30)
    if (!repeat) out.push(s)
    if (out.length >= limit) break
  }
  return out
}

// "lng,lat" query parameter -> [lng, lat] inside India, else null
export function parseNear(value) {
  if (typeof value !== 'string') return null
  const parts = value.split(',').map(Number)
  if (parts.length !== 2 || parts.some(n => !Number.isFinite(n))) return null
  return insideIndia(parts) ? parts : null
}
