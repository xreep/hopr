// Fleet analytics computed from recorded routes and deliveries.
import { isOnTime, deliveryMinutes, driverPerformance, avg, round1, pct } from './metrics.js'
import { IST_OFFSET_MIN } from '../utils/time.js'

export const RANGES = { '7d': 7, '30d': 30, '90d': 90, '1y': 365 }

export function rangeWindow(range, now = new Date()) {
  const days = RANGES[range] || 30
  const end = now
  const start = new Date(end.getTime() - days * 86400000)
  const prevStart = new Date(start.getTime() - days * 86400000)
  return { days, start, end, prevStart }
}

export const routeDay = r => r.plannedStart || r.startedAt || r.createdAt

// IST calendar day (YYYY-MM-DD) or month (YYYY-MM)
export function istKey(date, granularity = 'day') {
  const iso = new Date(new Date(date).getTime() + IST_OFFSET_MIN * 60000).toISOString()
  return granularity === 'month' ? iso.slice(0, 7) : iso.slice(0, 10)
}

function bucketKeys(start, end, granularity) {
  const keys = []
  const cursor = new Date(start)
  while (cursor <= end) {
    const key = istKey(cursor, granularity)
    if (keys[keys.length - 1] !== key) keys.push(key)
    cursor.setTime(cursor.getTime() + (granularity === 'month' ? 86400000 * 7 : 86400000))
  }
  const last = istKey(end, granularity)
  if (keys[keys.length - 1] !== last) keys.push(last)
  return keys
}

// Headline KPIs for a set of routes (one period)
export function computeKpis(routes, activeVehicleCount) {
  const live = routes.filter(r => r.status !== 'cancelled')
  const dispatched = live.filter(r => r.status === 'active' || r.status === 'completed')
  let completed = 0
  let failed = 0
  let onTime = 0
  let dispatchedStops = 0
  const durations = []
  for (const r of live) {
    const isDispatched = r.status === 'active' || r.status === 'completed'
    if (isDispatched) dispatchedStops += r.stops.length
    for (const s of r.stops) {
      if (s.status === 'completed') {
        completed += 1
        if (isOnTime(s, r)) onTime += 1
        const d = deliveryMinutes(s, r)
        if (d !== null) durations.push(d)
      } else if (s.status === 'failed') {
        failed += 1
      }
    }
  }

  const drivenFuelCost = dispatched.reduce((sum, r) => sum + (r.fuelCost || 0), 0)
  const efficiencyScores = live
    .filter(r => r.status === 'completed' && r.actualDistance > 0 && r.totalDistance > 0)
    .map(r => Math.min(100, (r.totalDistance / r.actualDistance) * 100))
  const vehiclesUsed = new Set(live.filter(r => r.vehicle).map(r => (r.vehicle._id || r.vehicle).toString()))
  const loads = live.filter(r => r.capacityKg > 0).map(r => (r.loadKg / r.capacityKg) * 100)

  return {
    totalDeliveries: completed,
    failedDeliveries: failed,
    onTimeRate: pct(onTime, completed),
    avgDeliveryTime: round1(avg(durations)),
    fuelCostPerDelivery: completed > 0 ? Math.round((drivenFuelCost / completed) * 100) / 100 : null,
    routeEfficiencyScore: round1(avg(efficiencyScores)),
    vehicleUtilization: activeVehicleCount > 0 ? round1(Math.min(100, (vehiclesUsed.size / activeVehicleCount) * 100)) : null,
    capacityUtilization: round1(avg(loads)),
    completionRate: pct(completed, dispatchedStops),
    totalRoutes: live.length,
    completedRoutes: live.filter(r => r.status === 'completed').length,
    totalDistanceKm: round1(live.reduce((s, r) => s + (r.totalDistance || 0), 0)),
    totalFuelCost: Math.round(live.reduce((s, r) => s + (r.fuelCost || 0), 0) * 100) / 100,
    co2Kg: round1(live.reduce((s, r) => s + (r.co2Kg || 0), 0)),
    optimizationSavingsKm: round1(live.reduce((s, r) => s + Math.max(0, r.savings?.distanceKm || 0), 0)),
    optimizationSavingsCost: Math.round(live.reduce((s, r) => s + Math.max(0, r.savings?.fuelCost || 0), 0) * 100) / 100
  }
}

function change(current, previous) {
  if (current === null || previous === null || previous === undefined) return null
  return round1(current - previous)
}

