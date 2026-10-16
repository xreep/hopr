import { useState, useEffect, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import mapboxgl from 'mapbox-gl'
import 'mapbox-gl/dist/mapbox-gl.css'
import api from '../utils/api'
import toast from 'react-hot-toast'

const MAPBOX_TOKEN = import.meta.env.VITE_MAPBOX_TOKEN

if (MAPBOX_TOKEN) {
  mapboxgl.accessToken = MAPBOX_TOKEN
}

const VEHICLE_TYPES = [
  { id: 'bike', name: 'Bicycle', mileage: 0, fuelType: 'electric', capacity: 10, icon: '🚲' },
  { id: 'van', name: 'Delivery Van', mileage: 12, fuelType: 'diesel', capacity: 500, icon: '🚐' },
  { id: 'truck', name: 'Truck', mileage: 6, fuelType: 'diesel', capacity: 2000, icon: '🚛' },
  { id: 'ev_van', name: 'Electric Van', mileage: 0, fuelType: 'electric', capacity: 400, icon: '🔋' }
]

const PRIORITY_OPTIONS = [
  { value: 'urgent', label: 'Urgent', color: 'error' },
  { value: 'standard', label: 'Standard', color: 'primary' },
  { value: 'low', label: 'Low Priority', color: 'success' }
]

export default function RoutePlanner() {
  const navigate = useNavigate()
  const mapContainer = useRef(null)
  const map = useRef(null)
  const markers = useRef([])
  const routeLine = useRef(null)

  const [stops, setStops] = useState([{ address: '', priority: 'standard', timeWindow: '', notes: '' }])
  const [vehicleType, setVehicleType] = useState('van')
  const [vehicleCount, setVehicleCount] = useState(1)
  const [optimizing, setOptimizing] = useState(false)
  const [optimizedRoute, setOptimizedRoute] = useState(null)
  const [showResults, setShowResults] = useState(false)
  const [trafficEnabled, setTrafficEnabled] = useState(true)
  const [fuelPrice, setFuelPrice] = useState(1.50)

  useEffect(() => {
    if (mapContainer.current && !map.current && MAPBOX_TOKEN) {
      initializeMap()
    }
    return () => {
      if (map.current) {
        map.current.remove()
        map.current = null
      }
    }
  }, [])

  const initializeMap = () => {
    map.current = new mapboxgl.Map({
      container: mapContainer.current,
      style: 'mapbox://styles/mapbox/streets-v12',
      center: [-74.006, 40.7128],
      zoom: 11
    })

    map.current.addControl(new mapboxgl.NavigationControl(), 'top-right')

    if (trafficEnabled) {
      map.current.on('load', () => {
        map.current.addSource('traffic', {
          type: 'vector',
          url: 'mapbox://mapbox.mapbox-traffic-v1'
        })
        map.current.addLayer({
          id: 'traffic-layer',
          type: 'line',
          source: 'traffic',
          'source-layer': 'traffic',
          paint: {
            'line-color': '#ff0000',
            'line-width': 2
          }
        })
      })
    }
  }

  useEffect(() => {
    if (map.current) {
      if (trafficEnabled && map.current.getLayer('traffic-layer')) {
        map.current.setLayoutProperty('traffic-layer', 'visibility', 'visible')
      } else if (map.current.getLayer('traffic-layer')) {
        map.current.setLayoutProperty('traffic-layer', 'visibility', 'none')
      }
    }
  }, [trafficEnabled])

  const addStop = () => {
    setStops([...stops, { address: '', priority: 'standard', timeWindow: '', notes: '' }])
  }

  const removeStop = (index) => {
    if (stops.length <= 2) {
      toast.error('At least 2 stops required')
      return
    }
    setStops(stops.filter((_, i) => i !== index))
  }

  const updateStop = (index, field, value) => {
    setStops(stops.map((stop, i) => i === index ? { ...stop, [field]: value } : stop))
  }

  const handleFileUpload = (e) => {
    const file = e.target.files[0]
    if (!file) return

    const reader = new FileReader()
    reader.onload = (event) => {
      const text = event.target.result
      parseCSV(text)
    }
    reader.readAsText(file)
    e.target.value = ''
  }

  const parseCSV = (text) => {
    const lines = text.trim().split('\n')
    const headers = lines[0].split(',').map(h => h.trim().toLowerCase())
    
    const addressIdx = headers.findIndex(h => h.includes('address'))
    const priorityIdx = headers.findIndex(h => h.includes('priority'))
    const timeWindowIdx = headers.findIndex(h => h.includes('time') || h.includes('window'))
    const notesIdx = headers.findIndex(h => h.includes('note'))

    if (addressIdx === -1) {
      toast.error('CSV must contain an address column')
      return
    }

    const newStops = lines.slice(1).map(line => {
      const values = line.split(',').map(v => v.trim())
      return {
        address: values[addressIdx] || '',
        priority: priorityIdx !== -1 ? values[priorityIdx] : 'standard',
        timeWindow: timeWindowIdx !== -1 ? values[timeWindowIdx] : '',
        notes: notesIdx !== -1 ? values[notesIdx] : ''
      }
    }).filter(stop => stop.address)

    if (newStops.length > 0) {
      setStops([...stops, ...newStops])
      toast.success(`Added ${newStops.length} stops from CSV`)
    }
  }

  const geocodeAddress = async (address) => {
    try {
      const response = await api.get('/map/geocode', { params: { address } })
      return response.data.coordinates
    } catch {
      return null
    }
  }

  const optimizeRoute = async () => {
    const validStops = stops.filter(s => s.address.trim())
    if (validStops.length < 2) {
      toast.error('Please add at least 2 stops with addresses')
      return
    }

    setOptimizing(true)
    try {
      const coordinates = await Promise.all(
        validStops.map(stop => geocodeAddress(stop.address))
      )

      const validCoordinates = coordinates.filter(c => c !== null)
      if (validCoordinates.length < 2) {
        toast.error('Could not geocode enough addresses')
        return
      }

      const response = await api.post('/routes/optimize', {
        stops: validStops,
        coordinates: validCoordinates,
        vehicleType,
        vehicleCount,
        trafficEnabled,
        fuelPrice
      })

      setOptimizedRoute(response.data)
      setShowResults(true)
      displayRouteOnMap(response.data)
      toast.success('Route optimized successfully!')
    } catch (error) {
      toast.error(error.response?.data?.message || 'Failed to optimize route')
    } finally {
      setOptimizing(false)
    }
  }

  const displayRouteOnMap = (route) => {
    if (!map.current || !route.geometry) return

    clearMap()

    const geojson = {
      type: 'Feature',
      properties: {},
      geometry: route.geometry
    }

    if (map.current.getSource('route')) {
      map.current.getSource('route').setData(geojson)
    } else {
      map.current.addSource('route', { type: 'geojson', data: geojson })
      map.current.addLayer({
        id: 'route-line',
        type: 'line',
        source: 'route',
        paint: {
          'line-color': '#1e3a8a',
          'line-width': 4,
          'line-opacity': 0.8
        }
      })
    }

    route.stops.forEach((stop, index) => {
      const el = document.createElement('div')
      el.className = 'marker'
      el.innerHTML = `<div class="bg-primary text-white rounded-full w-8 h-8 flex items-center justify-center font-bold text-sm shadow-lg border-2 border-white">${index + 1}</div>`
      
      const marker = new mapboxgl.Marker(el)
        .setLngLat(stop.coordinates)
        .addTo(map.current)
      markers.current.push(marker)
    })

    const bounds = new mapboxgl.LngLatBounds()
    route.stops.forEach(stop => bounds.extend(stop.coordinates))
    map.current.fitBounds(bounds, { padding: 50, maxZoom: 14 })
  }

  const clearMap = () => {
    markers.current.forEach(m => m.remove())
    markers.current = []
    if (map.current?.getSource('route')) {
      map.current.getSource('route').setData({ type: 'FeatureCollection', features: [] })
    }
  }

  const saveRoute = async () => {
    if (!optimizedRoute) return
    try {
      await api.post('/routes', optimizedRoute)
      toast.success('Route saved successfully')
      navigate('/dashboard')
    } catch (error) {
      toast.error('Failed to save route')
    }
  }

  const vehicle = VEHICLE_TYPES.find(v => v.id === vehicleType)

  return (
    <div className="h-[calc(100vh-80px)] flex flex-col">
      <div className="page-header">
        <div>
          <h1 className="page-title">Route Planner</h1>
          <p className="page-subtitle">Plan and optimize multi-stop delivery routes</p>
        </div>
      </div>

      <div className="flex-1 flex overflow-hidden">
        <div className="w-full lg:w-2/3 h-full">
          {MAPBOX_TOKEN ? (
            <div className="h-full" ref={mapContainer} id="map" />
          ) : (
            <div className="h-full flex flex-col items-center justify-center bg-background border border-border rounded-lg p-8 text-center">
              <svg className="w-16 h-16 text-muted mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 18.657A8 8 0 016.343 7.343S7 9 9 10c0-2 .5-5 2.986-7C14 5 16.09 5.777 17.656 7.343A7.975 7.975 0 0120 13a7.975 7.975 0 01-2.343 5.657z" />
              </svg>
              <h3 className="text-lg font-semibold text-primary mb-2">Mapbox Token Required</h3>
              <p className="text-secondary mb-4">Add your Mapbox access token to enable interactive maps.</p>
              <p className="text-sm text-muted">Set VITE_MAPBOX_TOKEN in your .env file</p>
            </div>
          )}
        </div>

        <div className="w-full lg:w-1/3 bg-surface border-l border-border h-full overflow-y-auto p-4">
          <div className="space-y-4">
            <div className="card">
              <div className="card-header">
                <h3 className="font-semibold">Delivery Stops</h3>
              </div>
              <div className="card-body p-0 space-y-3 p-4">
                {stops.map((stop, index) => (
                  <div key={index} className="flex items-start gap-3 p-3 bg-background rounded-lg">
                    <div className="flex-shrink-0 w-8 h-8 rounded-full bg-primary/10 text-primary flex items-center justify-center text-sm font-semibold">
                      {index + 1}
                    </div>
                    <div className="flex-1 min-w-0 space-y-2">
                      <div className="flex items-center gap-2">
                        <input
                          type="text"
                          className="form-input flex-1"
                          placeholder={`Stop ${index + 1} address`}
                          value={stop.address}
                          onChange={(e) => updateStop(index, 'address', e.target.value)}
                          aria-label={`Stop ${index + 1} address`}
                        />
                        {stops.length > 2 && (
                          <button
                            className="btn btn-ghost text-error p-1"
                            onClick={() => removeStop(index)}
                            aria-label={`Remove stop ${index + 1}`}
                          >
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                            </svg>
                          </button>
                        )}
                      </div>
                      <div className="grid grid-2 gap-2">
                        <select
                          className="form-input form-select text-sm"
                          value={stop.priority}
                          onChange={(e) => updateStop(index, 'priority', e.target.value)}
                          aria-label={`Stop ${index + 1} priority`}
                        >
                          {PRIORITY_OPTIONS.map(p => (
                            <option key={p.value} value={p.value}>{p.label}</option>
                          ))}
                        </select>
                        <input
                          type="text"
                          className="form-input text-sm"
                          placeholder="Time window (e.g., 9:00-11:00)"
                          value={stop.timeWindow}
                          onChange={(e) => updateStop(index, 'timeWindow', e.target.value)}
                          aria-label={`Stop ${index + 1} time window`}
                        />
                      </div>
                    </div>
                  </div>
                ))}
                <button className="btn btn-outline w-full" onClick={addStop}>
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                  </svg>
                  Add Stop
                </button>
              </div>
            </div>

            <div className="card">
              <div className="card-header">
                <h3 className="font-semibold">Vehicle Settings</h3>
              </div>
              <div className="card-body space-y-4">
                <div>
                  <label className="form-label">Vehicle Type</label>
                  <div className="grid grid-2 gap-2">
                    {VEHICLE_TYPES.map(v => (
                      <button
                        key={v.id}
                        type="button"
                        className={`p-3 rounded-lg border-2 text-left transition-all ${
                          vehicleType === v.id
                            ? 'border-primary bg-primary/5'
                            : 'border-border hover:border-primary/50'
                        }`}
                        onClick={() => setVehicleType(v.id)}
                      >
                        <div className="text-2xl">{v.icon}</div>
                        <div className="font-medium">{v.name}</div>
                        <div className="text-xs text-muted">
                          {v.fuelType === 'electric' ? 'Electric' : `${v.mileage} km/L ${v.fuelType}`}
                        </div>
                      </button>
                    ))}
                  </div>
                </div>

                <div>
                  <label className="form-label">Number of Vehicles</label>
                  <div className="flex items-center gap-3">
                    <button
                      className="btn btn-outline w-10 h-10"
                      onClick={() => setVehicleCount(Math.max(1, vehicleCount - 1))}
                      disabled={vehicleCount <= 1}
                      aria-label="Decrease vehicles"
                    >
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20 12H4" />
                      </svg>
                    </button>
                    <span className="text-2xl font-bold w-12 text-center">{vehicleCount}</span>
                    <button
                      className="btn btn-outline w-10 h-10"
                      onClick={() => setVehicleCount(vehicleCount + 1)}
                      disabled={vehicleCount >= 10}
                      aria-label="Increase vehicles"
                    >
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                      </svg>
                    </button>
                  </div>
                </div>

                <div>
                  <label className="form-label">Fuel Price ($/L)</label>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    className="form-input"
                    value={fuelPrice}
                    onChange={(e) => setFuelPrice(parseFloat(e.target.value) || 0)}
                  />
                </div>

                <label className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    className="w-4 h-4 text-primary rounded border-border focus:ring-primary"
                    checked={trafficEnabled}
                    onChange={(e) => setTrafficEnabled(e.target.checked)}
                  />
                  <span className="text-sm">Enable traffic-aware routing</span>
                </label>
              </div>
            </div>

            <div className="flex gap-2">
              <button
                className="btn btn-primary flex-1"
                onClick={optimizeRoute}
                disabled={optimizing || stops.filter(s => s.address).length < 2}
              >
                {optimizing ? (
                  <span className="flex items-center gap-2"><span className="spinner" />Optimizing...</span>
                ) : (
                  <>
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                    </svg>
                    Optimize Route
                  </>
                )}
              </button>
              <label className="btn btn-outline" aria-label="Upload CSV">
                <input type="file" accept=".csv" className="hidden" onChange={handleFileUpload} />
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
                </svg>
              </label>
            </div>
          </div>

          {showResults && optimizedRoute && (
            <div className="card mt-4 animate-slideUp">
              <div className="card-header flex-between">
                <h3 className="font-semibold">Optimized Route</h3>
                <span className="badge badge-success">Ready</span>
              </div>
              <div className="card-body space-y-4">
                <div className="grid grid-2 gap-3">
                  <div className="p-3 bg-background rounded-lg">
                    <p className="text-xs text-muted">Total Distance</p>
                    <p className="text-xl font-bold text-primary">{optimizedRoute.totalDistance?.toFixed(1)} km</p>
                  </div>
                  <div className="p-3 bg-background rounded-lg">
                    <p className="text-xs text-muted">Estimated Time</p>
                    <p className="text-xl font-bold text-primary">{formatTime(optimizedRoute.estimatedTime)}</p>
                  </div>
                  <div className="p-3 bg-background rounded-lg">
                    <p className="text-xs text-muted">Fuel Estimate</p>
                    <p className="text-xl font-bold text-success">{optimizedRoute.fuelEstimate?.toFixed(1)} L</p>
                  </div>
                  <div className="p-3 bg-background rounded-lg">
                    <p className="text-xs text-muted">Fuel Cost</p>
                    <p className="text-xl font-bold text-warning">${optimizedRoute.fuelCost?.toFixed(2)}</p>
                  </div>
                </div>

                <div className="max-h-48 overflow-y-auto space-y-2">
                  <h4 className="font-medium text-sm">Stop Sequence</h4>
                  {optimizedRoute.optimizedStops?.map((stop, index) => (
                    <div key={index} className="flex items-center gap-2 text-sm p-2 bg-background rounded">
                      <span className="w-6 h-6 rounded-full bg-primary text-white flex items-center justify-center text-xs font-bold">{index + 1}</span>
                      <span className="flex-1 truncate font-medium">{stop.address}</span>
                      <span className={`badge ${getPriorityBadge(stop.priority)} text-xs`}>{stop.priority}</span>
                    </div>
                  ))}
                </div>

                <div className="flex gap-2 pt-2">
                  <button className="btn btn-primary flex-1" onClick={saveRoute}>
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 5a2 2 0 012-2h10a2 2 0 012 2v16l-7-3.5L5 21V5z" />
                    </svg>
                    Save Route
                  </button>
                  <button className="btn btn-outline" onClick={() => setShowResults(false)}>
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                    </svg>
                    New Route
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

function getPriorityBadge(priority) {
  switch (priority) {
    case 'urgent': return 'badge-error'
    case 'standard': return 'badge-primary'
    case 'low': return 'badge-success'
    default: return 'badge-info'
  }
}

function formatTime(minutes) {
  if (!minutes) return '-'
  const hrs = Math.floor(minutes / 60)
  const mins = Math.round(minutes % 60)
  return hrs > 0 ? `${hrs}h ${mins}m` : `${mins}m`
}