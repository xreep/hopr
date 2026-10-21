// RFC 4180-style CSV parsing (quoted fields, escaped quotes, CRLF) and mapping of
// delivery columns to stops for the Route Planner upload.

export function parseCsv(text) {
  const rows = []
  let row = []
  let field = ''
  let quoted = false
  const src = text.replace(/^\uFEFF/, '')
  for (let i = 0; i < src.length; i++) {
    const ch = src[i]
    if (quoted) {
      if (ch === '"') {
        if (src[i + 1] === '"') { field += '"'; i++ } else quoted = false
      } else field += ch
    } else if (ch === '"') quoted = true
    else if (ch === ',') { row.push(field); field = '' }
    else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && src[i + 1] === '\n') i++
      row.push(field); rows.push(row); row = []; field = ''
    } else field += ch
  }
  if (field !== '' || row.length) { row.push(field); rows.push(row) }
  return rows.filter(r => r.some(c => c.trim() !== ''))
}

const HEADER_ALIASES = {
  address: ['address', 'delivery address', 'location'],
  customerName: ['customer', 'customer name', 'name'],
  customerPhone: ['phone', 'customer phone', 'mobile', 'contact'],
  priority: ['priority', 'priority level'],
  windowStart: ['window start', 'window_start', 'from', 'start'],
  windowEnd: ['window end', 'window_end', 'to', 'end'],
  timeWindow: ['time window', 'window', 'delivery time window'],
  packageWeightKg: ['weight', 'weight kg', 'package weight', 'weight (kg)', 'package weight (kg)'],
  packageSize: ['size', 'package size'],
  notes: ['notes', 'note', 'instructions'],
  lat: ['lat', 'latitude'],
  lng: ['lng', 'lon', 'long', 'longitude']
}

const HHMM = /^([01]?\d|2[0-3]):([0-5]\d)$/
const pad = t => (t && HHMM.test(t.trim()) ? t.trim().padStart(5, '0') : '')

export function csvToStops(text) {
  const rows = parseCsv(text)
  if (!rows.length) return { stops: [], errors: ['The file is empty'] }
  const header = rows[0].map(h => h.trim().toLowerCase())
  const col = {}
  for (const [key, aliases] of Object.entries(HEADER_ALIASES)) {
    const idx = header.findIndex(h => aliases.includes(h))
    if (idx !== -1) col[key] = idx
  }
  if (col.address === undefined) return { stops: [], errors: ['CSV must contain an "address" column'] }

  const errors = []
  const stops = []
  rows.slice(1).forEach((r, i) => {
    const get = key => (col[key] !== undefined ? (r[col[key]] || '').trim() : '')
    const address = get('address')
    if (!address) return
    let windowStart = pad(get('windowStart'))
    let windowEnd = pad(get('windowEnd'))
    if (!windowStart && !windowEnd && get('timeWindow')) {
      const [a, b] = get('timeWindow').split(/\s*[-–to]+\s*/)
      windowStart = pad(a)
      windowEnd = pad(b)
    }
    const priority = ['urgent', 'standard', 'low'].includes(get('priority').toLowerCase()) ? get('priority').toLowerCase() : 'standard'
    const lat = parseFloat(get('lat'))
    const lng = parseFloat(get('lng'))
    const weight = parseFloat(get('packageWeightKg'))
    const size = get('packageSize').toLowerCase()
    stops.push({
      address,
      customerName: get('customerName'),
      customerPhone: get('customerPhone'),
      priority,
      windowStart,
      windowEnd,
      packageWeightKg: Number.isFinite(weight) && weight >= 0 ? weight : '',
      packageSize: ['small', 'medium', 'large'].includes(size) ? size : 'small',
      notes: get('notes'),
      coordinates: Number.isFinite(lat) && Number.isFinite(lng) ? [lng, lat] : null
    })
    if (windowStart && windowEnd && windowEnd <= windowStart) errors.push(`Row ${i + 2}: window end must be after start`)
  })
  return { stops, errors }
}

export const SAMPLE_CSV = `address,customer,phone,priority,window start,window end,weight kg,notes,lat,lng
"Albert Ekka Chowk (Firayalal), Main Road, Ranchi, Jharkhand 834001",Amit Mahto,+91 98350 11223,standard,10:00,12:00,3,Shop counter,23.3702,85.3249
"Morabadi Maidan, Morabadi, Ranchi, Jharkhand 834008",Neha Kumari,+91 94311 22334,urgent,10:30,11:30,6,Call on arrival,23.3909,85.3278
`
