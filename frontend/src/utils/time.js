// All operational times are shown in Indian Standard Time regardless of the viewer's device.
const TZ = 'Asia/Kolkata'

const clockFmt = new Intl.DateTimeFormat('en-GB', { timeZone: TZ, hour: '2-digit', minute: '2-digit', hour12: false })
const dateFmt = new Intl.DateTimeFormat('en-IN', { timeZone: TZ, day: 'numeric', month: 'short', year: 'numeric' })
const dateTimeFmt = new Intl.DateTimeFormat('en-IN', { timeZone: TZ, day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', hour12: true })

const valid = d => d !== null && d !== undefined && d !== '' && !Number.isNaN(new Date(d).getTime())

export const formatClock = d => (valid(d) ? clockFmt.format(new Date(d)) : '--:--')
export const formatDate = d => (valid(d) ? dateFmt.format(new Date(d)) : '-')
export const formatDateTime = d => (valid(d) ? dateTimeFmt.format(new Date(d)) : '-')

// <input type="datetime-local"> value (IST wall clock) for an instant
export function toISTInputValue(date) {
  const d = new Date(new Date(date).getTime() + 330 * 60000)
  return d.toISOString().slice(0, 16)
}

// Parses a datetime-local value as IST and returns an ISO instant
export function fromISTInputValue(value) {
  if (!value) return null
  const d = new Date(`${value}:00+05:30`)
  return Number.isNaN(d.getTime()) ? null : d.toISOString()
}

export function minutesUntil(date, now = Date.now()) {
  if (!valid(date)) return null
  return Math.round((new Date(date).getTime() - now) / 60000)
}

export function relativeTime(date, now = Date.now()) {
  if (!valid(date)) return 'never'
  const sec = Math.round((now - new Date(date).getTime()) / 1000)
  if (sec < 10) return 'just now'
  if (sec < 60) return `${sec}s ago`
  if (sec < 3600) return `${Math.round(sec / 60)} min ago`
  if (sec < 86400) return `${Math.round(sec / 3600)} h ago`
  return formatDate(date)
}
