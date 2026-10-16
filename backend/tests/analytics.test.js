import { describe, it, expect } from 'vitest'
import { computeKpis, buildAnalytics, routesToCsv } from '../src/services/analytics.js'
import { isOnTime } from '../src/services/metrics.js'
import { api, createUser, createRoute } from './helpers.js'
import { useTestDb } from './db.js'
import Route from '../src/models/Route.js'

const at = iso => new Date(iso)
// Thursday 15 Oct 2026, route starts 10:00 IST (04:30Z)
const baseRoute = (overrides = {}) => ({
  _id: 'r1', routeId: 'RT-1', name: 'Morning', status: 'completed',
  plannedStart: at('2026-10-15T04:30:00Z'), startedAt: at('2026-10-15T04:30:00Z'), completedAt: at('2026-10-15T06:00:00Z'),
  totalDistance: 18, actualDistance: 20, estimatedTime: 80, actualTime: 90, fuelCost: 120, co2Kg: 3.5,
  loadKg: 300, capacityKg: 750, vehicle: 'v1', driver: { _id: 'd1', name: 'Ravi Kumar' },
  savings: { distanceKm: 4, fuelCost: 25 },
  stops: [
    // window 10:00-10:30 IST, delivered 10:20 IST -> on time, 20 min after start
    { status: 'completed', windowStart: '10:00', windowEnd: '10:30', completedAt: at('2026-10-15T04:50:00Z') },
    // window ends 11:00 IST, delivered 11:15 IST -> late
    { status: 'completed', windowEnd: '11:00', completedAt: at('2026-10-15T05:45:00Z') },
    // no window, promised 10:40 IST (+15 min grace) delivered 10:50 -> on time
    { status: 'completed', plannedArrival: at('2026-10-15T05:10:00Z'), completedAt: at('2026-10-15T05:20:00Z') },
    { status: 'failed', failedAt: at('2026-10-15T05:30:00Z'), failureReason: 'Gate locked' }
  ],
  ...overrides
})

describe('KPI definitions', () => {
  it('judges on-time against the window end, else promised ETA + 15 min grace', () => {
    const r = baseRoute()
    expect(r.stops.map(s => isOnTime(s, r))).toEqual([true, false, true, false])
  })

  it('computes every spec KPI from deliveries', () => {
    const k = computeKpis([baseRoute()], 2)
    expect(k.totalDeliveries).toBe(3)
    expect(k.failedDeliveries).toBe(1)
    expect(k.onTimeRate).toBe(66.7)
    expect(k.avgDeliveryTime).toBe(48.3) // (20 + 75 + 50) / 3
    expect(k.fuelCostPerDelivery).toBe(40) // INR 120 / 3 deliveries
    expect(k.routeEfficiencyScore).toBe(90) // planned 18 km / driven 20 km
    expect(k.vehicleUtilization).toBe(50) // 1 of 2 active vehicles used
    expect(k.capacityUtilization).toBe(40)
    expect(k.completionRate).toBe(75) // 3 of 4 dispatched stops
    expect(k.optimizationSavingsKm).toBe(4)
  })

  it('returns null rather than inventing numbers when there is no data', () => {
    const k = computeKpis([], 3)
    expect(k.onTimeRate).toBeNull()
    expect(k.avgDeliveryTime).toBeNull()
    expect(k.fuelCostPerDelivery).toBeNull()
    expect(k.routeEfficiencyScore).toBeNull()
    expect(k.vehicleUtilization).toBe(0)
  })

  it('compares with the previous period and buckets trends by IST day', () => {
    const now = at('2026-10-16T12:00:00Z')
    const a = buildAnalytics({
      routes: [baseRoute()],
      previousRoutes: [baseRoute({ stops: baseRoute().stops.slice(0, 1) })],
      vehicles: [{ _id: 'v1', vehicleId: 'VEH-1', name: 'Ace', type: 'van', status: 'active' }],
      range: '7d',
      now
    })
    expect(a.trends.totalDeliveries).toBe(2)
    expect(a.statusDistribution).toEqual({ pending: 0, in_progress: 0, completed: 3, failed: 1 })
    const idx = a.deliveryTrend.labels.indexOf('2026-10-15')
    expect(a.deliveryTrend.data[idx]).toBe(3)
    expect(a.deliveryTrend.failed[idx]).toBe(1)
    expect(a.driverPerformance[0]).toMatchObject({ name: 'Ravi Kumar', totalDeliveries: 3, completionRate: 75 })
    expect(a.plannedVsActual[0]).toMatchObject({ plannedDistance: 18, actualDistance: 20, efficiency: 90 })
  })

  it('escapes CSV cells and neutralises spreadsheet formulas', () => {
    const csv = routesToCsv([baseRoute({ name: '=HYPERLINK("x")', driver: { name: 'Ravi, "RK"' }, vehicle: { vehicleId: 'VEH-1' } })])
    const [header, row] = csv.trim().split('\r\n')
    expect(header).toContain('"On-time %"')
    expect(row).toContain(`"'=HYPERLINK(""x"")"`)
    expect(row).toContain('"Ravi, ""RK"""')
  })
})

describe('analytics + dashboard API', () => {
  useTestDb()

  it('serves analytics, CSV report and dashboards by role', async () => {
    const manager = await createUser('fleet_manager')
    const driver = await createUser('driver')
    const route = await createRoute(manager.auth, { assignments: [{ driver: driver.user._id }] })
    await api().patch(`/api/routes/${route._id}/start`).set(driver.auth)
    await api().patch(`/api/routes/${route._id}/stops/${route.stops[0]._id}/status`).set(driver.auth).send({ status: 'completed' })
    // Planned for "now" so it falls inside the default 30-day window
    await Route.updateOne({ _id: route._id }, { plannedStart: new Date() })

    const analytics = await api().get('/api/analytics?range=30d').set(manager.auth)
    expect(analytics.status).toBe(200)
    expect(analytics.body.kpis.totalDeliveries).toBe(1)
    expect(analytics.body.statusDistribution.completed).toBe(1)

    const csv = await api().get('/api/analytics/report.csv?range=7d').set(manager.auth)
    expect(csv.status).toBe(200)
    expect(csv.headers['content-type']).toMatch(/text\/csv/)
    expect(csv.text).toContain(route.routeId)

    const dash = await api().get('/api/dashboard').set(manager.auth)
    expect(dash.status).toBe(200)
    expect(dash.body.activeRoutes).toBe(1)
    expect(dash.body.deliveriesToday).toBe(1)
    expect(dash.body.liveRoutes[0].progress).toEqual({ done: 1, total: 5 })

    const mine = await api().get('/api/dashboard').set(driver.auth)
    expect(mine.body.role).toBe('driver')
    expect(mine.body.completedToday).toBe(1)
    expect(mine.body.assignedRoutes).toBe(1)

    expect((await api().get('/api/analytics').set(driver.auth)).status).toBe(403)
  })
})

describe('analytics window', () => {
  it('runs to the end of the current IST day so routes planned later today are included', async () => {
    const { rangeWindow } = await import('../src/services/analytics.js')
    // 16 Oct 2026 17:00 IST
    const { end, start } = rangeWindow('7d', new Date('2026-10-16T11:30:00Z'))
    expect(end.toISOString()).toBe('2026-10-16T18:29:59.999Z') // 23:59:59.999 IST
    expect((end - start) / 86400000).toBe(7)
  })
})
