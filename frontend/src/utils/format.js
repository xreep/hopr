// Display helpers shared across pages. All money is Indian Rupees.

export function formatDuration(minutes) {
  if (minutes === null || minutes === undefined || Number.isNaN(Number(minutes))) return '-'
  const total = Math.max(0, Math.round(Number(minutes)))
  const hrs = Math.floor(total / 60)
  const mins = total % 60
  return hrs > 0 ? `${hrs}h ${mins}m` : `${mins}m`
}

const inr = new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 2 })

export function formatINR(amount) {
  const n = Number(amount)
  return inr.format(Number.isFinite(n) ? n : 0)
}

export function formatKm(km, digits = 1) {
  const n = Number(km)
  return `${(Number.isFinite(n) ? n : 0).toFixed(digits)} km`
}

export function initials(name) {
  return (name || '')
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .map(part => part[0])
    .join('')
    .slice(0, 2)
    .toUpperCase() || '?'
}
