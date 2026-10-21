import { RANCHI_CENTRE, RANCHI_LOCATIONS } from '../data/ranchiLocations.js'

// Hopr delivers around Ranchi: search roughly 45 km around the city first
// ([minLng, minLat, maxLng, maxLat], the order Photon and Mapbox both use)
export const SERVICE_BBOX = Object.freeze([
  RANCHI_CENTRE[0] - 0.45, RANCHI_CENTRE[1] - 0.4, RANCHI_CENTRE[0] + 0.45, RANCHI_CENTRE[1] + 0.4
])

// Names people actually type for the curated landmarks
const ALIASES = {
  ranchiJunction: 'railway station rly',
  birsaMundaAirport: 'airport',
  albertEkkaChowk: 'firayalal',
  morabadiMaidan: 'morhabadi ground'
}
// Words that appear in nearly every Ranchi address and say nothing about the place
const NOISE = new Set(['ranchi', 'jharkhand', 'india', 'the', 'near', 'opp', 'opposite'])

const words = text => String(text).toLowerCase().split(/[^a-z0-9]+/).filter(Boolean)
const camelWords = key => key.replace(/([a-z])([A-Z])/g, '$1 $2')

const LANDMARKS = Object.entries(RANCHI_LOCATIONS).map(([key, place]) => ({
  place,
  vocabulary: new Set(words(`${camelWords(key)} ${place.address} ${ALIASES[key] || ''}`))
}))

// Curated Ranchi landmarks whose names cover every meaningful word typed (prefixes count)
export function matchLandmarks(q, limit = 3) {
  const typed = words(q).filter(w => !NOISE.has(w) && !/^\d+$/.test(w))
  if (!typed.length) return []
  return LANDMARKS
    .filter(({ vocabulary }) => typed.every(w => [...vocabulary].some(v => v.startsWith(w))))
    .slice(0, limit)
    .map(({ place }) => ({ label: place.address, address: place.address, coordinates: place.coordinates, source: 'hopr' }))
}

export function insideServiceArea([lng, lat]) {
  const [minLng, minLat, maxLng, maxLat] = SERVICE_BBOX
  return lng >= minLng && lng <= maxLng && lat >= minLat && lat <= maxLat
}

function metresBetween([lng1, lat1], [lng2, lat2]) {
  const toRad = d => (d * Math.PI) / 180
  const a = Math.sin(toRad(lat2 - lat1) / 2) ** 2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(toRad(lng2 - lng1) / 2) ** 2
  return 2 * 6371000 * Math.asin(Math.sqrt(a))
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
