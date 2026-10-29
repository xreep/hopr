import { describe, it, expect, vi } from 'vitest'
import { api, createUser, planBody, createRoute, completeStop } from './helpers.js'
import { recordCompletion } from '../src/routes/routes.js'
import { useTestDb } from './db.js'
import Route from '../src/models/Route.js'
import Vehicle from '../src/models/Vehicle.js'
import { RANCHI_LOCATIONS as L } from '../src/data/ranchiLocations.js'

useTestDb()

async function vehicle(overrides = {}) {
  return Vehicle.create({
    vehicleId: `VEH-${Math.random().toString(36).slice(2, 7)}`,
    name: 'Tata Ace Gold',
    type: 'van',
    fuelType: 'diesel',
    mileage: 18,
    capacity: 750,
    licensePlate: `JH01AB${Math.floor(1000 + Math.random() * 8999)}`,
    ...overrides
  })
}

describe('route planning API', () => {
  it('optimizes 5 stops with ETAs, priority and window handling', async () => {
    const { auth } = await createUser('fleet_manager')
    const res = await api().post('/api/routes/optimize').set(auth).send(planBody())
    expect(res.status).toBe(200)
    const route = res.body.routes[0]
    expect(route.stops).toHaveLength(5)
    // The urgent delivery is served within the first two stops (Lalpur is on the way)
    expect(route.stops.findIndex(s => s.customerName === 'Rohit Oraon')).toBeLessThanOrEqual(1)
    expect(route.stops.every(s => s.estimatedArrival && s.etaLabel)).toBe(true)
    expect(route.totals.fuel.unit).toBe('L')
    expect(route.alternatives).toHaveLength(3)
    expect(res.body.computeMs).toBeLessThan(10000)
  })

  it('rejects 31 stops for a single vehicle with a clear message', async () => {
    const { auth } = await createUser('fleet_manager')
    const stops = Array.from({ length: 31 }, (_, i) => ({ address: `Stop ${i}`, coordinates: [85.30 + i * 0.002, 23.35] }))
    const res = await api().post('/api/routes/optimize').set(auth).send({ stops })
    expect(res.status).toBe(400)
    expect(res.body.message).toMatch(/at most 30 stops/)
  })

  it('validates time window format', async () => {
    const { auth } = await createUser('fleet_manager')
    const body = planBody()
    body.stops[0].windowStart = '25:00'
    const res = await api().post('/api/routes/optimize').set(auth).send(body)
    expect(res.status).toBe(400)
  })

  it('saves a batch, re-computing figures server-side (client totals ignored)', async () => {
    const { auth } = await createUser('fleet_manager')
    const res = await api().post('/api/routes').set(auth).send({ ...planBody(), name: 'Morning run', totalDistance: 0.1, fuelCost: 0 })
    expect(res.status).toBe(201)
    const route = res.body.routes[0]
    expect(route.name).toBe('Morning run')
    expect(route.totalDistance).toBeGreaterThan(5)
    expect(route.fuelCost).toBeGreaterThan(0)
    expect(route.stops.every(s => /^DLV-/.test(s.deliveryId) && s.trackingToken && s.plannedArrival)).toBe(true)
    expect(route.geometry.coordinates.length).toBe(6) // depot + 5 stops (estimated geometry in tests)
    expect(route.geometrySource).toBe('estimated')
  })

  it('splits a batch across selected fleet vehicles', async () => {
    const { auth } = await createUser('fleet_manager')
    const bike = await vehicle({ name: 'Hero Splendor', type: 'bike', fuelType: 'petrol', mileage: 60, capacity: 12 })
    const van = await vehicle()
    const res = await api().post('/api/routes').set(auth).send(planBody({ vehicleIds: [bike._id, van._id] }))
    expect(res.status).toBe(201)
    expect(res.body.routes).toHaveLength(2)
    const batchIds = new Set(res.body.routes.map(r => r.batchId))
    expect(batchIds.size).toBe(1)
    const bikeRoute = res.body.routes.find(r => r.vehicle === bike._id.toString())
    expect(bikeRoute.loadKg).toBeLessThanOrEqual(12)
    expect(bikeRoute.fuelUnit).toBe('L')
  })

  it('refuses vehicles under maintenance', async () => {
    const { auth } = await createUser('fleet_manager')
    const van = await vehicle({ status: 'maintenance' })
    const res = await api().post('/api/routes/optimize').set(auth).send(planBody({ vehicleIds: [van._id] }))
    expect(res.status).toBe(400)
    expect(res.body.message).toMatch(/maintenance/)
  })
})

