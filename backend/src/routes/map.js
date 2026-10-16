import express from 'express'
import { query, validationResult } from 'express-validator'
import axios from 'axios'
import { authenticate } from '../middleware/auth.js'

const router = express.Router()

const validateRequest = (req, res, next) => {
  const errors = validationResult(req)
  if (!errors.isEmpty()) {
    return res.status(400).json({ errors: errors.array() })
  }
  next()
}

const MAPBOX_TOKEN = process.env.MAPBOX_TOKEN
const GOOGLE_MAPS_KEY = process.env.GOOGLE_MAPS_KEY

router.get('/geocode', authenticate, [
  query('address').notEmpty().withMessage('Address is required'),
  validateRequest
], async (req, res) => {
  try {
    const { address } = req.query

    if (MAPBOX_TOKEN) {
      try {
        const response = await axios.get('https://api.mapbox.com/geocoding/v5/mapbox.places/' + 
          encodeURIComponent(address) + '.json', {
          params: {
            access_token: MAPBOX_TOKEN,
            limit: 1
          }
        })

        if (response.data.features && response.data.features.length > 0) {
          const feature = response.data.features[0]
          return res.json({
            coordinates: feature.center,
            placeName: feature.place_name
          })
        }
      } catch (mapboxError) {
        console.warn('Mapbox geocoding failed, trying Google Maps:', mapboxError.message)
      }
    }

    if (GOOGLE_MAPS_KEY) {
      try {
        const response = await axios.get('https://maps.googleapis.com/maps/api/geocode/json', {
          params: {
            address,
            key: GOOGLE_MAPS_KEY
          }
        })

        if (response.data.results && response.data.results.length > 0) {
          const result = response.data.results[0]
          return res.json({
            coordinates: [result.geometry.location.lng, result.geometry.location.lat],
            placeName: result.formatted_address
          })
        }
      } catch (googleError) {
        console.warn('Google Maps geocoding failed:', googleError.message)
      }
    }

    const mockCoordinates = generateMockCoordinates(address)
    res.json({
      coordinates: mockCoordinates,
      placeName: address,
      mock: true
    })
  } catch (error) {
    res.status(500).json({ message: 'Geocoding failed' })
  }
})

router.get('/reverse-geocode', authenticate, [
  query('lng').isFloat({ min: -180, max: 180 }).withMessage('Valid longitude required'),
  query('lat').isFloat({ min: -90, max: 90 }).withMessage('Valid latitude required'),
  validateRequest
], async (req, res) => {
  try {
    const { lng, lat } = req.query

    if (MAPBOX_TOKEN) {
      try {
        const response = await axios.get(`https://api.mapbox.com/geocoding/v5/mapbox.places/${lng},${lat}.json`, {
          params: {
            access_token: MAPBOX_TOKEN,
            limit: 1
          }
        })

        if (response.data.features && response.data.features.length > 0) {
          return res.json({
            address: response.data.features[0].place_name
          })
        }
      } catch (error) {
        console.warn('Mapbox reverse geocoding failed:', error.message)
      }
    }

    res.json({
      address: `Location at ${lat}, ${lng}`,
      mock: true
    })
  } catch (error) {
    res.status(500).json({ message: 'Reverse geocoding failed' })
  }
})

router.get('/directions', authenticate, [
  query('origin').notEmpty().withMessage('Origin is required'),
  query('destination').notEmpty().withMessage('Destination is required'),
  query('waypoints').optional(),
  validateRequest
], async (req, res) => {
  try {
    const { origin, destination, waypoints } = req.query

    if (MAPBOX_TOKEN) {
      try {
        let coords = `${origin};${destination}`
        if (waypoints) {
          coords += `;${waypoints}`
        }

        const response = await axios.get(`https://api.mapbox.com/directions/v5/mapbox/driving/${coords}`, {
          params: {
            access_token: MAPBOX_TOKEN,
            geometries: 'geojson',
            steps: true,
            overview: 'full'
          }
        })

        if (response.data.routes && response.data.routes.length > 0) {
          const route = response.data.routes[0]
          return res.json({
            distance: route.distance / 1000,
            duration: route.duration / 60,
            geometry: route.geometry,
            steps: route.legs.flatMap(l => l.steps)
          })
        }
      } catch (error) {
        console.warn('Mapbox directions failed:', error.message)
      }
    }

    const mockDistance = 10 + Math.random() * 50
    const mockDuration = mockDistance * 1.5
    res.json({
      distance: Math.round(mockDistance * 10) / 10,
      duration: Math.round(mockDuration),
      geometry: {
        type: 'LineString',
        coordinates: [
          origin.split(',').map(Number).reverse(),
          destination.split(',').map(Number).reverse()
        ]
      },
      mock: true
    })
  } catch (error) {
    res.status(500).json({ message: 'Directions failed' })
  }
})

function generateMockCoordinates(address) {
  const hash = address.split('').reduce((acc, char) => acc + char.charCodeAt(0), 0)
  const lng = -74.006 + (hash % 1000) / 10000 - 0.05
  const lat = 40.7128 + (hash % 1000) / 10000 - 0.05
  return [Math.round(lng * 10000) / 10000, Math.round(lat * 10000) / 10000]
}

export default router