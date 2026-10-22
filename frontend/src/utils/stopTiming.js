import { formatClock } from './time'
import { durationIn, translate } from '../i18n/strings'

const IST_OFFSET_MIN = 330

// "HH:MM" IST on the IST calendar day of `dayOf`, as epoch milliseconds
function istClockOn(dayOf, hhmm) {
  const wall = new Date(new Date(dayOf).getTime() + IST_OFFSET_MIN * 60000)
  const [h, m] = hhmm.split(':').map(Number)
  return Date.UTC(wall.getUTCFullYear(), wall.getUTCMonth(), wall.getUTCDate()) + (h * 60 + m - IST_OFFSET_MIN) * 60000
}

// Plain-language timing for the stop a driver is heading to: how the planned ETA
// compares with now, and whether the customer's delivery window is open. `lang` picks the
// language of the phrases.
export function stopTiming(stop, now = Date.now(), lang = 'en') {
  const t = (key, vars) => translate(lang, key, vars)
  const formatDuration = minutes => durationIn(lang, minutes)
  const etaMs = stop?.estimatedArrival ? new Date(stop.estimatedArrival).getTime() : NaN
  const out = { eta: formatClock(stop?.estimatedArrival), relative: null, late: false, window: null, windowState: null }
  if (!Number.isFinite(etaMs)) return out

  const diff = Math.round((etaMs - now) / 60000)
  if (diff > 1) out.relative = t('timing.in', { time: formatDuration(diff) })
  else if (diff >= -5) out.relative = t('timing.dueNow')
  else {
    out.relative = t('timing.late', { time: formatDuration(-diff) })
    out.late = true
  }

  if (stop.windowStart || stop.windowEnd) {
    const start = stop.windowStart ? istClockOn(etaMs, stop.windowStart) : null
    const end = stop.windowEnd ? istClockOn(etaMs, stop.windowEnd) : null
    if (start && now < start) {
      const mins = Math.ceil((start - now) / 60000)
      out.window = mins <= 120 ? t('timing.opensIn', { time: formatDuration(mins) }) : t('timing.opensAt', { clock: stop.windowStart })
      out.windowState = 'upcoming'
    } else if (end && now > end) {
      out.window = t('timing.closedAt', { clock: stop.windowEnd })
      out.windowState = 'closed'
    } else {
      out.window = end ? t('timing.openUntil', { clock: stop.windowEnd }) : t('timing.openSince', { clock: stop.windowStart })
      out.windowState = 'open'
    }
  }
  return out
}
