// Smooth driver-marker motion for the customer tracking page. When a new GPS fix
// arrives we move the marker from where it is *drawn* to the new fix — along the
// remaining route if the fix lies on it, otherwise in a straight line. Never a jump.
import { haversineKm, pointAlong, projectOnPolyline, slicePolyline } from './geo'

const ON_PATH_KM = 0.15

export function planMove(currentPath, from, to) {
  if (!from || !to) return null
  if (currentPath?.length > 1) {
    const proj = projectOnPolyline(to, currentPath)
    if (proj && proj.offKm <= ON_PATH_KM && proj.alongKm > 0) {
      const path = slicePolyline(currentPath, 0, proj.alongKm)
      path[0] = from
      path[path.length - 1] = to
      return { kind: 'along', path, distanceKm: proj.alongKm }
    }
  }
  return { kind: 'straight', path: [from, to], distanceKm: haversineKm(from, to) }
}

const easeInOut = t => (t < 0.5 ? 2 * t * t : 1 - (-2 * t + 2) ** 2 / 2)

// Position after fraction t (0..1) of the move
export function positionAt(plan, t, { ease = true } = {}) {
  if (!plan) return null
  const k = Math.max(0, Math.min(1, t))
  const f = ease ? easeInOut(k) : k
  if (plan.kind === 'straight') {
    const [a, b] = plan.path
    return [a[0] + (b[0] - a[0]) * f, a[1] + (b[1] - a[1]) * f]
  }
  return pointAlong(plan.path, plan.distanceKm * f)
}

// Remaining polyline from the drawn marker position to the customer
export function remainingFrom(position, path) {
  if (!position || !path?.length) return path || []
  const proj = projectOnPolyline(position, path)
  if (!proj || proj.offKm > ON_PATH_KM) return [position, ...path]
  const rest = slicePolyline(path, proj.alongKm)
  rest[0] = position
  return rest
}
