import { describe, it, expect } from 'vitest'
import { scoreCandidate, planDispatch, WEIGHTS } from '../src/services/dispatch.js'
import { estimateFuel } from '../src/services/fuel.js'
import { api, createUser, createRoute } from './helpers.js'
import { useTestDb } from './db.js'
import Route from '../src/models/Route.js'
import Vehicle from '../src/models/Vehicle.js'
import User from '../src/models/User.js'
import { RANCHI_HUB, RANCHI_LOCATIONS as L } from '../src/data/ranchiLocations.js'

const NOW = new Date('2026-10-16T05:00:00Z').getTime()
const fresh = coordinates => ({ coordinates, updatedAt: new Date(NOW - 5 * 60000) })
const route = (id, loadKg, extra = {}) => ({ _id: id, routeId: `RT-${id}`, name: id, depot: RANCHI_HUB, loadKg, vehicleType: 'van', ...extra })
const van = (id, capacity = 750, type = 'van') => ({ _id: `v-${id}`, name: `Van ${id}`, capacity, type })

describe('auto-dispatch scoring', () => {
  it('prefers the closer driver (last known GPS, else depot)', () => {
    const r = route('A', 100)
    const near = scoreCandidate({ route: r, driver: { name: 'Near', lastLocation: fresh(L.lalpurChowk.coordinates) }, vehicle: van(1), now: NOW })
    const far = scoreCandidate({ route: r, driver: { name: 'Far', lastLocation: fresh(L.birsaMundaAirport.coordinates) }, vehicle: van(2), now: NOW })
    const atDepot = scoreCandidate({ route: r, driver: { name: 'Depot' }, vehicle: van(3), now: NOW })
    expect(near.distanceKm).toBeLessThan(far.distanceKm)
    expect(near.score).toBeGreaterThan(far.score)
    expect(atDepot.origin).toBe('depot')
    expect(atDepot.distanceKm).toBe(0)
    expect(atDepot.score).toBeGreaterThan(near.score)
  })

  it('ignores stale GPS older than 12 hours and falls back to the depot', () => {
    const s = scoreCandidate({
      route: route('A', 10),
      driver: { name: 'X', lastLocation: { coordinates: L.birsaMundaAirport.coordinates, updatedAt: new Date(NOW - 13 * 3600000) } },
      vehicle: van(1),
      now: NOW
    })
    expect(s.origin).toBe('depot')
  })

  it('excludes overloaded vehicles and prefers a tight capacity fit', () => {
    const r = route('A', 400)
    expect(scoreCandidate({ route: r, driver: { name: 'Bike' }, vehicle: van('b', 25, 'bike'), now: NOW }).feasible).toBe(false)
    const ace = scoreCandidate({ route: r, driver: { name: 'A' }, vehicle: van('ace', 750), now: NOW })
    const truck = scoreCandidate({ route: r, driver: { name: 'T' }, vehicle: van('t', 2500, 'truck'), now: NOW })
    expect(ace.fitPct).toBe(53)
    expect(ace.score).toBeGreaterThan(truck.score)
    // Exact formula: same distance (both at depot) -> score difference is fit + type bonus
    expect(ace.score - truck.score).toBeCloseTo(WEIGHTS.fit * (400 / 750 - 400 / 2500) + WEIGHTS.typeMatch, 4)
  })

  it('uses the vehicle\'s home hub when there is no fresh GPS, and never sends a driver to another city', () => {
    const r = route('A', 10) // starts at the Ranchi hub
    const ranchiVan = { ...van('r'), base: { name: 'Hopr Hub, Kokar', coordinates: L.lalpurChowk.coordinates } }
    const delhiVan = { ...van('d'), base: { name: 'Hopr Hub, Okhla', coordinates: [77.2811, 28.5349] } }
    const local = scoreCandidate({ route: r, driver: { name: 'Ravi' }, vehicle: ranchiVan, now: NOW })
    expect(local.feasible).toBe(true)
    expect(local.origin).toBe('hub')
    expect(local.reasons[0]).toMatch(/^based at Hopr Hub, Kokar, \d/)
    const away = scoreCandidate({ route: r, driver: { name: 'Pooja' }, vehicle: delhiVan, now: NOW })
    expect(away.feasible).toBe(false)
    expect(away.reason).toMatch(/^Pooja is 9\d\d km away \(based at Hopr Hub, Okhla\)$/) // Ranchi to Delhi, straight line
    // Fresh GPS wins over the home hub: a Delhi-based driver who is in Ranchi today is offered the route
    const visiting = scoreCandidate({ route: r, driver: { name: 'Pooja', lastLocation: fresh(L.harmuChowk.coordinates) }, vehicle: delhiVan, now: NOW })
    expect(visiting.feasible).toBe(true)
    expect(visiting.origin).toBe('gps')
  })

  it('matches routes to drivers globally, one route per driver and vehicle', () => {
    const routes = [route('heavy', 600), route('light', 5)]
    const candidates = [
      { driver: { _id: 'd1', name: 'Ravi', lastLocation: fresh(L.lalpurChowk.coordinates) }, vehicle: van('ace', 750) },
      { driver: { _id: 'd2', name: 'Pooja', lastLocation: fresh(L.lalpurChowk.coordinates) }, vehicle: van('bike', 25, 'bike') },
      { driver: { _id: 'd3', name: 'Imran' }, vehicle: null }
    ]
    const { assignments, unassigned } = planDispatch(routes, candidates, { now: NOW })
    const byRoute = Object.fromEntries(assignments.map(a => [a.route._id, a.driver.name]))
    expect(byRoute).toEqual({ heavy: 'Ravi', light: 'Pooja' })
    expect(unassigned).toEqual([])
  })

  it('never offers a driver on their day off', () => {
    const r = route('A', 100, { plannedStart: new Date(NOW) }) // 16 Oct 2026, 10:30 IST
    const off = scoreCandidate({ route: r, driver: { name: 'Ravi', daysOff: ['2026-10-16'] }, vehicle: van(1), now: NOW })
    expect(off.feasible).toBe(false)
    expect(off.reason).toBe('Ravi is off on 16 Oct')
    expect(scoreCandidate({ route: r, driver: { name: 'Ravi', daysOff: ['2026-10-17'] }, vehicle: van(1), now: NOW }).feasible).toBe(true)
  })

  it('explains routes it cannot place', () => {
    const { assignments, unassigned } = planDispatch([route('huge', 3000)], [{ driver: { _id: 'd1', name: 'Ravi' }, vehicle: van('ace', 750) }], { now: NOW })
    expect(assignments).toEqual([])
    expect(unassigned[0].reason).toMatch(/cannot carry 3000 kg/)
    expect(planDispatch([route('x', 1)], [], { now: NOW }).unassigned[0].reason).toBe('No available drivers')
  })
})

