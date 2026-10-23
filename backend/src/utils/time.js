// Operations run on Indian Standard Time (UTC+05:30, no DST). Servers (Render)
// run in UTC, so wall-clock maths uses a fixed offset instead of the host TZ.
export const IST_OFFSET_MIN = 330
const DAY_MIN = 24 * 60

const HHMM = /^([01]\d|2[0-3]):([0-5]\d)$/

export function isHHMM(value) {
  return typeof value === 'string' && HHMM.test(value)
}

export function hhmmToMinutes(value) {
  const m = HHMM.exec(value)
  if (!m) return null
  return Number(m[1]) * 60 + Number(m[2])
}

// Minutes since local (IST) midnight for a Date
export function istMinutesOfDay(date) {
  const utcMin = date.getUTCHours() * 60 + date.getUTCMinutes() + date.getUTCSeconds() / 60
  return (utcMin + IST_OFFSET_MIN) % DAY_MIN
}

export function istHour(date) {
  return Math.floor(istMinutesOfDay(date) / 60)
}

// Day of week in IST (0 = Sunday)
export function istDay(date) {
  return new Date(date.getTime() + IST_OFFSET_MIN * 60000).getUTCDay()
}

export function formatIST(date) {
  const total = Math.floor(istMinutesOfDay(date))
  const h = String(Math.floor(total / 60)).padStart(2, '0')
  const m = String(total % 60).padStart(2, '0')
  return `${h}:${m}`
}

// The absolute instant of "HH:MM IST" on the same IST calendar day as `base`
export function istDateAt(base, hhmm) {
  const target = hhmmToMinutes(hhmm)
  if (target === null) return null
  const offsetFromMidnight = istMinutesOfDay(base)
  return new Date(base.getTime() + (target - offsetFromMidnight) * 60000)
}

// A delivery window as minutes from `ref` to its start and end (either may be null).
// The window is taken on the day it is next open from `anchor`, the route's planned
// departure: an overnight window (22:00-02:00) ends the next day, leaving at 01:00 is
// already inside last night's one, and a window that closed before the departure (leave
// 23:00, window 09:00-12:00) is the next morning's. Anchoring on the planned departure,
// not `ref`, keeps a window missed while the route was out as missed on recalculation.
export function windowMinutes(windowStart, windowEnd, ref, anchor = ref) {
  const dep = istMinutesOfDay(anchor)
  let start = windowStart ? hhmmToMinutes(windowStart) - dep : null
  let end = windowEnd ? hhmmToMinutes(windowEnd) - dep : null
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
  const shift = (anchor.getTime() - ref.getTime()) / 60000
  return { start: start === null ? null : start + shift, end: end === null ? null : end + shift }
}

export function addMinutes(date, minutes) {
  return new Date(date.getTime() + minutes * 60000)
}
