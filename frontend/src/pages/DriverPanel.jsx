import { useState, useEffect, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import mapboxgl from 'mapbox-gl'
import 'mapbox-gl/dist/mapbox-gl.css'
import api from '../utils/api'
import toast from 'react-hot-toast'
import { useAuth } from '../context/AuthContext'

const MAPBOX_TOKEN = import.meta.env.VITE_MAPBOX_TOKEN

if (MAPBOX_TOKEN) {
  mapboxgl.accessToken = MAPBOX_TOKEN
}

const STATUS_OPTIONS = [
  { value: 'pending', label: 'Pending', color: 'warning' },
  { value: 'in_progress', label: 'In Progress', color: 'primary' },
  { value: 'completed', label: 'Completed', color: 'success' },
  { value: 'failed', label: 'Failed', color: 'error' }
]

export default function DriverPanel() {
  const { user, isDriver } = useAuth()
  const navigate = useNavigate()
  const mapContainer = useRef(null)
  const map = useRef(null)
  const markers = useRef([])
  
  const [assignedRoutes, setAssignedRoutes] = useState([])
  const [selectedRoute, setSelectedRoute] = useState(null)
  const [loading, setLoading] = useState(true)
  const [activeTab, setActiveTab] = useState('assigned')

  useEffect(() => {
    if (!isDriver) {
      navigate('/dashboard')
      return
    }
    fetchAssignedRoutes()
  }, [isDriver])

  useEffect(() => {
    if (mapContainer.current && !map.current && selectedRoute && MAPBOX_TOKEN) {
      initializeMap()
    }
    return () => {
      if (map.current) {
        map.current.remove()
        map.current = null
      }
    }
  }, [selectedRoute])

  const initializeMap = () => {
    if (!selectedRoute?.geometry) return

    map.current = new mapboxgl.Map({
      container: mapContainer.current,
      style: 'mapbox://styles/mapbox/streets-v12',
      center: selectedRoute.stops[0]?.coordinates || [-74.006, 40.7128],
      zoom: 12
    })

    map.current.addControl(new mapboxgl.NavigationControl(), 'top-right')

    displayRouteOnMap(selectedRoute)
  }

  const displayRouteOnMap = (route) => {
    if (!map.current || !route.geometry) return

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
      const isCurrent = route.currentStopIndex === index
      el.className = 'marker'
      el.innerHTML = `
        <div class="w-8 h-8 rounded-full flex items-center justify-center font-bold text-sm shadow-lg border-2 border-white ${
          isCurrent ? 'bg-primary text-white animate-pulse' : 'bg-green-500 text-white'
        }">
          ${index + 1}
        </div>
      `
      
      const marker = new mapboxgl.Marker(el)
        .setLngLat(stop.coordinates)
        .addTo(map.current)
      markers.current.push(marker)
    })

    const bounds = new mapboxgl.LngLatBounds()
    route.stops.forEach(stop => bounds.extend(stop.coordinates))
    map.current.fitBounds(bounds, { padding: 50, maxZoom: 14 })
  }

  const fetchAssignedRoutes = async () => {
    try {
      const response = await api.get('/routes/driver/assigned')
      setAssignedRoutes(response.data.routes || [])
    } catch (error) {
      toast.error('Failed to load routes')
    } finally {
      setLoading(false)
    }
  }

  const handleStatusChange = async (routeId, stopIndex, newStatus) => {
    try {
      await api.patch(`/routes/${routeId}/stops/${stopIndex}/status`, { status: newStatus })
      toast.success(`Stop marked as ${newStatus.replace('_', ' ')}`)
      fetchAssignedRoutes()
      if (selectedRoute?._id === routeId) {
        const updated = assignedRoutes.find(r => r._id === routeId)
        if (updated) setSelectedRoute(updated)
      }
    } catch (error) {
      toast.error('Failed to update status')
    }
  }

  const handleReportIssue = async (routeId, stopIndex, issue) => {
    try {
      await api.post(`/routes/${routeId}/stops/${stopIndex}/issues`, { issue })
      toast.success('Issue reported')
    } catch (error) {
      toast.error('Failed to report issue')
    }
  }

  const currentRoute = selectedRoute
  const currentStop = currentRoute?.stops?.[currentRoute?.currentStopIndex || 0]

  return (
    <div>
      <div className="page-header flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="page-title">Driver Panel</h1>
          <p className="page-subtitle">View and manage your assigned deliveries</p>
        </div>
      </div>

      <div className="grid grid-3 gap-4 mb-6">
        <div className="card stats-card">
          <p className="stats-label">Assigned Routes</p>
          <p className="stats-value">{assignedRoutes.length}</p>
        </div>
        <div className="card stats-card">
          <p className="stats-label">Pending</p>
          <p className="stats-value text-warning">
            {assignedRoutes.filter(r => r.status === 'pending').length}
          </p>
        </div>
        <div className="card stats-card">
          <p className="stats-label">Completed Today</p>
          <p className="stats-value text-success">
            {assignedRoutes.filter(r => r.status === 'completed' && new Date(r.updatedAt).toDateString() === new Date().toDateString()).length}
          </p>
        </div>
      </div>

      <div className="flex gap-4">
        <div className="w-full lg:w-2/5">
          <div className="card h-full">
            <div className="card-header">
              <h3 className="font-semibold">My Routes</h3>
            </div>
            <div className="card-body p-0">
              {loading ? (
                <div className="page-loader py-8"><div className="spinner" /></div>
              ) : assignedRoutes.length === 0 ? (
                <div className="text-center py-8 text-secondary">
                  <svg className="w-12 h-12 mx-auto mb-3 text-muted" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4" />
                  </svg>
                  <p>No routes assigned</p>
                </div>
              ) : (
                <div className="max-h-[500px] overflow-y-auto">
                  {assignedRoutes.map(route => (
                    <button
                      key={route._id}
                      className={`w-full p-4 text-left border-b hover:bg-background transition-colors flex items-start gap-3 ${
                        selectedRoute?._id === route._id ? 'bg-primary/5 border-l-4 border-primary' : ''
                      }`}
                      onClick={() => setSelectedRoute(route)}
                    >
                      <div className="flex-shrink-0 w-10 h-10 rounded-lg bg-primary/10 text-primary flex items-center justify-center text-sm font-bold">
                        {route.routeId?.slice(-4).toUpperCase()}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1">
                          <span className="font-medium truncate">{route.name || 'Unnamed Route'}</span>
                          <span className={`badge ${getStatusBadge(route.status)} text-xs`}>{route.status}</span>
                        </div>
                        <p className="text-sm text-secondary truncate">{route.stops?.length} stops • {(route.totalDistance || 0).toFixed(1)} km</p>
                        <p className="text-xs text-muted">ETA: {formatTime(route.estimatedTime)}</p>
                      </div>
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>

        <div className="w-full lg:w-3/5">
          {selectedRoute ? (
            <div className="card h-full flex flex-col">
              <div className="card-header flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                <div>
                  <h3 className="font-semibold">{selectedRoute.name || 'Route Details'}</h3>
                  <p className="text-sm text-secondary">{selectedRoute.routeId?.slice(-8).toUpperCase()}</p>
                </div>
                <div className="flex items-center gap-2">
                  <span className={`badge ${getStatusBadge(selectedRoute.status)}`}>{selectedRoute.status}</span>
                </div>
              </div>

              <div className="card-body flex-1 overflow-y-auto">
                {MAPBOX_TOKEN && selectedRoute?.geometry && (
                  <div className="mb-4 h-64 rounded-lg overflow-hidden">
                    <div className="h-full" ref={mapContainer} id="map" />
                  </div>
                )}
                {!MAPBOX_TOKEN && selectedRoute && (
                  <div className="mb-4 h-64 flex flex-col items-center justify-center bg-background border border-border rounded-lg p-8 text-center">
                    <svg className="w-16 h-16 text-muted mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 18.657A8 8 0 016.343 7.343S7 9 9 10c0-2 .5-5 2.986-7C14 5 16.09 5.777 17.656 7.343A7.975 7.975 0 0120 13a7.975 7.975 0 01-2.343 5.657z" />
                    </svg>
                    <h3 className="text-lg font-semibold text-primary mb-2">Mapbox Token Required</h3>
                    <p className="text-secondary mb-4">Add your Mapbox access token to enable interactive maps.</p>
                    <p className="text-sm text-muted">Set VITE_MAPBOX_TOKEN in your .env file</p>
                  </div>
                )}
                <div className="grid grid-2 gap-3 mb-4">
                  <div className="p-3 bg-background rounded-lg">
                    <p className="text-xs text-muted">Total Distance</p>
                    <p className="font-bold text-primary">{(selectedRoute.totalDistance || 0).toFixed(1)} km</p>
                  </div>
                  <div className="p-3 bg-background rounded-lg">
                    <p className="text-xs text-muted">Estimated Time</p>
                    <p className="font-bold text-primary">{formatTime(selectedRoute.estimatedTime)}</p>
                  </div>
                  <div className="p-3 bg-background rounded-lg">
                    <p className="text-xs text-muted">Fuel Estimate</p>
                    <p className="font-bold text-success">{(selectedRoute.fuelEstimate || 0).toFixed(1)} L</p>
                  </div>
                  <div className="p-3 bg-background rounded-lg">
                    <p className="text-xs text-muted">Current Stop</p>
                    <p className="font-bold text-primary">{selectedRoute.currentStopIndex + 1} / {selectedRoute.stops?.length}</p>
                  </div>
                </div>

                {currentStop && (
                  <div className="card mb-4" style={{ borderLeft: '4px solid var(--color-primary)' }}>
                    <div className="card-body">
                      <div className="flex items-start justify-between gap-3 mb-3">
                        <div>
                          <span className={`badge ${getPriorityBadge(currentStop.priority)} mb-1`}>{currentStop.priority}</span>
                          <h4 className="font-semibold">{currentStop.address}</h4>
                          {currentStop.timeWindow && (
                            <p className="text-sm text-secondary mt-1">
                              <svg className="w-4 h-4 inline mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                              </svg>
                              {currentStop.timeWindow}
                            </p>
                          )}
                        </div>
                        <div className="flex gap-2">
                          {STATUS_OPTIONS.filter(s => s.value !== 'failed' || currentStop.status === 'failed').map(status => (
                            <button
                              key={status.value}
                              className={`btn btn-sm ${currentStop.status === status.value ? `btn-${status.color}` : 'btn-outline'}`}
                              onClick={() => handleStatusChange(selectedRoute._id, selectedRoute.currentStopIndex, status.value)}
                              disabled={currentStop.status === 'completed' || currentStop.status === 'failed'}
                            >
                              {status.label}
                            </button>
                          ))}
                        </div>
                      </div>

                      {currentStop.notes && (
                        <p className="text-sm text-secondary mb-3">{currentStop.notes}</p>
                      )}

                      <div className="flex gap-2">
                        <button
                          className="btn btn-outline btn-sm flex-1"
                          onClick={() => {
                            const issue = prompt('Describe the issue:')
                            if (issue) handleReportIssue(selectedRoute._id, selectedRoute.currentStopIndex, issue)
                          }}
                        >
                          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                          </svg>
                          Report Issue
                        </button>
                        <a
                          href={`https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(currentStop.address)}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="btn btn-secondary btn-sm flex-1"
                        >
                          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 18.657A8 8 0 016.343 7.343S7 9 9 10c0-2 .5-5 2.986-7C14 5 16.09 5.777 17.656 7.343A7.975 7.975 0 0120 13a7.975 7.975 0 01-2.343 5.657z" />
                          </svg>
                          Navigate
                        </a>
                      </div>
                    </div>
                  </div>
                )}

                <div>
                  <h4 className="font-medium mb-3">All Stops</h4>
                  <div className="space-y-2 max-h-64 overflow-y-auto">
                    {selectedRoute.stops?.map((stop, index) => (
                      <div
                        key={index}
                        className={`p-3 rounded-lg flex items-center gap-3 ${
                          index === selectedRoute.currentStopIndex ? 'bg-primary/5 border border-primary' : 'bg-background'
                        }`}
                      >
                        <div className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold ${
                          index < selectedRoute.currentStopIndex ? 'bg-success text-white' :
                          index === selectedRoute.currentStopIndex ? 'bg-primary text-white animate-pulse' :
                          'bg-muted text-white'
                        }`}>
                          {index + 1}
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="font-medium truncate">{stop.address}</p>
                          <div className="flex items-center gap-2 text-xs text-muted">
                            <span className={`badge ${getPriorityBadge(stop.priority)} text-xs`}>{stop.priority}</span>
                            <span className={`badge ${getStatusBadge(stop.status)} text-xs`}>{stop.status}</span>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          ) : (
            <div className="card h-[500px] flex items-center justify-center">
              <div className="text-center text-secondary">
                <svg className="w-16 h-16 mx-auto mb-4 text-muted" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4" />
                </svg>
                <p>Select a route to view details and navigate</p>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

function getStatusBadge(status) {
  switch (status) {
    case 'completed': return 'badge-success'
    case 'in_progress': return 'badge-primary'
    case 'pending': return 'badge-warning'
    case 'failed': return 'badge-error'
    default: return 'badge-info'
  }
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