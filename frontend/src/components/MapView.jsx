import { useEffect, useMemo, useRef, useState } from 'react'
import { MAPBOX_TOKEN, RANCHI_CENTRE } from '../config'
import { boundsOf, circlePolygon } from '../utils/geo'

// One map component for every page.
//   lines:     [{ id, coordinates, color, width, dashed, opacity }]
//   points:    [{ id, coordinates, label, variant: depot|stop|current|done|failed|late, title }]
//   driver:    { coordinates, initials, stale }   (or drivers: [{ id, coordinates, initials, stale, title }])
//   incidents: [{ id, coordinates, radiusKm, type: congestion|closure, label }]
//   fitKey:    change it to re-fit the view to the content
// Uses Mapbox GL when VITE_MAPBOX_TOKEN is set; otherwise renders an SVG schematic
// so planning, monitoring and tracking still work without a token.
export default function MapView(props) {
  return MAPBOX_TOKEN ? <MapboxMap {...props} /> : <SchematicMap {...props} />
}

const VARIANT_COLORS = {
  depot: '#0f172a',
  stop: '#1e3a8a',
  current: '#2563eb',
  done: '#10b981',
  failed: '#ef4444',
  late: '#f59e0b'
}

function collectCoords({ lines = [], points = [], incidents = [] }) {
  return [
    ...lines.flatMap(l => l.coordinates || []),
    ...points.map(p => p.coordinates),
    ...incidents.map(i => i.coordinates)
  ]
}

function markerElement(point) {
  const el = document.createElement('div')
  el.className = `map-marker map-marker-${point.variant || 'stop'}`
  el.textContent = point.label ?? ''
  if (point.title) el.title = point.title
  el.setAttribute('aria-label', point.title || `Stop ${point.label ?? ''}`)
  return el
}

function driverElement(driver) {
  const el = document.createElement('div')
  el.className = `driver-marker${driver.stale ? ' stale' : ''}`
  el.innerHTML = '<span class="driver-pulse"></span><span class="driver-avatar"></span>'
  el.querySelector('.driver-avatar').textContent = driver.initials || '🚚'
  return el
}