describe('route assignment and driver workflow', () => {
  it('assigns a driver, rejecting non-drivers', async () => {
    const manager = await createUser('fleet_manager')
    const driver = await createUser('driver')
    const other = await createUser('fleet_manager')
    const route = await createRoute(manager.auth)

    const bad = await api().patch(`/api/routes/${route._id}`).set(manager.auth).send({ driver: other.user._id })
    expect(bad.status).toBe(400)

    const ok = await api().patch(`/api/routes/${route._id}`).set(manager.auth).send({ driver: driver.user._id })
    expect(ok.status).toBe(200)
    expect(ok.body.route.driver.name).toBe(driver.user.name)

    const assigned = await api().get('/api/routes/driver/assigned').set(driver.auth)
    expect(assigned.body.routes.map(r => r._id)).toContain(route._id)
  })

  it('re-times a planned route when its vehicle is changed, but not one on the road', async () => {
    const manager = await createUser('fleet_manager')
    const driver = await createUser('driver')
    const route = await createRoute(manager.auth) // planned for a diesel delivery van, 16 km/L
    const truck = await Vehicle.create({ vehicleId: 'VEH-T', name: 'Tata 407', type: 'truck', fuelType: 'diesel', mileage: 8, capacity: 2500, licensePlate: 'JH01TT0001' })
    const before = await Route.findById(route._id)

    const res = await api().patch(`/api/routes/${route._id}`).set(manager.auth).send({ vehicle: truck._id, driver: driver.user._id })
    expect(res.status).toBe(200)
    const after = await Route.findById(route._id)
    expect(after.vehicleType).toBe('truck')
    expect(after.totalDistance).toBe(before.totalDistance)
    expect(after.fuelEstimate).toBeCloseTo(after.totalDistance / 8, 1)
    expect(after.fuelCost).toBeGreaterThan(before.fuelCost)
    expect(after.estimatedTime).toBeGreaterThan(before.estimatedTime) // slower, longer stops

    // Once the route is on the road its planned figures are history and stay put
    await api().patch(`/api/routes/${route._id}/start`).set(driver.auth)
    const van = await Vehicle.create({ vehicleId: 'VEH-V', name: 'Tata Ace', type: 'van', fuelType: 'diesel', mileage: 16, capacity: 750, licensePlate: 'JH01TT0002' })
    await api().patch(`/api/routes/${route._id}`).set(manager.auth).send({ vehicle: van._id })
    const active = await Route.findById(route._id)
    expect(active.vehicleType).toBe('van')
    expect(active.fuelCost).toBe(after.fuelCost)
  })

  it('forbids drivers from editing route assignments', async () => {
    const manager = await createUser('fleet_manager')
    const driver = await createUser('driver')
    const route = await createRoute(manager.auth)
    const res = await api().patch(`/api/routes/${route._id}`).set(driver.auth).send({ driver: driver.user._id })
    expect(res.status).toBe(403)
  })

  it('forecasts ETAs from the real start time, respecting delivery windows', async () => {
    // 07:00 IST, three hours before the planned 10:00 departure
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(new Date('2026-10-15T01:30:00.000Z'))
    try {
      const manager = await createUser('fleet_manager')
      const driver = await createUser('driver')
      // Morabadi must be served 10:30-11:00, then Lalpur from 11:00: the van waits at Morabadi
      const route = await createRoute(manager.auth, {
        assignments: [{ driver: driver.user._id }],
        stops: [
          { ...L.morabadiMaidan, customerName: 'A', packageWeightKg: 1, windowStart: '10:30', windowEnd: '11:00' },
          { ...L.lalpurChowk, customerName: 'B', packageWeightKg: 1, windowStart: '11:00', windowEnd: '13:00' }
        ]
      })
      const planned = new Map(route.stops.map(s => [s._id, new Date(s.estimatedArrival).getTime()]))

      const res = await api().patch(`/api/routes/${route._id}/start`).set(driver.auth)
      expect(res.status).toBe(200)
      const [first, second] = [...res.body.route.stops].sort((a, b) => a.sequence - b.sequence)
      expect(first.customerName).toBe('A')
      const opens = new Date('2026-10-15T05:00:00.000Z').getTime() // 10:30 IST
      // Starting three hours early gets the van to Morabadi sooner, but it still waits for
      // the window, so Lalpur cannot be reached before 10:30 (a flat 3 h shift would say ~07:45)
      expect(new Date(first.estimatedArrival).getTime()).toBeLessThan(planned.get(first._id))
      expect(new Date(second.estimatedArrival).getTime()).toBeGreaterThan(opens)
      const stops = [first, second]
      // The plan itself is kept for planned-vs-actual reporting
      for (const s of stops) expect(new Date(s.plannedArrival).getTime()).toBe(planned.get(s._id))
    } finally {
      vi.useRealTimers()
    }
  })

  it('runs a route end to end: start, complete, fail with reason, auto-complete route', async () => {
    const manager = await createUser('fleet_manager')
    const driver = await createUser('driver')
    const route = await createRoute(manager.auth, { assignments: [{ driver: driver.user._id }] })

    const started = await api().patch(`/api/routes/${route._id}/start`).set(driver.auth)
    expect(started.status).toBe(200)
    expect(started.body.route.status).toBe('active')
    expect(started.body.route.stops[0].status).toBe('in_progress')

    const stops = started.body.route.stops
    const failNoReason = await api().patch(`/api/routes/${route._id}/stops/${stops[0]._id}/status`).set(driver.auth).send({ status: 'failed' })
    expect(failNoReason.status).toBe(400)

    const failed = await api().patch(`/api/routes/${route._id}/stops/${stops[0]._id}/status`).set(driver.auth)
      .send({ status: 'failed', reason: 'Customer not at home' })
    expect(failed.status).toBe(200)
    expect(failed.body.route.stops[1].status).toBe('in_progress')

    const again = await completeStop(driver.auth, route._id, stops[0]._id)
    expect(again.status).toBe(409)

    let last
    for (const stop of stops.slice(1)) {
      last = await completeStop(driver.auth, route._id, stop._id)
      expect(last.status).toBe(200)
    }
    // The last stop stays completed and the route completes even with one failed stop
    expect(last.body.route.stops[4].status).toBe('completed')
    expect(last.body.route.status).toBe('completed')
    expect(last.body.route.completedAt).toBeTruthy()
  })

  it('adds a completed route to its vehicle\'s lifetime totals exactly once', async () => {
    const manager = await createUser('fleet_manager')
    const driver = await createUser('driver')
    const van = await vehicle()
    const route = await createRoute(manager.auth, { assignments: [{ driver: driver.user._id }] })
    await api().patch(`/api/routes/${route._id}`).set(manager.auth).send({ vehicle: van._id }).expect(200)
    await api().patch(`/api/routes/${route._id}/start`).set(driver.auth).expect(200)
    const stops = (await Route.findById(route._id)).stops
    for (const stop of stops.slice(0, -1)) await completeStop(driver.auth, route._id, stop._id).expect(200)

    // The last delivery sent twice at once (a double tap, or the offline outbox retrying)
    const last = stops.at(-1)._id
    const results = await Promise.all([completeStop(driver.auth, route._id, last), completeStop(driver.auth, route._id, last)])
    expect(results.some(r => r.status === 200)).toBe(true)
    // Two requests that both saw the route complete: only one may record it
    const [a, b] = await Promise.all([Route.findById(route._id), Route.findById(route._id)])
    await Promise.all([recordCompletion(a), recordCompletion(b)])

    const done = await Route.findById(route._id)
    const after = await Vehicle.findById(van._id)
    expect(done.status).toBe('completed')
    const km = done.actualDistance > 0 ? done.actualDistance : done.totalDistance
    expect(after.totalDistance).toBeCloseTo(Math.round(km * 100) / 100, 2)
    expect(after.totalFuelConsumed).toBeCloseTo(done.fuelEstimate, 5)
  })

  it('lets a manager put the stops of a planned route in their own order', async () => {
    const manager = await createUser('fleet_manager')
    const driver = await createUser('driver')
    const route = await createRoute(manager.auth)
    const reversed = [...route.stops].sort((a, b) => b.sequence - a.sequence).map(s => s._id)

    const res = await api().patch(`/api/routes/${route._id}/order`).set(manager.auth).send({ order: reversed })
    expect(res.status).toBe(200)
    const updated = res.body.route
    expect(updated.manualOrder).toBe(true)
    expect(updated.stops.map(s => s._id)).toEqual(reversed)
    expect(updated.stops.map(s => s.sequence)).toEqual([1, 2, 3, 4, 5])
    // Re-timed in the new order: ETAs rise along it, and distance and fuel follow it
    const etas = updated.stops.map(s => new Date(s.estimatedArrival).getTime())
    expect([...etas].sort((a, b) => a - b)).toEqual(etas)
    expect(updated.stops.map(s => s.plannedArrival)).toEqual(updated.stops.map(s => s.estimatedArrival))
    expect(updated.totalDistance).toBeGreaterThanOrEqual(route.totalDistance - 1e-6)
    expect(updated.fuelCost).toBeGreaterThan(0)
    expect(updated.geometry.coordinates.length).toBeGreaterThan(1)

    // Every stop exactly once, managers only, planned routes only
    const one = [reversed[0]]
    expect((await api().patch(`/api/routes/${route._id}/order`).set(manager.auth).send({ order: one })).status).toBe(400)
    expect((await api().patch(`/api/routes/${route._id}/order`).set(manager.auth).send({ order: [...reversed.slice(1), reversed[1]] })).status).toBe(400)
    expect((await api().patch(`/api/routes/${route._id}/order`).set(driver.auth).send({ order: reversed })).status).toBe(403)

    // Re-optimizing replaces the manual order
    const recalculated = await api().post(`/api/routes/${route._id}/recalculate`).set(manager.auth).send({ reason: 'Back to optimized' })
    expect(recalculated.body.route.manualOrder).toBe(false)

    await api().patch(`/api/routes/${route._id}`).set(manager.auth).send({ driver: driver.user._id }).expect(200)
    await api().patch(`/api/routes/${route._id}/start`).set(driver.auth).expect(200)
    expect((await api().patch(`/api/routes/${route._id}/order`).set(manager.auth).send({ order: reversed })).status).toBe(409)
  })

  it('never gives a driver two routes on the same day', async () => {
    const manager = await createUser('fleet_manager')
    const driver = await createUser('driver', { name: 'Ravi Kumar' })
    const day1 = '2026-11-02T04:30:00.000Z' // 10:00 IST on 2 Nov
    const day1Evening = '2026-11-02T12:30:00.000Z' // 18:00 IST, same day
    const day2 = '2026-11-03T04:30:00.000Z'
    const morning = await createRoute(manager.auth, { departureTime: day1, assignments: [{ driver: driver.user._id }] })
    const evening = await createRoute(manager.auth, { departureTime: day1Evening })
    const nextDay = await createRoute(manager.auth, { departureTime: day2 })

    const clash = await api().patch(`/api/routes/${evening._id}`).set(manager.auth).send({ driver: driver.user._id })
    expect(clash.status).toBe(409)
    expect(clash.body.message).toBe(`Ravi Kumar already has ${morning.name} (${morning.routeId}) on 2 Nov`)
    // A batch saved with that driver is refused the same way
    const batch = await api().post('/api/routes').set(manager.auth).send(planBody({ departureTime: day1Evening, assignments: [{ driver: driver.user._id }] }))
    expect(batch.status).toBe(409)
    // Another day is fine, and so is re-sending the driver a route already has
    expect((await api().patch(`/api/routes/${nextDay._id}`).set(manager.auth).send({ driver: driver.user._id })).status).toBe(200)
    expect((await api().patch(`/api/routes/${morning._id}`).set(manager.auth).send({ driver: driver.user._id })).status).toBe(200)

    // A route on the road counts on the day it started, whatever day it was planned for
    const other = await createUser('driver', { name: 'Pooja Kumari' })
    const later = await createRoute(manager.auth, { departureTime: day2, assignments: [{ driver: other.user._id }] })
    await api().patch(`/api/routes/${later._id}/start`).set(other.auth).expect(200)
    const today = await createRoute(manager.auth, { departureTime: new Date().toISOString() })
    const busy = await api().patch(`/api/routes/${today._id}`).set(manager.auth).send({ driver: other.user._id })
    expect(busy.status).toBe(409)
    expect(busy.body.message).toMatch(/^Pooja Kumari already has /)
  })

  it('pushes back remaining ETAs when a delay is reported', async () => {
    const manager = await createUser('fleet_manager')
    const driver = await createUser('driver')
    const route = await createRoute(manager.auth, { assignments: [{ driver: driver.user._id }] })
    const before = route.stops.map(s => new Date(s.estimatedArrival).getTime())
    const res = await api().post(`/api/routes/${route._id}/stops/${route.stops[0]._id}/issues`).set(driver.auth)
      .send({ type: 'delay', delayMinutes: 20, description: 'Traffic jam at Kutchery Chowk' })
    expect(res.status).toBe(200)
    const after = res.body.route.stops.map(s => new Date(s.estimatedArrival).getTime())
    after.forEach((t, i) => expect(t - before[i]).toBe(20 * 60000))
    expect(res.body.route.stops[0].issues[0].type).toBe('delay')
  })

  it('recalculates remaining stops from the driver position', async () => {
    const manager = await createUser('fleet_manager')
    const driver = await createUser('driver')
    // No delivery windows: recalculation runs at the real current time
    const stops = planBody().stops.map(({ windowStart, windowEnd, ...rest }) => rest)
    const route = await createRoute(manager.auth, { stops, assignments: [{ driver: driver.user._id }] })
    await Route.updateOne({ _id: route._id }, { driverLocation: { coordinates: L.harmuChowk.coordinates, updatedAt: new Date() } })

    const res = await api().post(`/api/routes/${route._id}/recalculate`).set(driver.auth).send({ reason: 'Traffic changed' })
    expect(res.status).toBe(200)
    const updated = res.body.route
    expect(updated.recalculations).toHaveLength(1)
    expect(updated.recalculations[0].reason).toBe('Traffic changed')
    expect(updated.stops.map(s => s.sequence)).toEqual([1, 2, 3, 4, 5])
    // Starting at Harmu, the Harmu delivery itself should come first
    expect(updated.stops[0].address).toBe(L.harmuChowk.address)
  })
})

describe('traffic incidents', () => {
  it('flags routes crossing a reported road closure', async () => {
    const manager = await createUser('fleet_manager')
    const route = await createRoute(manager.auth)
    // Closure at Albert Ekka Chowk, which every plan passes through
    const res = await api().post('/api/incidents').set(manager.auth).send({
      type: 'closure', label: 'Main Road closed for procession', coordinates: L.albertEkkaChowk.coordinates, radiusKm: 0.3, durationMinutes: 120
    })
    expect(res.status).toBe(201)
    expect(res.body.affectedRoutes).toContain(route._id)
    expect((await Route.findById(route._id)).needsRecalculation).toBe(true)

    const list = await api().get('/api/incidents').set(manager.auth)
    expect(list.body.incidents).toHaveLength(1)

    const resolved = await api().patch(`/api/incidents/${res.body.incident._id}/resolve`).set(manager.auth)
    expect(resolved.body.incident.active).toBe(false)
  })

  it('only managers can report incidents', async () => {
    const driver = await createUser('driver')
    const res = await api().post('/api/incidents').set(driver.auth).send({ type: 'congestion', label: 'x', coordinates: [85.3, 23.3] })
    expect(res.status).toBe(403)
  })
})
