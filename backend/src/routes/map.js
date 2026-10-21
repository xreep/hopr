import express from 'express'
import { query } from 'express-validator'
import axios from 'axios'
import { authenticate } from '../middleware/auth.js'
import { validateRequest } from '../middleware/validate.js'
import { buildRouteGeometry } from '../services/geometry.js'
import { DEFAULT_DEPOT } from '../config/fleet.js'
import { RANCHI_CENTRE } from '../data/ranchiLocations.js'
import { SERVICE_BBOX, matchLandmarks, dedupeSuggestions } from '../services/geocoding.js'

const router = express.Router()

// Geocoding providers: Mapbox when MAPBOX_TOKEN is set, otherwise the free
// OpenStreetMap Photon API. Results are biased towards Ranchi and cached.
const providersDisabled = () => process.env.NODE_ENV === 'test'
const mapboxToken = () => process.env.MAPBOX_TOKEN || null

const CACHE_TTL_MS = 24 * 60 * 60 * 1000
const CACHE_MAX = 500
const cache = new Map()
function cached(key, loader) {
  const hit = cache.get(key)
  if (hit && hit.expires > Date.now()) return hit.value
  const value = loader().then(result => {
    if (cache.size >= CACHE_MAX) cache.delete(cache.keys().next().value)
    cache.set(key, { value: Promise.resolve(result), expires: Date.now() + CACHE_TTL_MS })
    return result
  })
  return value
}

async function mapboxSearch(q, limit, { local = true } = {}) {
  const { data } = await axios.get(`https://api.mapbox.com/geocoding/v5/mapbox.places/${encodeURIComponent(q)}.json`, {
    params: {
      access_token: mapboxToken(),
      limit,
      country: 'in',
      proximity: RANCHI_CENTRE.join(','),
      autocomplete: true,
      types: 'address,poi,neighborhood,locality,place,postcode',
      ...(local && { bbox: SERVICE_BBOX.join(',') })
    },
    timeout: 5000
  })
  return (data.features || []).map(f => ({ label: f.place_name, address: f.place_name, coordinates: f.center, source: 'mapbox' }))
}

function photonLabel(p) {
  const street = [p.housenumber, p.street].filter(Boolean).join(' ')
  return [p.name, street && street !== p.name ? street : null, p.district || p.locality, p.city || p.county, p.state, p.postcode]
    .filter(Boolean)
    .filter((part, i, arr) => arr.indexOf(part) === i)
    .join(', ')
}

async function photonSearch(q, limit, { local = true } = {}) {
  const { data } = await axios.get('https://photon.komoot.io/api/', {
    params: { q, limit: limit + 3, lang: 'en', lat: RANCHI_CENTRE[1], lon: RANCHI_CENTRE[0], ...(local && { bbox: SERVICE_BBOX.join(',') }) },
    headers: { 'User-Agent': 'Hopr route optimization (student project)' },
    timeout: 5000
  })
  return (data.features || [])
    .filter(f => !f.properties?.countrycode || f.properties.countrycode === 'IN')
    .slice(0, limit)
    .map(f => ({ label: photonLabel(f.properties), address: photonLabel(f.properties), coordinates: f.geometry.coordinates, source: 'osm' }))
}

async function search(q, limit) {
  if (providersDisabled()) {
    const err = new Error('Geocoding provider not available')
    err.status = 503
    throw err
  }
  // Curated Ranchi landmarks first, then the provider: inside the Ranchi service area,
  // widening to all of India only when nothing local matches. Repeats are removed.
  const landmarks = matchLandmarks(q, limit)
  const key = `${mapboxToken() ? 'mb' : 'osm'}:${limit}:${q.toLowerCase()}`
  let provider = []
  try {
    provider = await cached(key, async () => {
      const lookup = mapboxToken()
        ? (opts) => mapboxSearch(q, limit + 3, opts).catch(error => {
          console.warn('Mapbox geocoding failed, falling back to OpenStreetMap:', error.message)
          return photonSearch(q, limit + 3, opts)
        })
        : (opts) => photonSearch(q, limit + 3, opts)
      const local = await lookup({ local: true })
      return local.length ? local : lookup({ local: false })
    })
  } catch (error) {
    // The landmarks still help when the provider is down
    if (!landmarks.length) throw error
    console.warn('Geocoding provider failed, returning landmarks only:', error.message)
  }
  return dedupeSuggestions([...landmarks, ...provider], limit)
}

