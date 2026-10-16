import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { MAPBOX_TOKEN, RANCHI_CENTRE } from '../config'
import { boundsOf, circlePolygon } from '../utils/geo'

// One map component for every page.
//   lines:     [{ id, coordinates, color, width, dashed, opacity }]  (default colour: volt)
//   points:    [{ id, coordinates, label, variant: depot|stop|current|done|failed|late|muted, title }]
//   driver:    { coordinates, initials, stale }   (or drivers: [{ id, coordinates, initials, stale, title }])
//   incidents: [{ id, coordinates, radiusKm, type: congestion|closure, label }]
//   fitKey:    change it to re-fit the view (and replay the route-drawing animation)
// Mapbox GL (dark style) when VITE_MAPBOX_TOKEN is set; otherwise an SVG schematic.
export default function MapView(props) {
  return MAPBOX_TOKEN ? <MapboxMap {...props} /> : <SchematicMap {...props} />
}

const VOLT = '#D4FF3F'
const AMBER = '#F5B544'
const CORAL = '#FF6B78'

const VARIANT_STYLE = {
  depot: { fill: '#F4F7FB', stroke: '#F4F7FB', text: '#070B14', square: true },
  stop: { fill: '#070B14', stroke: VOLT, text: '#F4F7FB' },
  current: { fill: VOLT, stroke: VOLT, text: '#070B14', glow: true },
  done: { fill: '#0E1626', stroke: '#2A3756', text: '#8591A8' },
  failed: { fill: CORAL, stroke: CORAL, text: '#070B14' },
  late: { fill: '#070B14', stroke: AMBER, text: AMBER },
  muted: { fill: '#070B14', stroke: '#76839C', text: '#A9B4C8' }
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
  el.querySelector('.driver-avatar').textContent = driver.initials || '•'
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
          style: 'mapbox://styles/mapbox/dark-v11',
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
              'line-width': 1.5,
              'line-opacity': 0.75,
              'line-color': ['match', ['get', 'congestion'], 'low', '#3C4A66', 'moderate', AMBER, 'heavy', CORAL, 'severe', '#B4232F', '#3C4A66']
            }
          })
          map.addSource('incidents', { type: 'geojson', data: { type: 'FeatureCollection', features: [] } })
          map.addLayer({ id: 'incidents-fill', type: 'fill', source: 'incidents', paint: { 'fill-color': ['get', 'color'], 'fill-opacity': 0.14 } })
          map.addLayer({ id: 'incidents-line', type: 'line', source: 'incidents', paint: { 'line-color': ['get', 'color'], 'line-width': 1.5, 'line-dasharray': [2, 1.5] } })
          map.addSource('lines', { type: 'geojson', data: { type: 'FeatureCollection', features: [] } })
          map.addLayer({
            id: 'lines-glow',
            type: 'line',
            source: 'lines',
            layout: { 'line-join': 'round', 'line-cap': 'round' },
            paint: { 'line-color': ['get', 'color'], 'line-width': ['+', ['get', 'width'], 8], 'line-blur': 8, 'line-opacity': ['*', ['get', 'opacity'], 0.35] }
          })
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

  useEffect(() => {
    const map = mapRef.current
    if (!ready || !map) return
    map.getSource('lines')?.setData({
      type: 'FeatureCollection',
      features: lines.filter(l => l.coordinates?.length > 1).map(l => ({
        type: 'Feature',
        properties: { color: l.color || VOLT, width: l.width || 4, opacity: l.opacity ?? 0.95, dashed: Boolean(l.dashed) },
        geometry: { type: 'LineString', coordinates: l.coordinates }
      }))
    })
  }, [lines, ready])

  useEffect(() => {
    const map = mapRef.current
    if (!ready || !map) return
    map.getSource('incidents')?.setData({
      type: 'FeatureCollection',
      features: incidents.map(i => ({
        type: 'Feature',
        properties: { color: i.type === 'closure' ? CORAL : AMBER },
        geometry: { type: 'Polygon', coordinates: [circlePolygon(i.coordinates, i.radiusKm || 0.5)] }
      }))
    })
  }, [incidents, ready])

  useEffect(() => {
    const map = mapRef.current
    if (!ready || !map?.getLayer('traffic-layer')) return
    map.setLayoutProperty('traffic-layer', 'visibility', traffic ? 'visible' : 'none')
  }, [traffic, ready])

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

  useEffect(() => {
    const map = mapRef.current
    if (!ready || !map) return
    const b = boundsOf(collectCoords({ lines, points, incidents }))
    if (b) map.fitBounds(b, { padding: 56, maxZoom: 15, duration: 700 })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fitKey, ready])

  if (failed) return <SchematicMap {...{ lines, points, drivers: driverList, incidents, fitKey, onMapClick, height, className }} />
  return <div ref={container} className={`map-container ${className}`} style={{ height }} />
}

// ---------- SVG schematic (no token) ----------
const W = 1000
const H = 620
const PAD = 72

