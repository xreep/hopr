import { describe, it, expect } from 'vitest'
import { parseCsv, csvToStops, SAMPLE_CSV } from './csv'

describe('csv', () => {
  it('handles quoted commas, escaped quotes and CRLF', () => {
    expect(parseCsv('a,b\r\n"x, y","say ""hi"""\r\n')).toEqual([['a', 'b'], ['x, y', 'say "hi"']])
  })

  it('maps delivery columns to stops', () => {
    const { stops, errors } = csvToStops(SAMPLE_CSV)
    expect(errors).toEqual([])
    expect(stops).toHaveLength(2)
    expect(stops[1]).toMatchObject({
      customerName: 'Rahul Khanna', priority: 'urgent', windowStart: '10:30', windowEnd: '11:30',
      packageWeightKg: 6, coordinates: [77.2263, 28.5991]
    })
    expect(stops[0].address).toContain('Connaught Place, New Delhi')
  })

  it('accepts a combined "time window" column and requires an address column', () => {
    const { stops } = csvToStops('address,time window\nLalpur Chowk Ranchi,9:00-11:30\n')
    expect(stops[0]).toMatchObject({ windowStart: '09:00', windowEnd: '11:30', coordinates: null })
    expect(csvToStops('name\nx').errors[0]).toMatch(/address/)
  })
})
