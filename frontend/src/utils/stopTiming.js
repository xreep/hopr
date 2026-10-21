import { formatClock } from './time'
import { formatDuration } from './format'

const IST_OFFSET_MIN = 330

// "HH:MM" IST on the IST calendar day of `dayOf`, as epoch milliseconds
function istClockOn(dayOf, hhmm) {
  const wall = new Date(new Date(dayOf).getTime() + IST_OFFSET_MIN * 60000)
  const [h, m] = hhmm.split(':').map(Number)
  return Date.UTC(wall.getUTCFullYear(), wall.getUTCMonth(), wall.getUTCDate()) + (h * 60 + m - IST_OFFSET_MIN) * 60000
}

// Plain-language timing for the stop a driver is heading to: how the planned ETA
// compares with now, and whether the customer's delivery window is open.
export function stopTiming(stop, now = Date.now()) {
  const etaMs = stop?.estimatedArrival ? new Date(stop.estimatedArrival).getTime() : NaN
  const out = { eta: formatClock(stop?.estimatedArrival), relative: null, late: false, window: null, windowState: null }
  if (!Number.isFinite(etaMs)) return out

  const diff = Math.round((etaMs - now) / 60000)
  if (diff > 1) out.relative = `in ${formatDuration(diff)}`
  else if (diff >= -5) out.relative = 'due now'
  else {
    out.relative = `running at least ${formatDuration(-diff)} late`
    out.late = true
  }

  if (stop.windowStart || stop.windowEnd) {
    const start = stop.windowStart ? istClockOn(etaMs, stop.windowStart) : null
    const end = stop.windowEnd ? istClockOn(etaMs, stop.windowEnd) : null
    if (start && now < start) {
      const mins = Math.ceil((start - now) / 60000)
      out.window = mins <= 120 ? `Window opens in ${formatDuration(mins)}` : `Window opens at ${stop.windowStart}`
      out.windowState = 'upcoming'
    } else if (end && now > end) {
      out.window = `Window closed at ${stop.windowEnd}`
      out.windowState = 'closed'
    } else {
      out.window = end ? `Window open until ${stop.windowEnd}` : `Window open since ${stop.windowStart}`
      out.windowState = 'open'
    }
  }
  return out
}
