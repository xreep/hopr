// Shortest paths around closed roads. A manager can mark an area as closed (a circle on
// the map). A leg that would cross it has to go round, and how far round is a
// shortest-path problem: the closures are obstacles, and the path runs through a
// visibility graph whose nodes are the leg's two ends and points just outside each
// closure, with an edge wherever the straight line between two nodes stays clear of
// every closure. A* finds the shortest path (heuristic: straight-line distance to the
// end, which never overestimates, so the answer is exact for this graph); Dijkstra is
// the same search without the heuristic, kept so the two can be compared.
import { haversineKm, pointToSegment } from '../utils/geo.js'

const SIDES = 16
// Polygon corners sit at r / cos(pi / SIDES) so every side of the polygon stays outside
// the circle, plus a small margin
const CORNER_SCALE = 1.02 / Math.cos(Math.PI / SIDES)

const toRad = d => (d * Math.PI) / 180
const KM_PER_DEG_LAT = 110.574

// A point `km` away from `centre` at `angle` radians (east = 0, counter-clockwise)
function offset([lng, lat], km, angle) {
  const dLat = (km * Math.sin(angle)) / KM_PER_DEG_LAT
  const dLng = (km * Math.cos(angle)) / (111.32 * Math.cos(toRad(lat)))
  return [lng + dLng, lat + dLat]
}

export function closureObstacles(incidents = []) {
  return incidents
    .filter(i => i?.type === 'closure' && Array.isArray(i.coordinates))
    .map(i => ({ centre: i.coordinates, radiusKm: i.radiusKm ?? 0.5 }))
}

const blocks = (o, a, b) => pointToSegment(o.centre, a, b).distanceKm < o.radiusKm - 1e-6
const insideAny = (p, obstacles) => obstacles.some(o => haversineKm(p, o.centre) < o.radiusKm - 1e-6)
export const legBlocked = (a, b, obstacles) => obstacles.some(o => blocks(o, a, b))

// Shortest path from a to b around the obstacles. Returns { km, path, expanded } where
// `expanded` counts the nodes the search had to settle, or null when a or b lies inside
// a closure (no way round exists).
export function shortestPathAround(a, b, obstacles, { algorithm = 'astar' } = {}) {
  if (!legBlocked(a, b, obstacles)) return { km: haversineKm(a, b), path: [a, b], expanded: 0 }
  if (insideAny(a, obstacles) || insideAny(b, obstacles)) return null

  const corners = obstacles.flatMap(o => Array.from({ length: SIDES }, (_, k) => offset(o.centre, o.radiusKm * CORNER_SCALE, (2 * Math.PI * k) / SIDES)))
    .filter(p => !insideAny(p, obstacles))
  const nodes = [a, b, ...corners]
  const n = nodes.length
  const visible = new Map()
  const canSee = (i, j) => {
    const key = i < j ? `${i}:${j}` : `${j}:${i}`
    if (!visible.has(key)) visible.set(key, !legBlocked(nodes[i], nodes[j], obstacles))
    return visible.get(key)
  }

  const heuristic = algorithm === 'astar' ? i => haversineKm(nodes[i], b) : () => 0
  const g = new Float64Array(n).fill(Infinity)
  const prev = new Int32Array(n).fill(-1)
  const settled = new Uint8Array(n)
  g[0] = 0
  let expanded = 0
  for (;;) {
    // The graph is small (two ends plus 16 corners per closure): a linear scan for the
    // open node with the lowest g + h is simpler and fast enough
    let current = -1
    let best = Infinity
    for (let i = 0; i < n; i++) {
      if (settled[i] || g[i] === Infinity) continue
      const f = g[i] + heuristic(i)
      if (f < best) {
        best = f
        current = i
      }
    }
    if (current === -1) return null
    settled[current] = 1
    expanded++
    if (current === 1) break
    for (let j = 0; j < n; j++) {
      if (settled[j] || j === current || !canSee(current, j)) continue
      const through = g[current] + haversineKm(nodes[current], nodes[j])
      if (through < g[j] - 1e-12) {
        g[j] = through
        prev[j] = current
      }
    }
  }

  const path = []
  for (let i = 1; i !== -1; i = prev[i]) path.unshift(nodes[i])
  return { km: g[1], path, expanded }
}

// How much further a leg is when it has to go round the closures it crosses
export function closureDetourKm(a, b, obstacles) {
  const around = shortestPathAround(a, b, obstacles)
  return around ? Math.max(0, around.km - haversineKm(a, b)) : null
}
