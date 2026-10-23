import axios from 'axios'

// Road-following geometry for an ordered list of [lng, lat] points.
//   1. Mapbox Directions when MAPBOX_TOKEN is set, with the driving-traffic profile: the
//      route and its drive time reflect live traffic
//   2. Otherwise the public OSRM service run by FOSSGIS for openstreetmap.org (free, no key,
//      fair use: results are cached and requests carry an identifying User-Agent)
//   3. Straight legs (source "estimated") if neither answers, so planning never depends
//      on a third-party API being up
const MAX_WAYPOINTS = 25 // per request (Mapbox's limit; kept small for OSRM too)
const OSRM_URL = 'https://routing.openstreetmap.de/routed-car/route/v1/driving'
export const MAPBOX_PROFILE = 'driving-traffic'
const USER_AGENT = 'Hopr route optimization (student project)'

const providersDisabled = () => process.env.NODE_ENV === 'test'
const mapboxToken = () => process.env.MAPBOX_TOKEN || null

// Geometry is the same for the same points: keep recent answers
const CACHE_MAX = 300
const cache = new Map()
function remember(key, value) {
  if (cache.size >= CACHE_MAX) cache.delete(cache.keys().next().value)
  cache.set(key, value)
  return value
}

// Sources that follow real roads (lengths are road kilometres, no circuity factor needed)
export const isRoadGeometry = source => source === 'mapbox' || source === 'osm'

async function fetchLeg(chunk, provider) {
  const path = chunk.map(([lng, lat]) => `${lng.toFixed(6)},${lat.toFixed(6)}`).join(';')
  if (provider === 'mapbox') {
    const { data } = await axios.get(`https://api.mapbox.com/directions/v5/mapbox/${MAPBOX_PROFILE}/${path}`, {
      params: { access_token: mapboxToken(), geometries: 'geojson', overview: 'full' },
      timeout: 8000
    })
    return data?.routes?.[0]
  }
  const { data } = await axios.get(`${OSRM_URL}/${path}`, {
    params: { overview: 'full', geometries: 'geojson' },
    headers: { 'User-Agent': USER_AGENT },
    timeout: 6000
  })
  return data?.code === 'Ok' ? data.routes?.[0] : null
}

async function routeWith(points, provider) {
  const coordinates = []
  let distanceKm = 0
  let durationMin = 0
  for (let start = 0; start < points.length - 1; start += MAX_WAYPOINTS - 1) {
    const route = await fetchLeg(points.slice(start, start + MAX_WAYPOINTS), provider)
    if (!route) return null
    const line = route.geometry.coordinates
    coordinates.push(...(coordinates.length ? line.slice(1) : line))
    distanceKm += route.distance / 1000
    durationMin += route.duration / 60
  }
  // Drive time from the provider: with Mapbox it includes live traffic
  return { coordinates, source: provider, distanceKm: Math.round(distanceKm * 100) / 100, durationMin: Math.round(durationMin) }
}

export async function buildRouteGeometry(points) {
  const fallback = { coordinates: points.map(p => [...p]), source: 'estimated', distanceKm: null, durationMin: null }
  if (providersDisabled() || points.length < 2) return fallback

  const key = points.map(([lng, lat]) => `${lng.toFixed(5)},${lat.toFixed(5)}`).join(';')
  if (cache.has(key)) return cache.get(key)

  for (const provider of mapboxToken() ? ['mapbox', 'osm'] : ['osm']) {
    try {
      const result = await routeWith(points, provider)
      if (result) return remember(key, result)
    } catch (error) {
      console.warn(`${provider === 'mapbox' ? 'Mapbox' : 'OpenStreetMap'} directions unavailable:`, error.message)
    }
  }
  return fallback
}
