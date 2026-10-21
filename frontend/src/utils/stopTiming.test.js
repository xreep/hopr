import { describe, it, expect } from 'vitest'
import { stopTiming } from './stopTiming'

// Planned ETA 10:30 IST on 21 Oct 2026, window 11:00 to 12:30 IST
const stop = { estimatedArrival: '2026-10-21T05:00:00.000Z', windowStart: '11:00', windowEnd: '12:30' }
const ist = hhmm => new Date(`2026-10-21T${hhmm}:00+05:30`).getTime()

describe('stopTiming', () => {
  it('counts down to the ETA and the window opening', () => {
    const t = stopTiming(stop, ist('10:18'))
    expect(t).toMatchObject({ eta: '10:30', relative: 'in 12m', late: false, window: 'Window opens in 42m', windowState: 'upcoming' })
  })

  it('says "due now" around the ETA', () => {
    expect(stopTiming(stop, ist('10:33')).relative).toBe('due now')
  })

  it('says how late the driver is running instead of "N min ago"', () => {
    const t = stopTiming(stop, ist('11:40'))
    expect(t.relative).toBe('running at least 1h 10m late')
    expect(t.late).toBe(true)
    expect(t).toMatchObject({ window: 'Window open until 12:30', windowState: 'open' })
  })

  it('flags a window that has closed', () => {
    expect(stopTiming(stop, ist('12:45'))).toMatchObject({ window: 'Window closed at 12:30', windowState: 'closed' })
  })

  it('gives the opening time when the window is hours away', () => {
    expect(stopTiming(stop, ist('06:00')).window).toBe('Window opens at 11:00')
  })

  it('copes with stops that have no window or no ETA', () => {
    expect(stopTiming({ estimatedArrival: stop.estimatedArrival }, ist('10:00')).window).toBeNull()
    expect(stopTiming({}, ist('10:00'))).toMatchObject({ eta: '--:--', relative: null })
  })
})