function sendProviderError(res, error) {
  if (error.status) return res.status(error.status).json({ message: error.message })
  console.warn('Geocoding failed:', error.message)
  return res.status(502).json({ message: 'Geocoding service is unavailable, please try again' })
}

router.get('/config', authenticate, (req, res) => {
  res.json({ depot: DEFAULT_DEPOT, centre: RANCHI_CENTRE, geocoder: mapboxToken() ? 'mapbox' : 'osm' })
})

router.get('/suggest', authenticate, [
  query('q').isString().trim().isLength({ min: 3, max: 200 }).withMessage('Type at least 3 characters'),
  query('limit').optional().isInt({ min: 1, max: 8 }).toInt(),
  validateRequest
], async (req, res) => {
  try {
    res.json({ suggestions: await search(req.query.q, req.query.limit || 5) })
  } catch (error) {
    sendProviderError(res, error)
  }
})

router.get('/geocode', authenticate, [
  query('address').isString().trim().isLength({ min: 3, max: 300 }).withMessage('Address is required'),
  validateRequest
], async (req, res) => {
  try {
    const [first] = await search(req.query.address, 1)
    if (!first) return res.status(404).json({ message: `Could not find "${req.query.address}"` })
    res.json({ coordinates: first.coordinates, placeName: first.label, source: first.source })
  } catch (error) {
    sendProviderError(res, error)
  }
})

router.get('/reverse-geocode', authenticate, [
  query('lng').isFloat({ min: -180, max: 180 }).withMessage('Valid longitude required').toFloat(),
  query('lat').isFloat({ min: -90, max: 90 }).withMessage('Valid latitude required').toFloat(),
  validateRequest
], async (req, res) => {
  try {
    if (providersDisabled()) return res.status(503).json({ message: 'Geocoding provider not available' })
    const { lng, lat } = req.query
    const address = await cached(`rev:${lng.toFixed(5)},${lat.toFixed(5)}`, async () => {
      if (mapboxToken()) {
        try {
          const { data } = await axios.get(`https://api.mapbox.com/geocoding/v5/mapbox.places/${lng},${lat}.json`, {
            params: { access_token: mapboxToken(), limit: 1 },
            timeout: 5000
          })
          if (data.features?.length) return data.features[0].place_name
        } catch (error) {
          console.warn('Mapbox reverse geocoding failed:', error.message)
        }
      }
      const { data } = await axios.get('https://photon.komoot.io/reverse', {
        params: { lon: lng, lat, lang: 'en' },
        headers: { 'User-Agent': 'Hopr route optimization (student project)' },
        timeout: 5000
      })
      return data.features?.length ? photonLabel(data.features[0].properties) : null
    })
    if (!address) return res.status(404).json({ message: 'No address found at this location' })
    res.json({ address })
  } catch (error) {
    sendProviderError(res, error)
  }
})

// Road geometry through ordered points: ?coordinates=lng,lat;lng,lat;...
router.get('/directions', authenticate, [
  query('coordinates').isString().matches(/^-?\d+(\.\d+)?,-?\d+(\.\d+)?(;-?\d+(\.\d+)?,-?\d+(\.\d+)?){1,30}$/)
    .withMessage('coordinates must be "lng,lat;lng,lat" (2-31 points)'),
  validateRequest
], async (req, res) => {
  try {
    const points = req.query.coordinates.split(';').map(p => p.split(',').map(Number))
    const geometry = await buildRouteGeometry(points)
    res.json({
      geometry: { type: 'LineString', coordinates: geometry.coordinates },
      source: geometry.source,
      distanceKm: geometry.distanceKm
    })
  } catch (error) {
    res.status(500).json({ message: 'Directions failed' })
  }
})

export default router
