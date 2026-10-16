import { describe, it, expect } from 'vitest'
import { planMove, positionAt, remainingFrom } from './tracking'
import { haversineKm } from './geo'

// Hub (Kokar) -> Lalpur Chowk -> Albert Ekka Chowk
const path = [[85.3521, 23.3756], [85.3383, 23.3722], [85.3249, 23.3702]]

describe('driver marker animation', () => {
  it('moves along the remaining route (around the corner), never cutting across', () => {
    const to = [85.3316, 23.3712] // past Lalpur, on the second leg
    const plan = planMove(path, path[0], to)
    expect(plan.kind).toBe('along')
    // Halfway through the move the marker is still on the route, not on the straight chord
    const mid = positionAt(plan, 0.5, { ease: false })
    const chordMid = [(path[0][0] + to[0]) / 2, (path[0][1] + to[1]) / 2]
    expect(haversineKm(mid, chordMid)).toBeGreaterThan(0.01)
    expect(positionAt(plan, 0)).toEqual(path[0])
    expect(positionAt(plan, 1)).toEqual(to)
  })

  it('never teleports: consecutive frames are close together', () => {
    const plan = planMove(path, path[0], path[2])
    let prev = positionAt(plan, 0)
    let maxStep = 0
    for (let i = 1; i <= 300; i++) {
      const p = positionAt(plan, i / 300)
      maxStep = Math.max(maxStep, haversineKm(prev, p))
      prev = p
    }
    // 2.8 km in 300 frames with easing: no single frame jumps more than ~2.5x the average
    expect(maxStep).toBeLessThan((plan.distanceKm / 300) * 2.5)
  })

  it('glides in a straight line when the new fix is off the planned path', () => {
    const plan = planMove(path, path[0], [85.36, 23.39])
    expect(plan.kind).toBe('straight')
    const half = positionAt(plan, 0.5, { ease: false })
    expect(half[0]).toBeCloseTo((85.3521 + 85.36) / 2, 6)
  })

  it('trims the remaining polyline to start at the drawn marker', () => {
    const rest = remainingFrom([85.345, 23.3739], path)
    expect(rest[0]).toEqual([85.345, 23.3739])
    expect(rest[rest.length - 1]).toEqual(path[2])
    expect(rest.length).toBe(3)
  })
})