export function buildAnalytics({ routes, previousRoutes, vehicles, range, now = new Date() }) {
  const { start, end } = rangeWindow(range, now)
  const activeVehicles = vehicles.filter(v => v.status === 'active')
  const kpis = computeKpis(routes, activeVehicles.length)
  const previous = computeKpis(previousRoutes, activeVehicles.length)
  const trends = Object.fromEntries(Object.keys(kpis).map(k => [k, change(kpis[k], previous[k])]))

  const granularity = range === '1y' ? 'month' : 'day'
  const keys = bucketKeys(start, end, granularity)
  const delivered = Object.fromEntries(keys.map(k => [k, 0]))
  const failedByDay = Object.fromEntries(keys.map(k => [k, 0]))
  const fuelByDay = Object.fromEntries(keys.map(k => [k, 0]))
  const co2ByDay = Object.fromEntries(keys.map(k => [k, 0]))
  const statusDistribution = { pending: 0, in_progress: 0, completed: 0, failed: 0 }

  for (const r of routes) {
    if (r.status === 'cancelled') continue
    const dayKey = istKey(routeDay(r), granularity)
    if (dayKey in fuelByDay) {
      fuelByDay[dayKey] += r.fuelCost || 0
      co2ByDay[dayKey] += r.co2Kg || 0
    }
    for (const s of r.stops) {
      statusDistribution[s.status] = (statusDistribution[s.status] || 0) + 1
      if (s.status === 'completed' && s.completedAt) {
        const k = istKey(s.completedAt, granularity)
        if (k in delivered) delivered[k] += 1
      } else if (s.status === 'failed' && s.failedAt) {
        const k = istKey(s.failedAt, granularity)
        if (k in failedByDay) failedByDay[k] += 1
      }
    }
  }

  // Per-vehicle usage
  const vehicleUtilization = activeVehicles.map(v => {
    const mine = routes.filter(r => r.status !== 'cancelled' && r.vehicle && (r.vehicle._id || r.vehicle).toString() === v._id.toString())
    const loads = mine.filter(r => r.capacityKg > 0).map(r => (r.loadKg / r.capacityKg) * 100)
    return {
      vehicleId: v.vehicleId,
      name: v.name,
      type: v.type,
      routes: mine.length,
      distanceKm: round1(mine.reduce((s, r) => s + (r.actualDistance || r.totalDistance || 0), 0)),
      utilization: round1(avg(loads)) ?? 0
    }
  })

  // Per-driver performance
  const byDriver = new Map()
  for (const r of routes) {
    if (!r.driver) continue
    const id = (r.driver._id || r.driver).toString()
    if (!byDriver.has(id)) byDriver.set(id, { name: r.driver.name || 'Driver', routes: [] })
    byDriver.get(id).routes.push(r)
  }
  const driverPerformanceRows = [...byDriver.entries()]
    .map(([id, d]) => ({ _id: id, name: d.name, ...driverPerformance(d.routes) }))
    .sort((a, b) => b.totalDeliveries - a.totalDeliveries || (b.onTimeRate ?? 0) - (a.onTimeRate ?? 0))
    .slice(0, 10)

  // Planned vs actual for completed routes
  const plannedVsActual = routes
    .filter(r => r.status === 'completed')
    .sort((a, b) => new Date(b.completedAt) - new Date(a.completedAt))
    .slice(0, 15)
    .map(r => ({
      _id: r._id,
      routeId: r.routeId,
      name: r.name,
      plannedDistance: r.totalDistance,
      actualDistance: r.actualDistance > 0 ? round1(r.actualDistance) : null,
      plannedMinutes: r.estimatedTime,
      actualMinutes: r.actualTime || null,
      efficiency: r.actualDistance > 0 && r.totalDistance > 0 ? round1(Math.min(100, (r.totalDistance / r.actualDistance) * 100)) : null,
      fuelCost: r.fuelCost,
      savedKm: r.savings?.distanceKm ?? null
    }))

  return {
    range,
    period: { start, end },
    kpis,
    previous,
    trends,
    deliveryTrend: { labels: keys, data: keys.map(k => delivered[k]), failed: keys.map(k => failedByDay[k]) },
    fuelTrend: { labels: keys, data: keys.map(k => Math.round(fuelByDay[k] * 100) / 100), co2: keys.map(k => round1(co2ByDay[k])) },
    statusDistribution,
    vehicleUtilization,
    driverPerformance: driverPerformanceRows,
    plannedVsActual
  }
}

// CSV report (one row per route). Cells are quoted and guarded against spreadsheet formula injection.
export function routesToCsv(routes) {
  const header = [
    'Route ID', 'Name', 'Service date (IST)', 'Status', 'Driver', 'Vehicle', 'Stops', 'Delivered', 'Failed',
    'On-time %', 'Planned km', 'Actual km', 'Planned min', 'Actual min', 'Fuel cost (INR)', 'CO2 (kg)', 'Traffic factor'
  ]
  const cell = value => {
    let text = value === null || value === undefined ? '' : String(value)
    if (/^[=+\-@\t\r]/.test(text)) text = `'${text}`
    return `"${text.replace(/"/g, '""')}"`
  }
  const rows = routes.map(r => {
    const delivered = r.stops.filter(s => s.status === 'completed')
    const onTime = delivered.filter(s => isOnTime(s, r)).length
    return [
      r.routeId, r.name, istKey(routeDay(r)), r.status, r.driver?.name, r.vehicle?.vehicleId,
      r.stops.length, delivered.length, r.stops.filter(s => s.status === 'failed').length,
      delivered.length ? round1((onTime / delivered.length) * 100) : '',
      r.totalDistance, r.actualDistance || '', r.estimatedTime, r.actualTime || '', r.fuelCost, r.co2Kg, r.trafficImpactFactor
    ].map(cell).join(',')
  })
  return [header.map(cell).join(','), ...rows].join('\r\n') + '\r\n'
}