// A polyline that draws itself once per `drawKey`, then becomes a plain line
function SchematicLine({ points, color, width, opacity, dashed, glow, drawKey }) {
  const ref = useRef(null)
  const [drawing, setDrawing] = useState(true)
  useLayoutEffect(() => {
    const el = ref.current
    if (!el) return
    el.style.setProperty('--route-length', String(Math.ceil(el.getTotalLength?.() || 4000)))
    setDrawing(true)
  }, [drawKey])
  const animate = drawing && !dashed
  return (
    <polyline
      ref={ref}
      points={points}
      fill="none"
      stroke={color}
      strokeWidth={width}
      strokeOpacity={opacity}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={`${glow ? 'schematic-route-glow' : ''} ${animate ? 'route-line is-drawing' : ''}`}
      style={animate ? { strokeDasharray: 'var(--route-length)', strokeDashoffset: 'var(--route-length)' } : undefined}
      strokeDasharray={dashed ? `${width * 2} ${width * 1.6}` : undefined}
      onAnimationEnd={() => setDrawing(false)}
    />
  )
}

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

  // Bounds only change with fitKey or the stop markers, never while a driver moves
  // or a remaining path shrinks, so the view stays put during live tracking
  const contentKey = JSON.stringify([fitKey, points.map(p => p.coordinates)])
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
    const s = Math.max(W / rect.width, H / rect.height) // preserveAspectRatio="meet"
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
          <pattern id="schematic-grid" width={40 * k} height={40 * k} patternUnits="userSpaceOnUse">
            <path d={`M ${40 * k} 0 L 0 0 0 ${40 * k}`} fill="none" stroke="#A9B4C8" strokeOpacity="0.07" strokeWidth={k} />
          </pattern>
        </defs>
        <rect width={W} height={H} fill="url(#schematic-grid)" />
        {incidents.map(i => {
          const [x, y] = projection.toXY(i.coordinates)
          const r = (i.radiusKm || 0.5) / projection.kmPerUnit
          const color = i.type === 'closure' ? CORAL : AMBER
          return (
            <g key={i.id}>
              <circle cx={x} cy={y} r={r} fill={color} fillOpacity="0.12" stroke={color} strokeDasharray={`${6 * k} ${4 * k}`} strokeWidth={1.5 * k} />
              {i.label && <text x={x} y={y - r - 6 * k} textAnchor="middle" fontSize={12 * k} fill={color} fontFamily="Inter, sans-serif">{i.label}</text>}
            </g>
          )
        })}
        {lines.filter(l => l.coordinates?.length > 1).map(l => {
          const color = l.color || VOLT
          return (
            <SchematicLine key={l.id} drawKey={fitKey} points={path(l.coordinates)} color={color}
              width={(l.width || 4) * k * 0.85} opacity={l.opacity ?? 0.95} dashed={l.dashed} glow={color === VOLT && (l.opacity ?? 1) > 0.6} />
          )
        })}
        {points.filter(p => p.coordinates).map((p, i) => {
          const [x, y] = projection.toXY(p.coordinates)
          const v = VARIANT_STYLE[p.variant] || VARIANT_STYLE.stop
          return (
            <g key={p.id} className="schematic-point nd-hop-dot" style={{ animationDelay: `${250 + i * 70}ms` }}>
              {p.title && <title>{p.title}</title>}
              {v.glow && <circle cx={x} cy={y} r={20 * k} fill={VOLT} fillOpacity="0.18" />}
              {v.square
                ? <rect x={x - 12 * k} y={y - 12 * k} width={24 * k} height={24 * k} rx={6 * k} fill={v.fill} stroke={v.stroke} strokeWidth={2 * k} />
                : <circle cx={x} cy={y} r={12.5 * k} fill={v.fill} stroke={v.stroke} strokeWidth={2 * k} />}
              <text x={x} y={y + 4 * k} textAnchor="middle" fontSize={11 * k} fontWeight="700" fill={v.text} fontFamily='"Space Grotesk", sans-serif'>{p.label ?? ''}</text>
            </g>
          )
        })}
        {driverList.filter(d => d.coordinates).map(d => {
          const [x, y] = projection.toXY(d.coordinates)
          return (
            <g key={d.id} className={`schematic-driver${d.stale ? ' stale' : ''}`} transform={`translate(${x.toFixed(1)},${y.toFixed(1)})`}>
              {d.title && <title>{d.title}</title>}
              <circle r={26 * k} className="schematic-driver-pulse" />
              <circle r={17 * k} fill="#070B14" stroke={d.stale ? '#76839C' : VOLT} strokeWidth={2.5 * k}
                style={d.stale ? undefined : { filter: 'drop-shadow(0 0 6px rgb(212 255 63 / 0.6))' }} />
              <text y={4.5 * k} textAnchor="middle" fontSize={12 * k} fontWeight="700" fill={d.stale ? '#8591A8' : '#F4F7FB'} fontFamily='"Space Grotesk", sans-serif'>{d.initials || '•'}</text>
            </g>
          )
        })}
      </svg>
      <p className="schematic-note">Schematic view. Set VITE_MAPBOX_TOKEN for street maps.</p>
    </div>
  )
}

export { SchematicMap }
