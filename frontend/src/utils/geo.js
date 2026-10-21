// Geometry helpers for maps and live tracking. Coordinates are [lng, lat].
const R = 6371
const toRad = d => (d * Math.PI) / 180

export function haversineKm([lon1, lat1], [lon2, lat2]) {
  const dLat = toRad(lat2 - lat1)
  const dLon = toRad(lon2 - lon1)
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2
  return 2 * R * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
}

export function polylineLengthKm(coords) {
  let total = 0
  for (let i = 1; i < coords.length; i++) total += haversineKm(coords[i - 1], coords[i])
  return total
}

// Projects a point onto a polyline. Returns the nearest point, the distance along
// the line to it (km) and how far the point is from the line (km).
export function projectOnPolyline(point, coords) {
  if (!coords?.length) return null
  if (coords.length === 1) return { point: coords[0], alongKm: 0, offKm: haversineKm(point, coords[0]), segment: 0 }
  const refLat = toRad(point[1])
  const kx = R * Math.cos(refLat) * (Math.PI / 180)
  const ky = R * (Math.PI / 180)
  let best = null
  let along = 0
  for (let i = 1; i < coords.length; i++) {
    const a = coords[i - 1]
    const b = coords[i]
    const ax = a[0] * kx; const ay = a[1] * ky
    const bx = b[0] * kx; const by = b[1] * ky
    const px = point[0] * kx; const py = point[1] * ky
    const dx = bx - ax; const dy = by - ay
    const len2 = dx * dx + dy * dy
    let t = len2 ? ((px - ax) * dx + (py - ay) * dy) / len2 : 0
    t = Math.max(0, Math.min(1, t))
    const cx = ax + t * dx; const cy = ay + t * dy
    const off = Math.hypot(px - cx, py - cy)
    const segLen = haversineKm(a, b)
    if (!best || off < best.offKm) {
      best = { point: [cx / kx, cy / ky], alongKm: along + t * segLen, offKm: off, segment: i - 1 }
    }
    along += segLen
  }
  return best
}

// The point `km` along a polyline (clamped to its ends)
export function pointAlong(coords, km) {
  if (!coords?.length) return null
  if (km <= 0) return coords[0]
  let remaining = km
  for (let i = 1; i < coords.length; i++) {
    const seg = haversineKm(coords[i - 1], coords[i])
    if (remaining <= seg) {
      const t = seg ? remaining / seg : 0
      return [
        coords[i - 1][0] + (coords[i][0] - coords[i - 1][0]) * t,
        coords[i - 1][1] + (coords[i][1] - coords[i - 1][1]) * t
      ]
    }
    remaining -= seg
  }
  return coords[coords.length - 1]
}

// The part of a polyline between two along-distances (km)
export function slicePolyline(coords, fromKm, toKm = Infinity) {
  if (!coords?.length) return []
  const out = [pointAlong(coords, fromKm)]
  let along = 0
  for (let i = 1; i < coords.length; i++) {
    along += haversineKm(coords[i - 1], coords[i])
    if (along > fromKm && along < toKm) out.push(coords[i])
  }
  if (Number.isFinite(toKm)) out.push(pointAlong(coords, toKm))
  return out
}

// How far along a route (km) each stop is, given in visiting order. Each stop is
// matched only to the road after the previous one, so a route that doubles back
// past a later stop does not place it too early.
export function stopsAlongKm(stops, coords) {
  const out = []
  let from = 0
  for (const stop of stops) {
    const hit = projectOnPolyline(stop.coordinates, slicePolyline(coords, from))
    from += hit ? hit.alongKm : 0
    out.push(from)
  }
  return out
}

export function bearingDeg([lon1, lat1], [lon2, lat2]) {
  const y = Math.sin(toRad(lon2 - lon1)) * Math.cos(toRad(lat2))
  const x = Math.cos(toRad(lat1)) * Math.sin(toRad(lat2)) - Math.sin(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.cos(toRad(lon2 - lon1))
  return ((Math.atan2(y, x) * 180) / Math.PI + 360) % 360
}

export function boundsOf(coordsList) {
  const all = coordsList.filter(c => Array.isArray(c) && c.length === 2)
  if (!all.length) return null
  let minX = Infinity; let minY = Infinity; let maxX = -Infinity; let maxY = -Infinity
  for (const [x, y] of all) {
    minX = Math.min(minX, x); minY = Math.min(minY, y); maxX = Math.max(maxX, x); maxY = Math.max(maxY, y)
  }
  return [[minX, minY], [maxX, maxY]]
}

// Approximate circle polygon (for incident zones)
export function circlePolygon([lng, lat], radiusKm, steps = 48) {
  const ring = []
  for (let i = 0; i <= steps; i++) {
    const a = (i / steps) * 2 * Math.PI
    ring.push([
      lng + (radiusKm / (R * Math.cos(toRad(lat)))) * (180 / Math.PI) * Math.cos(a),
      lat + (radiusKm / R) * (180 / Math.PI) * Math.sin(a)
    ])
  }
  return ring
}
