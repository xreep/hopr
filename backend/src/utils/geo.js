// Geodesic helpers. Coordinates are GeoJSON order: [lng, lat].

const EARTH_RADIUS_KM = 6371
const toRad = deg => (deg * Math.PI) / 180

export function haversineKm([lon1, lat1], [lon2, lat2]) {
  const dLat = toRad(lat2 - lat1)
  const dLon = toRad(lon2 - lon1)
  const a = Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2
  return 2 * EARTH_RADIUS_KM * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
}

export function isValidCoordinate(c) {
  return Array.isArray(c) && c.length === 2 &&
    Number.isFinite(c[0]) && Number.isFinite(c[1]) &&
    c[0] >= -180 && c[0] <= 180 && c[1] >= -90 && c[1] <= 90
}

// Local equirectangular projection (km) around a reference latitude — accurate
// enough for city-scale geometry such as point-to-segment distances.
function project([lng, lat], refLat) {
  return [toRad(lng) * EARTH_RADIUS_KM * Math.cos(toRad(refLat)), toRad(lat) * EARTH_RADIUS_KM]
}

// Shortest distance (km) from point p to segment a-b, plus the fraction t along a-b
export function pointToSegment(p, a, b) {
  const refLat = (a[1] + b[1]) / 2
  const [px, py] = project(p, refLat)
  const [ax, ay] = project(a, refLat)
  const [bx, by] = project(b, refLat)
  const dx = bx - ax
  const dy = by - ay
  const lenSq = dx * dx + dy * dy
  let t = lenSq === 0 ? 0 : ((px - ax) * dx + (py - ay) * dy) / lenSq
  t = Math.max(0, Math.min(1, t))
  const cx = ax + t * dx
  const cy = ay + t * dy
  return { distanceKm: Math.hypot(px - cx, py - cy), t }
}

export function polylineLengthKm(coords) {
  let total = 0
  for (let i = 1; i < coords.length; i++) total += haversineKm(coords[i - 1], coords[i])
  return total
}

// Bearing (degrees, 0 = east, counter-clockwise) of `to` as seen from `from`
export function angleFrom(from, to) {
  const refLat = from[1]
  const [fx, fy] = project(from, refLat)
  const [tx, ty] = project(to, refLat)
  const deg = (Math.atan2(ty - fy, tx - fx) * 180) / Math.PI
  return (deg + 360) % 360
}
