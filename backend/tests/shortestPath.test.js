import { describe, it, expect } from 'vitest'
import { shortestPathAround, closureDetourKm, legBlocked } from '../src/services/shortestPath.js'
import { legIncidentEffect } from '../src/services/traffic.js'
import { haversineKm } from '../src/utils/geo.js'

// A leg 4 km long running due east through Ranchi, and a closure on its middle
const lat = 23.36
const kmToLng = km => km / (111.32 * Math.cos((lat * Math.PI) / 180))
const at = km => [85.3 + kmToLng(km), lat]
const a = at(0)
const b = at(4)
const closure = (km, radiusKm) => ({ centre: at(km), radiusKm })

// Exact shortest way round a circle of radius r centred between two points d away on
// each side: two tangent lines plus the arc between them
const aroundCircle = (d, r) => 2 * Math.sqrt(d * d - r * r) + r * (Math.PI - 2 * Math.acos(r / d))

describe('shortest paths around road closures', () => {
  it('goes straight when nothing is in the way', () => {
    const path = shortestPathAround(a, b, [closure(2, 0.5)].map(c => ({ ...c, centre: [c.centre[0], lat + 0.05] })))
    expect(path.km).toBeCloseTo(haversineKm(a, b), 6)
    expect(path.path).toHaveLength(2)
  })

  it('finds the true shortest way round a closure, within 1% of the exact geometry', () => {
    const around = shortestPathAround(a, b, [closure(2, 0.5)])
    expect(legBlocked(a, b, [closure(2, 0.5)])).toBe(true)
    expect(around.km).toBeGreaterThan(aroundCircle(2, 0.5) * 0.999)
    expect(around.km).toBeLessThan(aroundCircle(2, 0.5) * 1.01)
    expect(around.path.length).toBeGreaterThan(2)
  })

  it('gives the same answer with A* and Dijkstra, and A* settles fewer nodes', () => {
    const closures = [closure(1.2, 0.4), closure(2.8, 0.5)]
    const astar = shortestPathAround(a, b, closures, { algorithm: 'astar' })
    const dijkstra = shortestPathAround(a, b, closures, { algorithm: 'dijkstra' })
    expect(astar.km).toBeCloseTo(dijkstra.km, 9)
    expect(astar.expanded).toBeLessThan(dijkstra.expanded)
  })

  it('has no way round when a stop is inside the closed area', () => {
    expect(shortestPathAround(at(2), b, [closure(2, 0.5)])).toBeNull()
    expect(closureDetourKm(at(2), b, [closure(2, 0.5)])).toBeNull()
  })

  it('charges a leg the real detour, not a rule of thumb', () => {
    const effect = legIncidentEffect(a, b, [{ type: 'closure', coordinates: at(2), radiusKm: 0.5 }])
    expect(effect.extraKm).toBeCloseTo(aroundCircle(2, 0.5) - 4, 1)
    expect(effect.timeFactor).toBeCloseTo(1.15, 6)
  })
})
