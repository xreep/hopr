import axios from 'axios'

const MAX_WAYPOINTS = 25 // Mapbox Directions API limit per request

function mapboxToken() {
  return process.env.NODE_ENV === 'test' ? null : process.env.MAPBOX_TOKEN || null
}

// Road-following geometry for an ordered list of [lng, lat] points.
// Falls back to straight legs (source "estimated") when Mapbox is not configured
// or unavailable, so planning never depends on a third-party API being up.
export async function buildRouteGeometry(points) {
  const fallback = { coordinates: points.map(p => [...p]), source: 'estimated', distanceKm: null }
  const token = mapboxToken()
  if (!token || points.length < 2) return fallback

  try {
    const coordinates = []
    let distanceKm = 0
    for (let start = 0; start < points.length - 1; start += MAX_WAYPOINTS - 1) {
      const chunk = points.slice(start, start + MAX_WAYPOINTS)
      const path = chunk.map(([lng, lat]) => `${lng.toFixed(6)},${lat.toFixed(6)}`).join(';')
      const { data } = await axios.get(`https://api.mapbox.com/directions/v5/mapbox/driving/${path}`, {
        params: { access_token: token, geometries: 'geojson', overview: 'full' },
        timeout: 8000
      })
      const route = data?.routes?.[0]
      if (!route) return fallback
      const line = route.geometry.coordinates
      coordinates.push(...(coordinates.length ? line.slice(1) : line))
      distanceKm += route.distance / 1000
    }
    return { coordinates, source: 'mapbox', distanceKm: Math.round(distanceKm * 100) / 100 }
  } catch (error) {
    console.warn('Mapbox directions unavailable, using estimated geometry:', error.message)
    return fallback
  }
}