describe('auto-dispatch API', () => {
  useTestDb()

  async function fleet() {
    const manager = await createUser('fleet_manager')
    const ravi = await createUser('driver', { name: 'Ravi Kumar' })
    const pooja = await createUser('driver', { name: 'Pooja Kumari' })
    await Vehicle.create({ vehicleId: 'VEH-A', name: 'Tata Ace Gold', type: 'van', fuelType: 'diesel', mileage: 18, capacity: 750, licensePlate: 'JH01AA0001', driver: ravi.user._id })
    await Vehicle.create({ vehicleId: 'VEH-B', name: 'Hero Splendor+', type: 'bike', fuelType: 'petrol', mileage: 60, capacity: 25, licensePlate: 'JH01AA0002', driver: pooja.user._id })
    await User.updateOne({ _id: pooja.user._id }, { lastLocation: { coordinates: L.ratuRoad.coordinates, updatedAt: new Date() } })
    return { manager, ravi, pooja }
  }

  it('previews then applies assignments, re-validating on confirm', async () => {
    const { manager, ravi } = await fleet()
    const routeA = await createRoute(manager.auth) // 16.5 kg: fits both, Ravi is at the depot (closer)
    const preview = await api().post('/api/dispatch/preview').set(manager.auth)
    expect(preview.status).toBe(200)
    expect(preview.body.unassignedRoutes).toBe(1)
    expect(preview.body.availableDrivers).toBe(2)
    const [a] = preview.body.assignments
    expect(a.route.routeId).toBe(routeA.routeId)
    expect(a.driver.name).toBe('Ravi Kumar')
    expect(a.reasons.length).toBeGreaterThan(0)

    const confirm = await api().post('/api/dispatch/confirm').set(manager.auth)
      .send({ assignments: [{ route: a.route._id, driver: a.driver._id, vehicle: a.vehicle._id }] })
    expect(confirm.status).toBe(200)
    expect(confirm.body.assigned).toHaveLength(1)
    const saved = await Route.findById(routeA._id)
    expect(saved.driver.toString()).toBe(ravi.user._id.toString())

    // Replaying the same (now stale) preview assigns nothing twice
    const again = await api().post('/api/dispatch/confirm').set(manager.auth)
      .send({ assignments: [{ route: a.route._id, driver: a.driver._id, vehicle: a.vehicle._id }] })
    expect(again.body.assigned).toHaveLength(0)
    expect(again.body.skipped[0].reason).toMatch(/no longer/)
  })

  it('re-times a van-planned route for the motorbike it is dispatched to', async () => {
    const { manager, pooja } = await fleet()
    const planned = await createRoute(manager.auth) // planned for a diesel delivery van
    const bike = await Vehicle.findOne({ vehicleId: 'VEH-B' })
    const before = await Route.findById(planned._id)
    expect(before.fuelType).toBe('diesel')

    const confirm = await api().post('/api/dispatch/confirm').set(manager.auth)
      .send({ assignments: [{ route: planned._id, driver: pooja.user._id, vehicle: bike._id }] })
    expect(confirm.body.assigned).toHaveLength(1)

    const after = await Route.findById(planned._id)
    expect(after.vehicleType).toBe('bike')
    // Same stops, same order, same distance: only the vehicle-dependent figures move
    const order = r => [...r.stops].sort((x, y) => x.sequence - y.sequence).map(s => s.address)
    expect(order(after)).toEqual(order(before))
    expect(after.totalDistance).toBe(before.totalDistance)
    const fuel = estimateFuel(after.totalDistance, { fuelType: 'petrol', mileage: 60 })
    expect(after.fuelType).toBe('petrol')
    expect(after.fuelCost).toBeCloseTo(fuel.cost, 1)
    expect(after.co2Kg).toBeCloseTo(fuel.co2Kg, 1)
    expect(after.fuelCost).toBeLessThan(before.fuelCost)
    expect(after.capacityKg).toBe(25)
    // A motorbike is quicker between stops and at the door, so the last stop is no later
    const lastEta = r => Math.max(...r.stops.map(s => s.estimatedArrival.getTime()))
    expect(lastEta(after)).toBeLessThanOrEqual(lastEta(before))
    expect(after.estimatedTime).toBeLessThanOrEqual(before.estimatedTime)
  })

  it('does not offer drivers who are already busy', async () => {
    const { manager, ravi, pooja } = await fleet()
    await createRoute(manager.auth, { assignments: [{ driver: ravi.user._id }] })
    await createRoute(manager.auth, { assignments: [{ driver: pooja.user._id }] })
    await createRoute(manager.auth)
    const preview = await api().post('/api/dispatch/preview').set(manager.auth)
    expect(preview.body.availableDrivers).toBe(0)
    expect(preview.body.unassigned[0].reason).toBe('No available drivers')
  })

  it('keeps drivers off routes on the days they marked off', async () => {
    const { manager, ravi, pooja } = await fleet()
    const day = new Date(Date.now() + 2 * 86400000)
    const key = new Date(day.getTime() + 330 * 60000).toISOString().slice(0, 10)
    const tomorrowish = new Date(day.getTime() - 86400000 + 330 * 60000).toISOString().slice(0, 10)

    // A driver marks their own days off: sorted, de-duplicated, past days dropped
    const set = await api().put('/api/auth/days-off').set(ravi.auth).send({ daysOff: [key, '2020-01-01', tomorrowish, key] })
    expect(set.status).toBe(200)
    expect(set.body.daysOff).toEqual([tomorrowish, key])
    expect((await api().put('/api/auth/days-off').set(ravi.auth).send({ daysOff: ['16/10/2026'] })).status).toBe(400)
    expect((await api().put('/api/auth/days-off').set(manager.auth).send({ daysOff: [key] })).status).toBe(403)
    // A manager can set them for a driver
    const byManager = await api().put(`/api/drivers/${pooja.user._id}/days-off`).set(manager.auth).send({ daysOff: [key] })
    expect(byManager.status).toBe(200)
    expect(byManager.body.daysOff).toEqual([key])

    // Neither is offered for a route on that day, and neither can be assigned to it
    const planned = await createRoute(manager.auth, { departureTime: day.toISOString() })
    const preview = await api().post('/api/dispatch/preview').set(manager.auth)
    expect(preview.body.assignments).toHaveLength(0)
    expect(preview.body.unassigned[0].reason).toMatch(/is off on/)
    const assign = await api().patch(`/api/routes/${planned._id}`).set(manager.auth).send({ driver: ravi.user._id })
    expect(assign.status).toBe(400)
    expect(assign.body.message).toMatch(/Ravi Kumar is off on/)
  })

  it('is manager-only', async () => {
    const driver = await createUser('driver')
    expect((await api().post('/api/dispatch/preview').set(driver.auth)).status).toBe(403)
  })
})
