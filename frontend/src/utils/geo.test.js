import { describe, it, expect } from 'vitest'
import { haversineKm, projectOnPolyline, pointAlong, slicePolyline, polylineLengthKm } from './geo'

const line = [[85.35, 23.37], [85.34, 23.37], [85.34, 23.38]]

describe('geo helpers', () => {
  it('measures distances', () => {
    expect(haversineKm([85.3521, 23.3756], [85.3383, 23.3722])).toBeCloseTo(1.45, 1)
  })

  it('projects a point onto a polyline', () => {
    const p = projectOnPolyline([85.345, 23.3705], line)
    expect(p.segment).toBe(0)
    expect(p.point[0]).toBeCloseTo(85.345, 6)
    expect(p.point[1]).toBeCloseTo(23.37, 6)
    expect(p.alongKm).toBeCloseTo(haversineKm(line[0], [85.345, 23.37]), 3)
  })

  it('finds points along and slices the polyline', () => {
    const total = polylineLengthKm(line)
    expect(pointAlong(line, 0)).toEqual(line[0])
    expect(pointAlong(line, total + 5)).toEqual(line[2])
    const half = pointAlong(line, haversineKm(line[0], line[1]) / 2)
    expect(half[0]).toBeCloseTo(85.345, 5)
    const rest = slicePolyline(line, haversineKm(line[0], line[1]) / 2)
    expect(rest).toHaveLength(3)
    expect(rest[rest.length - 1]).toEqual(line[2])
  })
})