function MapboxMap({ lines = [], points = [], driver, drivers, incidents = [], fitKey, onMapClick, traffic = false, height = 420, className = '' }) {
  const driverList = useMemo(() => drivers || (driver ? [{ id: 'driver', ...driver }] : []), [drivers, driver])
  const container = useRef(null)
  const mapRef = useRef(null)
  const glRef = useRef(null)
  const markers = useRef(new Map())
  const driverMarkers = useRef(new Map())
  const [ready, setReady] = useState(false)
  const [failed, setFailed] = useState(false)
  const clickRef = useRef(onMapClick)
  useEffect(() => { clickRef.current = onMapClick }, [onMapClick])

  useEffect(() => {
    let cancelled = false
    let map
    Promise.all([import('mapbox-gl'), import('mapbox-gl/dist/mapbox-gl.css')])
      .then(([mod]) => {
        if (cancelled || !container.current) return
        const mapboxgl = mod.default
        mapboxgl.accessToken = MAPBOX_TOKEN
        glRef.current = mapboxgl
        map = new mapboxgl.Map({
          container: container.current,
          style: 'mapbox://styles/mapbox/streets-v12',
          center: RANCHI_CENTRE,
          zoom: 11.5,
          attributionControl: true
        })
        map.addControl(new mapboxgl.NavigationControl({ showCompass: false }), 'top-right')
        map.on('click', e => clickRef.current?.([e.lngLat.lng, e.lngLat.lat]))
        map.on('error', e => console.warn('Map error:', e?.error?.message))
        map.on('load', () => {
          map.addSource('traffic', { type: 'vector', url: 'mapbox://mapbox.mapbox-traffic-v1' })
          map.addLayer({
            id: 'traffic-layer',
            type: 'line',
            source: 'traffic',
            'source-layer': 'traffic',
            layout: { visibility: 'none' },
            paint: {
              'line-width': 2,
              'line-color': ['match', ['get', 'congestion'], 'low', '#22c55e', 'moderate', '#f59e0b', 'heavy', '#ef4444', 'severe', '#7f1d1d', '#94a3b8']
            }
          })
          map.addSource('incidents', { type: 'geojson', data: { type: 'FeatureCollection', features: [] } })
          map.addLayer({ id: 'incidents-fill', type: 'fill', source: 'incidents', paint: { 'fill-color': ['get', 'color'], 'fill-opacity': 0.18 } })
          map.addLayer({ id: 'incidents-line', type: 'line', source: 'incidents', paint: { 'line-color': ['get', 'color'], 'line-width': 2, 'line-dasharray': [2, 1] } })
          map.addSource('lines', { type: 'geojson', data: { type: 'FeatureCollection', features: [] } })
          map.addLayer({
            id: 'lines-solid',
            type: 'line',
            source: 'lines',
            filter: ['!=', ['get', 'dashed'], true],
            layout: { 'line-join': 'round', 'line-cap': 'round' },
            paint: { 'line-color': ['get', 'color'], 'line-width': ['get', 'width'], 'line-opacity': ['get', 'opacity'] }
          })
          map.addLayer({
            id: 'lines-dashed',
            type: 'line',
            source: 'lines',
            filter: ['==', ['get', 'dashed'], true],
            layout: { 'line-join': 'round', 'line-cap': 'round' },
            paint: { 'line-color': ['get', 'color'], 'line-width': ['get', 'width'], 'line-opacity': ['get', 'opacity'], 'line-dasharray': [1.5, 1.5] }
          })
          if (!cancelled) setReady(true)
        })
        mapRef.current = map
      })
      .catch(err => {
        console.warn('Mapbox failed to load', err)
        if (!cancelled) setFailed(true)
      })
    const markerMap = markers.current
    const driverMarkerMap = driverMarkers.current
    return () => {
      cancelled = true
      markerMap.forEach(m => m.remove())
      markerMap.clear()
      driverMarkerMap.forEach(m => m.remove())
      driverMarkerMap.clear()
      map?.remove()
      mapRef.current = null
    }
  }, [])

  // Lines
  useEffect(() => {
    const map = mapRef.current
    if (!ready || !map) return
    map.getSource('lines')?.setData({
      type: 'FeatureCollection',
      features: lines.filter(l => l.coordinates?.length > 1).map(l => ({
        type: 'Feature',
        properties: { color: l.color || '#1e3a8a', width: l.width || 4, opacity: l.opacity ?? 0.9, dashed: Boolean(l.dashed) },
        geometry: { type: 'LineString', coordinates: l.coordinates }
      }))
    })
  }, [lines, ready])

  // Incident zones
  useEffect(() => {
    const map = mapRef.current
    if (!ready || !map) return
    map.getSource('incidents')?.setData({
      type: 'FeatureCollection',
      features: incidents.map(i => ({
        type: 'Feature',
        properties: { color: i.type === 'closure' ? '#ef4444' : '#f59e0b' },
        geometry: { type: 'Polygon', coordinates: [circlePolygon(i.coordinates, i.radiusKm || 0.5)] }
      }))
    })
  }, [incidents, ready])

  useEffect(() => {
    const map = mapRef.current
    if (!ready || !map?.getLayer('traffic-layer')) return
    map.setLayoutProperty('traffic-layer', 'visibility', traffic ? 'visible' : 'none')
  }, [traffic, ready])

  // Stop markers
  useEffect(() => {
    const map = mapRef.current
    const mapboxgl = glRef.current
    if (!ready || !map || !mapboxgl) return
    const seen = new Set()
    points.forEach(p => {
      if (!p.coordinates) return
      const key = String(p.id)
      seen.add(key)
      const existing = markers.current.get(key)
      if (existing) {
        existing.setLngLat(p.coordinates)
        const el = existing.getElement()
        ;[...el.classList].filter(c => c.startsWith('map-marker-')).forEach(c => el.classList.remove(c))
        el.classList.add(`map-marker-${p.variant || 'stop'}`)
        el.textContent = p.label ?? ''
        if (p.title) el.title = p.title
      } else {
        markers.current.set(key, new mapboxgl.Marker({ element: markerElement(p) }).setLngLat(p.coordinates).addTo(map))
      }
    })
    for (const [key, marker] of markers.current) {
      if (!seen.has(key)) {
        marker.remove()
        markers.current.delete(key)
      }
    }
  }, [points, ready])

  // Driver markers (positions update every animation frame on the tracking page)
  useEffect(() => {
    const map = mapRef.current
    const mapboxgl = glRef.current
    if (!ready || !map || !mapboxgl) return
    const seen = new Set()
    driverList.forEach(d => {
      if (!d.coordinates) return
      const key = String(d.id)
      seen.add(key)
      const existing = driverMarkers.current.get(key)
      if (existing) {
        existing.setLngLat(d.coordinates)
        existing.getElement().classList.toggle('stale', Boolean(d.stale))
      } else {
        const el = driverElement(d)
        if (d.title) el.title = d.title
        driverMarkers.current.set(key, new mapboxgl.Marker({ element: el }).setLngLat(d.coordinates).addTo(map))
      }
    })
    for (const [key, marker] of driverMarkers.current) {
      if (!seen.has(key)) {
        marker.remove()
        driverMarkers.current.delete(key)
      }
    }
  }, [driverList, ready])

  // Fit to content when fitKey changes
  useEffect(() => {
    const map = mapRef.current
    if (!ready || !map) return
    const b = boundsOf(collectCoords({ lines, points, incidents }))
    if (b) map.fitBounds(b, { padding: 48, maxZoom: 15, duration: 600 })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fitKey, ready])

  if (failed) return <SchematicMap {...{ lines, points, drivers: driverList, incidents, fitKey, onMapClick, height, className }} />
  return <div ref={container} className={`map-container ${className}`} style={{ height }} />
}

