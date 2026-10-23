import { formatClock } from './time'
import { durationIn, translate } from '../i18n/strings'

const IST_OFFSET_MIN = 330

const DAY_MIN = 24 * 60
const toMinutes = hhmm => {
  const [h, m] = hhmm.split(':').map(Number)
  return h * 60 + m
}

// A stop's window as epoch milliseconds, on the day it is next open from `anchorMs` (the
// route's planned start). Same rule as the server's windowMinutes in
// backend/src/utils/time.js: an overnight window (22:00-02:00) ends the next day, and one
// that closed before the start (start 23:00, window 09:00-12:00) is the next morning's.
function windowAt(stop, anchorMs) {
  const dep = (((anchorMs / 60000 + IST_OFFSET_MIN) % DAY_MIN) + DAY_MIN) % DAY_MIN
  let start = stop.windowStart ? toMinutes(stop.windowStart) - dep : null
  let end = stop.windowEnd ? toMinutes(stop.windowEnd) - dep : null
  if (start !== null && end !== null) {
    if (end <= start) end += DAY_MIN
    if (start > 0 && end - DAY_MIN > 0) {
      start -= DAY_MIN
      end -= DAY_MIN
    }
  }
  if (end !== null && end < 0) {
    end += DAY_MIN
    if (start !== null) start += DAY_MIN
  }
  const at = minutes => (minutes === null ? null : anchorMs + minutes * 60000)
  return { start: at(start), end: at(end) }
}

// Plain-language timing for the stop a driver is heading to: how the planned ETA
// compares with now, and whether the customer's delivery window is open. `lang` picks the
// language of the phrases; `routeStart` (the route's planned start) places the window on
// the right day, falling back to the ETA.
export function stopTiming(stop, now = Date.now(), lang = 'en', routeStart = null) {
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
    const anchorMs = routeStart ? new Date(routeStart).getTime() : etaMs
    const { start, end } = windowAt(stop, Number.isFinite(anchorMs) ? anchorMs : etaMs)
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
