import { useEffect, useMemo, useRef, useState } from 'react'
import { INDIA_VIEW, INDIA_BOUNDS, ROUTE_GREEN, MAPBOX_TOKEN } from '../config'
import { boundsOf, circlePolygon } from '../utils/geo'

// One map component for every page.
//   lines:     [{ id, coordinates, color, width, dashed, opacity }]  (default colour: route green)
//   points:    [{ id, coordinates, label, variant: depot|stop|current|done|failed|late|muted, title }]
//   driver:    { coordinates, initials, stale }   (or drivers: [{ id, coordinates, initials, stale, title }])
//   incidents: [{ id, coordinates, radiusKm, type: congestion|closure, label }]
//   fitKey:    change it to re-fit the view to the content
// Street maps come from OpenFreeMap (OpenStreetMap data, free, no key) through MapLibre GL.
// If WebGL or the tiles are unavailable, a simplified SVG map is drawn instead.
export default function MapView(props) {
  const [failed, setFailed] = useState(false)
  return failed ? <SchematicMap {...props} /> : <StreetMap {...props} onFail={() => setFailed(true)} />
}

const STYLE_URL = 'https://tiles.openfreemap.org/styles/positron'
// With a Mapbox public token (VITE_MAPBOX_TOKEN) the street map comes from Mapbox (its
// Static Tiles API, light style); without one, from OpenFreeMap
const MAPBOX_STYLE = MAPBOX_TOKEN && {
  version: 8,
  sources: {
    mapbox: {
      type: 'raster',
      tiles: [`https://api.mapbox.com/styles/v1/mapbox/light-v11/tiles/256/{z}/{x}/{y}@2x?access_token=${MAPBOX_TOKEN}`],
      tileSize: 256,
      maxzoom: 20,
      attribution: '\u00a9 <a href="https://www.mapbox.com/about/maps/">Mapbox</a> \u00a9 <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
    }
  },
  layers: [{ id: 'mapbox', type: 'raster', source: 'mapbox' }]
}
const AMBER = '#F2B705'
const RED = '#C8102E'