// ---------- SVG fallback ----------
const W = 1000
const H = 620
const PAD = 48

function SchematicMap({ lines = [], points = [], driver, drivers, incidents = [], fitKey, onMapClick, height = 420, className = '' }) {
  const driverList = drivers || (driver ? [{ id: 'driver', ...driver }] : [])
  const svgRef = useRef(null)
  // SVG units per screen pixel, so markers and lines keep a constant on-screen size
  const [k, setK] = useState(1.6)
  useEffect(() => {
    const el = svgRef.current
    if (!el || typeof ResizeObserver === 'undefined') return undefined
    const ro = new ResizeObserver(([entry]) => {
      const { width, height: h } = entry.contentRect
      if (width > 0 && h > 0) setK(Math.max(W / width, H / h))
    })
    ro.observe(el)
    return () => ro.disconnect()
  }, [])
  // Bounds only change with fitKey/content, never with the moving driver (keeps the view stable)
  const contentKey = JSON.stringify([fitKey, points.map(p => p.coordinates), lines.map(l => l.coordinates?.length)])
  const projection = useMemo(() => {
    const b = boundsOf(collectCoords({ lines, points, incidents })) || [[RANCHI_CENTRE[0] - 0.05, RANCHI_CENTRE[1] - 0.04], [RANCHI_CENTRE[0] + 0.05, RANCHI_CENTRE[1] + 0.04]]
    const midLat = (b[0][1] + b[1][1]) / 2
    const kx = Math.cos((midLat * Math.PI) / 180)
    let spanX = Math.max((b[1][0] - b[0][0]) * kx, 0.004)
    let spanY = Math.max(b[1][1] - b[0][1], 0.004)
    const scale = Math.min((W - 2 * PAD) / spanX, (H - 2 * PAD) / spanY)
    spanX = (W - 2 * PAD) / scale
    spanY = (H - 2 * PAD) / scale
    const cx = ((b[0][0] + b[1][0]) / 2) * kx
    const cy = (b[0][1] + b[1][1]) / 2
    const x0 = cx - spanX / 2
    const y1 = cy + spanY / 2
    return {
      kmPerUnit: 111.32 / scale,
      toXY: ([lng, lat]) => [PAD + (lng * kx - x0) * scale, PAD + (y1 - lat) * scale],
      toLngLat: ([x, y]) => [((x - PAD) / scale + x0) / kx, y1 - (y - PAD) / scale]
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [contentKey])

  const handleClick = e => {
    if (!onMapClick || !svgRef.current) return
    const rect = svgRef.current.getBoundingClientRect()
    const sx = W / rect.width
    const sy = H / rect.height
    const s = Math.max(sx, sy) // preserveAspectRatio="meet"
    const offX = (rect.width * s - W) / 2
    const offY = (rect.height * s - H) / 2
    onMapClick(projection.toLngLat([(e.clientX - rect.left) * s - offX, (e.clientY - rect.top) * s - offY]))
  }

  const path = coords => coords.map(c => projection.toXY(c).map(n => n.toFixed(1)).join(',')).join(' ')

  return (
    <div className={`map-container schematic-map ${className}`} style={{ height }}>
      <svg ref={svgRef} viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="xMidYMid meet" onClick={handleClick}
        role="img" aria-label="Route map (schematic view)" style={{ cursor: onMapClick ? 'crosshair' : 'default' }}>
        <defs>
          <pattern id="schematic-grid" width="40" height="40" patternUnits="userSpaceOnUse">
            <path d="M 40 0 L 0 0 0 40" fill="none" stroke="currentColor" strokeOpacity="0.08" strokeWidth="1" />
          </pattern>
        </defs>
        <rect width={W} height={H} fill="url(#schematic-grid)" />
        {incidents.map(i => {
          const [x, y] = projection.toXY(i.coordinates)
          const r = (i.radiusKm || 0.5) / projection.kmPerUnit
          const color = i.type === 'closure' ? '#ef4444' : '#f59e0b'
          return (
            <g key={i.id}>
              <circle cx={x} cy={y} r={r} fill={color} fillOpacity="0.15" stroke={color} strokeDasharray={`${6 * k} ${4 * k}`} strokeWidth={2 * k} />
              {i.label && <text x={x} y={y - r - 6 * k} textAnchor="middle" fontSize={12 * k} fill={color}>{i.label}</text>}
            </g>
          )
        })}
        {lines.filter(l => l.coordinates?.length > 1).map(l => (
          <polyline key={l.id} points={path(l.coordinates)} fill="none" stroke={l.color || '#1e3a8a'}
            strokeWidth={(l.width || 4) * k} strokeOpacity={l.opacity ?? 0.9} strokeLinecap="round" strokeLinejoin="round"
            strokeDasharray={l.dashed ? `${8 * k} ${6 * k}` : undefined} className="route-line" />
        ))}
        {points.filter(p => p.coordinates).map(p => {
          const [x, y] = projection.toXY(p.coordinates)
          const color = VARIANT_COLORS[p.variant] || VARIANT_COLORS.stop
          return (
            <g key={p.id} className="schematic-point">
              {p.title && <title>{p.title}</title>}
              {p.variant === 'depot'
                ? <rect x={x - 12 * k} y={y - 12 * k} width={24 * k} height={24 * k} rx={5 * k} fill={color} stroke="#fff" strokeWidth={2 * k} />
                : <circle cx={x} cy={y} r={13 * k} fill={color} stroke="#fff" strokeWidth={2 * k} />}
              <text x={x} y={y + 4 * k} textAnchor="middle" fontSize={11 * k} fontWeight="700" fill="#fff">{p.label ?? ''}</text>
            </g>
          )
        })}
        {driverList.filter(d => d.coordinates).map(d => {
          const [x, y] = projection.toXY(d.coordinates)
          return (
            <g key={d.id} className={`schematic-driver${d.stale ? ' stale' : ''}`} transform={`translate(${x.toFixed(1)},${y.toFixed(1)})`}>
              {d.title && <title>{d.title}</title>}
              <circle r={28 * k} className="schematic-driver-pulse" />
              <circle r={17 * k} fill={d.stale ? '#94a3b8' : '#2563eb'} stroke="#fff" strokeWidth={3 * k} />
              <text y={4.5 * k} textAnchor="middle" fontSize={12 * k} fontWeight="700" fill="#fff">{d.initials || '•'}</text>
            </g>
          )
        })}
      </svg>
      <p className="schematic-note">Schematic view. Set VITE_MAPBOX_TOKEN for street maps.</p>
    </div>
  )
}

export { SchematicMap }
