import { describe, it, expect } from 'vitest'
import { scoreCandidate, planDispatch, WEIGHTS } from '../src/services/dispatch.js'
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

  it('does not offer drivers who are already busy', async () => {
    const { manager, ravi, pooja } = await fleet()
    await createRoute(manager.auth, { assignments: [{ driver: ravi.user._id }] })
    await createRoute(manager.auth, { assignments: [{ driver: pooja.user._id }] })
    await createRoute(manager.auth)
    const preview = await api().post('/api/dispatch/preview').set(manager.auth)
    expect(preview.body.availableDrivers).toBe(0)
    expect(preview.body.unassigned[0].reason).toBe('No available drivers')
  })

  it('is manager-only', async () => {
    const driver = await createUser('driver')
    expect((await api().post('/api/dispatch/preview').set(driver.auth)).status).toBe(403)
  })
})
