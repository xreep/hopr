import express from 'express'
import { emailEnabled } from '../services/notify.js'
import { query } from 'express-validator'
import axios from 'axios'
import { authenticate, authorize } from '../middleware/auth.js'
import { validateRequest } from '../middleware/validate.js'
import { buildRouteGeometry } from '../services/geometry.js'
import { INDIA_CENTRE } from '../data/indiaCities.js'
import { INDIA_BBOX, matchLandmarks, dedupeSuggestions, parseNear } from '../services/geocoding.js'
import Vehicle from '../models/Vehicle.js'

const router = express.Router()
// Planning tools: only managers search addresses and roads, so a self-registered account
// cannot use the server as a free proxy for the geocoding and routing services
const managers = authorize('admin', 'fleet_manager')

// Geocoding providers: Mapbox when MAPBOX_TOKEN is set, otherwise the free
// OpenStreetMap Photon API. Results are limited to India, ranked near the caller's hub, and cached.
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

async function mapboxSearch(q, limit, near) {
  const { data } = await axios.get(`https://api.mapbox.com/geocoding/v5/mapbox.places/${encodeURIComponent(q)}.json`, {
    params: {
      access_token: mapboxToken(),
      limit,
      country: 'in',
      ...(near && { proximity: near.join(',') }),
      autocomplete: true,
      types: 'address,poi,neighborhood,locality,place,postcode',
      bbox: INDIA_BBOX.join(',')
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

async function photonSearch(q, limit, near) {
  const [lon, lat] = near || INDIA_CENTRE
  const { data } = await axios.get('https://photon.komoot.io/api/', {
    params: { q, limit: limit + 3, lang: 'en', lat, lon, bbox: INDIA_BBOX.join(',') },
    headers: { 'User-Agent': 'Hopr route optimization (student project)' },
    timeout: 5000
  })
  return (data.features || [])
    .filter(f => !f.properties?.countrycode || f.properties.countrycode === 'IN')
    .slice(0, limit)
    .map(f => ({ label: photonLabel(f.properties), address: photonLabel(f.properties), coordinates: f.geometry.coordinates, source: 'osm' }))
}

async function search(q, limit, near = null) {
  if (providersDisabled()) {
    const err = new Error('Geocoding provider not available')
    err.status = 503
    throw err
  }
  // Curated places first, then the provider (Mapbox, else OpenStreetMap), limited to
  // India and ranked near the hub when one is given. Repeats are removed.
  const landmarks = matchLandmarks(q, limit, near)
  const nearKey = near ? near.map(n => n.toFixed(1)).join(',') : 'in'
  const key = `${mapboxToken() ? 'mb' : 'osm'}:${limit}:${nearKey}:${q.toLowerCase()}`
  let provider = []
  try {
    provider = await cached(key, () => (mapboxToken()
      ? mapboxSearch(q, limit + 3, near).catch(error => {
        console.warn('Mapbox geocoding failed, falling back to OpenStreetMap:', error.message)
        return photonSearch(q, limit + 3, near)
      })
      : photonSearch(q, limit + 3, near)))
  } catch (error) {
    // The curated places still help when the provider is down
    if (!landmarks.length) throw error
    console.warn('Geocoding provider failed, returning known places only:', error.message)
  }
  return dedupeSuggestions([...landmarks, ...provider], limit)
}

function sendProviderError(res, error) {
  if (error.status) return res.status(error.status).json({ message: error.message })
  console.warn('Geocoding failed:', error.message)
  return res.status(502).json({ message: 'Geocoding service is unavailable, please try again' })
}

// Map settings plus the hubs the fleet is based at (quick picks for a batch's start point)
router.get('/config', authenticate, managers, async (req, res) => {
  try {
    const based = await Vehicle.find({ 'base.coordinates.1': { $exists: true } }).select('base').lean()
    const hubs = [...new Map(based.map(v => [v.base.coordinates.join(), v.base])).values()]
      .map(({ name, address, coordinates }) => ({ name, address, coordinates }))
      .sort((a, b) => (a.name || a.address).localeCompare(b.name || b.address))
    res.json({ centre: INDIA_CENTRE, hubs, geocoder: mapboxToken() ? 'mapbox' : 'osm', email: emailEnabled() })
  } catch (error) {
    console.error('Map config failed:', error)
    res.status(500).json({ message: 'Failed to load map settings' })
  }
})

router.get('/suggest', authenticate, managers, [
  query('q').isString().trim().isLength({ min: 3, max: 200 }).withMessage('Type at least 3 characters'),
  query('limit').optional().isInt({ min: 1, max: 8 }).toInt(),
  query('near').optional().matches(/^-?\d{1,3}(\.\d+)?,-?\d{1,2}(\.\d+)?$/).withMessage('near must be "lng,lat"'),
  validateRequest
], async (req, res) => {
  try {
    res.json({ suggestions: await search(req.query.q, req.query.limit || 5, parseNear(req.query.near)) })
  } catch (error) {
    sendProviderError(res, error)
  }
})

router.get('/geocode', authenticate, managers, [
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

router.get('/reverse-geocode', authenticate, managers, [
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
router.get('/directions', authenticate, managers, [
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
      distanceKm: geometry.distanceKm,
      // With Mapbox (driving-traffic) this drive time includes live traffic
      durationMin: geometry.durationMin,
      liveTraffic: geometry.source === 'mapbox'
    })
  } catch (error) {
    res.status(500).json({ message: 'Directions failed' })
  }
})

export default router
