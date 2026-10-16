import { describe, it, expect } from 'vitest'
import { formatDuration, formatINR, formatKm, initials } from './format'

describe('format helpers', () => {
  it('formats minutes as hours and minutes', () => {
    expect(formatDuration(0)).toBe('0m')
    expect(formatDuration(45)).toBe('45m')
    expect(formatDuration(125.4)).toBe('2h 5m')
    expect(formatDuration(undefined)).toBe('-')
  })

  it('formats rupees with Indian grouping', () => {
    expect(formatINR(123456.5)).toBe('₹1,23,456.50')
    expect(formatINR('abc')).toBe('₹0.00')
  })

  it('formats kilometres', () => {
    expect(formatKm(12.345)).toBe('12.3 km')
  })

  it('builds initials', () => {
    expect(initials('Ravi Kumar Oraon')).toBe('RK')
    expect(initials('')).toBe('?')
  })
})