function collectCoords({ lines = [], points = [], incidents = [] }) {
  return [
    ...lines.flatMap(l => l.coordinates || []),
    ...points.map(p => p.coordinates),
    ...incidents.map(i => i.coordinates)
  ].filter(Boolean)
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

function StreetMap({ lines = [], points = [], driver, drivers, incidents = [], fitKey, onMapClick, height = 420, className = '', insetBottom = 0, onFail }) {
  const driverList = useMemo(() => drivers || (driver ? [{ id: 'driver', ...driver }] : []), [drivers, driver])
  const container = useRef(null)
  const mapRef = useRef(null)
  const glRef = useRef(null)
  const markers = useRef(new Map())
  const driverMarkers = useRef(new Map())
  const [ready, setReady] = useState(false)
  const clickRef = useRef(onMapClick)
  const failRef = useRef(onFail)
  useEffect(() => { clickRef.current = onMapClick }, [onMapClick])
  useEffect(() => { failRef.current = onFail }, [onFail])

  useEffect(() => {
    let cancelled = false
    let map
    // No street map within 12 s (tile server unreachable): fall back to the simplified map
    const giveUp = setTimeout(() => { if (!cancelled) failRef.current?.() }, 12000)
    Promise.all([
      import('maplibre-gl'),
      // Bundled by Vite so the worker loads in development and in production builds
      import('maplibre-gl/dist/maplibre-gl-worker.mjs?worker&url'),
      import('maplibre-gl/dist/maplibre-gl.css')
    ])
      .then(([mod, worker]) => {
        if (cancelled || !container.current) return
        const maplibregl = mod.default ?? mod // MapLibre 6 is a plain ES module with named exports
        if (maplibregl.getWorkerUrl?.() !== worker.default) maplibregl.setWorkerUrl(worker.default)
        glRef.current = maplibregl
        try {
          map = new maplibregl.Map({
            container: container.current,
            style: MAPBOX_STYLE || STYLE_URL,
            center: INDIA_VIEW.center,
            zoom: INDIA_VIEW.zoom,
            attributionControl: { compact: true },
            cooperativeGestures: true,
            dragRotate: false,
            pitchWithRotate: false
          })
        } catch (err) {
          console.warn('Street map unavailable:', err.message)
          failRef.current?.()
          return
        }
        map.touchZoomRotate.disableRotation()
        map.addControl(new maplibregl.NavigationControl({ showCompass: false }), 'top-right')
        map.on('click', e => clickRef.current?.([e.lngLat.lng, e.lngLat.lat]))
        map.on('error', e => {
          // A missing tile is harmless; a style that never loads means no map at all
          if (!map.isStyleLoaded() && !map.loaded()) console.warn('Map error:', e?.error?.message)
        })
        map.on('load', () => {
          // English place names where OpenStreetMap has them (the base style mixes scripts)
          // (only layers that show names: road shields show reference numbers and are left alone)
          for (const layer of map.getStyle().layers || []) {
            const field = layer.type === 'symbol' ? map.getLayoutProperty(layer.id, 'text-field') : null
            if (field && JSON.stringify(field).includes('name')) {
              map.setLayoutProperty(layer.id, 'text-field', ['coalesce', ['get', 'name:en'], ['get', 'name_en'], ['get', 'name']])
            }
          }
          map.addSource('incidents', { type: 'geojson', data: { type: 'FeatureCollection', features: [] } })
          map.addLayer({ id: 'incidents-fill', type: 'fill', source: 'incidents', paint: { 'fill-color': ['get', 'color'], 'fill-opacity': 0.16 } })
          map.addLayer({ id: 'incidents-line', type: 'line', source: 'incidents', paint: { 'line-color': ['get', 'color'], 'line-width': 1.5, 'line-dasharray': [2, 1.5] } })
          map.addSource('lines', { type: 'geojson', data: { type: 'FeatureCollection', features: [] } })
          // Road-map convention: a white casing under each route line keeps it readable over streets
          map.addLayer({
            id: 'lines-casing',
            type: 'line',
            source: 'lines',
            layout: { 'line-join': 'round', 'line-cap': 'round' },
            paint: { 'line-color': '#FFFFFF', 'line-width': ['+', ['get', 'width'], 3], 'line-opacity': ['get', 'opacity'] }
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
            layout: { 'line-join': 'round', 'line-cap': 'butt' },
            paint: { 'line-color': ['get', 'color'], 'line-width': ['get', 'width'], 'line-opacity': ['get', 'opacity'], 'line-dasharray': [2, 1.5] }
          })
          clearTimeout(giveUp)
          if (!cancelled) setReady(true)
        })
        mapRef.current = map
      })
      .catch(err => {
        console.warn('Street map failed to load:', err?.message)
        if (!cancelled) failRef.current?.()
      })
    const markerMap = markers.current
    const driverMarkerMap = driverMarkers.current
    return () => {
      cancelled = true
      clearTimeout(giveUp)
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
    if (!map) return
    map.getCanvas().style.cursor = onMapClick ? 'crosshair' : ''
  }, [onMapClick, ready])

  useEffect(() => {
    const map = mapRef.current
    if (!ready || !map) return
    map.getSource('lines')?.setData({
      type: 'FeatureCollection',
      features: lines.filter(l => l.coordinates?.length > 1).map(l => ({
        type: 'Feature',
        properties: { color: l.color || ROUTE_GREEN, width: l.width || 4, opacity: l.opacity ?? 1, dashed: Boolean(l.dashed) },
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
        properties: { color: i.type === 'closure' ? RED : AMBER },
        geometry: { type: 'Polygon', coordinates: [circlePolygon(i.coordinates, i.radiusKm || 0.5)] }
      }))
    })
  }, [incidents, ready])

  useEffect(() => {
    const map = mapRef.current
    const gl = glRef.current
    if (!ready || !map || !gl) return
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
        markers.current.set(key, new gl.Marker({ element: markerElement(p) }).setLngLat(p.coordinates).addTo(map))
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
    const gl = glRef.current
    if (!ready || !map || !gl) return
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
        driverMarkers.current.set(key, new gl.Marker({ element: el }).setLngLat(d.coordinates).addTo(map))
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
    const coords = collectCoords({ lines, points, incidents })
    const padding = { top: 48, left: 48, right: 48, bottom: 48 + insetBottom }
    // A single point (just the hub) gets a neighbourhood view, not street level
    if (coords.length) map.fitBounds(boundsOf(coords), { padding, maxZoom: coords.length === 1 ? 12 : 15, duration: 500 })
    else map.fitBounds(INDIA_BOUNDS, { padding: 24, duration: 0 })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fitKey, ready])

  return <div ref={container} className={`map-container ${className}`} style={{ height }} />
}

// ---------- Simplified SVG map (no WebGL or no tiles) ----------
const W = 1000
const H = 620
const PAD = 72

const VARIANT_STYLE = {
  depot: { fill: '#15191D', stroke: '#15191D', text: '#FFFFFF' },
  stop: { fill: '#FFFFFF', stroke: ROUTE_GREEN, text: ROUTE_GREEN },
  current: { fill: ROUTE_GREEN, stroke: ROUTE_GREEN, text: '#FFFFFF' },
  done: { fill: '#EEF0F1', stroke: '#AEB6BD', text: '#5E6873' },
  failed: { fill: RED, stroke: RED, text: '#FFFFFF' },
  late: { fill: AMBER, stroke: '#15191D', text: '#15191D' },
  muted: { fill: '#FFFFFF', stroke: '#AEB6BD', text: '#5E6873' }
}

function SchematicMap({ lines = [], points = [], driver, drivers, incidents = [], fitKey, onMapClick, height = 420, className = '', insetBottom = 0 }) {
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
  const contentKey = JSON.stringify([fitKey, points.map(p => p.coordinates), insetBottom > 0])
  const projection = useMemo(() => {
    const padBottom = PAD + insetBottom * k
    const b = boundsOf(collectCoords({ lines, points, incidents })) || INDIA_BOUNDS
    const midLat = (b[0][1] + b[1][1]) / 2
    const kx = Math.cos((midLat * Math.PI) / 180)
    let spanX = Math.max((b[1][0] - b[0][0]) * kx, 0.004)
    let spanY = Math.max(b[1][1] - b[0][1], 0.004)
    const innerH = Math.max(120, H - PAD - padBottom)
    const scale = Math.min((W - 2 * PAD) / spanX, innerH / spanY)
    spanX = (W - 2 * PAD) / scale
    spanY = innerH / scale
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
  }, [contentKey, k > 0 && insetBottom ? Math.round(k * 10) : 0])

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
        role="img" aria-label="Route map (simplified view)" style={{ cursor: onMapClick ? 'crosshair' : 'default' }}>
        {incidents.map(i => {
          const [x, y] = projection.toXY(i.coordinates)
          const r = (i.radiusKm || 0.5) / projection.kmPerUnit
          const color = i.type === 'closure' ? RED : AMBER
          return (
            <g key={i.id}>
              <circle cx={x} cy={y} r={r} fill={color} fillOpacity="0.16" stroke={color} strokeDasharray={`${6 * k} ${4 * k}`} strokeWidth={1.5 * k} />
              {i.label && <text x={x} y={y - r - 6 * k} textAnchor="middle" fontSize={12 * k} fontWeight="700" fill="#15191D" fontFamily="Overpass, sans-serif">{i.label}</text>}
            </g>
          )
        })}
        {lines.filter(l => l.coordinates?.length > 1).map(l => {
          const width = (l.width || 4) * k * 0.85
          return (
            <g key={l.id} opacity={l.opacity ?? 1}>
              <polyline points={path(l.coordinates)} fill="none" stroke="#FFFFFF" strokeWidth={width + 3 * k} strokeLinecap="round" strokeLinejoin="round" />
              <polyline points={path(l.coordinates)} fill="none" stroke={l.color || ROUTE_GREEN} strokeWidth={width} strokeLinecap="round" strokeLinejoin="round"
                strokeDasharray={l.dashed ? `${width * 2} ${width * 1.6}` : undefined} />
            </g>
          )
        })}
        {points.filter(p => p.coordinates).map(p => {
          const [x, y] = projection.toXY(p.coordinates)
          const v = VARIANT_STYLE[p.variant] || VARIANT_STYLE.stop
          return (
            <g key={p.id}>
              {p.title && <title>{p.title}</title>}
              <rect x={x - 12 * k} y={y - 11 * k} width={24 * k} height={22 * k} rx={3 * k} fill={v.fill} stroke={v.stroke} strokeWidth={2 * k} />
              <text x={x} y={y + 4 * k} textAnchor="middle" fontSize={11 * k} fontWeight="800" fill={v.text} fontFamily="Overpass, sans-serif">{p.label ?? ''}</text>
            </g>
          )
        })}
        {driverList.filter(d => d.coordinates).map(d => {
          const [x, y] = projection.toXY(d.coordinates)
          return (
            <g key={d.id} transform={`translate(${x.toFixed(1)},${y.toFixed(1)})`}>
              {d.title && <title>{d.title}</title>}
              <circle r={17 * k} fill={d.stale ? '#8A929B' : '#1F4E9C'} stroke="#FFFFFF" strokeWidth={2.5 * k} />
              <text y={4 * k} textAnchor="middle" fontSize={11 * k} fontWeight="800" fill="#FFFFFF" fontFamily="Overpass, sans-serif">{d.initials || '•'}</text>
            </g>
          )
        })}
      </svg>
      <p className="schematic-note">Street map unavailable. Showing a simplified view.</p>
    </div>
  )
}

export { SchematicMap }
