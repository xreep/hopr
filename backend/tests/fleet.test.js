import { describe, it, expect } from 'vitest'
import { api, createUser, createRoute } from './helpers.js'
import { useTestDb } from './db.js'
import Vehicle from '../src/models/Vehicle.js'
import Route from '../src/models/Route.js'

useTestDb()

// What the Vehicle Management form posts, including blank optional dates
const formPayload = (overrides = {}) => ({
  vehicleId: 'VEH-ACE01',
  name: 'Tata Ace Gold',
  type: 'van',
  fuelType: 'diesel',
  mileage: 18,
  capacity: 750,
  licensePlate: 'JH01 BK 4521',
  status: 'active',
  driver: '',
  purchaseDate: '',
  lastMaintenance: '',
  nextMaintenance: '',
  ...overrides
})

describe('vehicles', () => {
  it('creates a vehicle from the form with blank dates', async () => {
    const { auth } = await createUser('fleet_manager')
    const res = await api().post('/api/vehicles').set(auth).send(formPayload())
    expect(res.status).toBe(201)
    expect(res.body.vehicle.licensePlate).toBe('JH01BK4521')
    expect(res.body.vehicle.purchaseDate).toBeFalsy()
  })

  it('defaults electric van efficiency (km/kWh) when mileage is left blank', async () => {
    const { auth } = await createUser('fleet_manager')
    const res = await api().post('/api/vehicles').set(auth).send(formPayload({ type: 'ev_van', fuelType: 'electric', mileage: '' }))
    expect(res.status).toBe(201)
    expect(res.body.vehicle.mileage).toBe(7)
  })

  it('rejects duplicate plates with 409', async () => {
    const { auth } = await createUser('fleet_manager')
    await api().post('/api/vehicles').set(auth).send(formPayload())
    const res = await api().post('/api/vehicles').set(auth).send(formPayload({ vehicleId: 'VEH-OTHER' }))
    expect(res.status).toBe(409)
  })

  it('assigns a driver, moving them off any previous vehicle', async () => {
    const { auth } = await createUser('fleet_manager')
    const driver = await createUser('driver')
    const a = (await api().post('/api/vehicles').set(auth).send(formPayload({ driver: driver.user._id }))).body.vehicle
    expect(a.driver.name).toBe(driver.user.name)
    const b = (await api().post('/api/vehicles').set(auth).send(formPayload({ vehicleId: 'VEH-ACE02', licensePlate: 'JH01BK9999' }))).body.vehicle
    const moved = await api().patch(`/api/vehicles/${b._id}/assign-driver`).set(auth).send({ driverId: driver.user._id })
    expect(moved.status).toBe(200)
    expect((await Vehicle.findById(a._id)).driver).toBeNull()
  })

  it('refuses to assign a non-driver', async () => {
    const { auth, user } = await createUser('fleet_manager')
    const res = await api().post('/api/vehicles').set(auth).send(formPayload({ driver: user._id }))
    expect(res.status).toBe(400)
  })

  it('lists unassigned active vehicles as available', async () => {
    const { auth } = await createUser('fleet_manager')
    await api().post('/api/vehicles').set(auth).send(formPayload())
    await api().post('/api/vehicles').set(auth).send(formPayload({ vehicleId: 'VEH-M', licensePlate: 'JH01ZZ0001', status: 'maintenance' }))
    const res = await api().get('/api/vehicles/available').set(auth)
    expect(res.status).toBe(200)
    expect(res.body.vehicles.map(v => v.vehicleId)).toEqual(['VEH-ACE01'])
  })

  it('keeps mileage when an update omits it', async () => {
    const { auth } = await createUser('fleet_manager')
    const v = (await api().post('/api/vehicles').set(auth).send(formPayload({ mileage: 21 }))).body.vehicle
    const res = await api().put(`/api/vehicles/${v._id}`).set(auth).send({ name: 'Ace renamed' })
    expect(res.status).toBe(200)
    expect(res.body.vehicle.mileage).toBe(21)
  })

  it('hides the fleet list from drivers', async () => {
    const driver = await createUser('driver')
    expect((await api().get('/api/vehicles').set(driver.auth)).status).toBe(403)
  })
})

describe('drivers', () => {
  it('reports real performance metrics instead of random ratings', async () => {
    const manager = await createUser('fleet_manager')
    const driver = await createUser('driver')
    const route = await createRoute(manager.auth, { assignments: [{ driver: driver.user._id }] })
    await api().patch(`/api/routes/${route._id}/start`).set(driver.auth)
    await api().patch(`/api/routes/${route._id}/stops/${route.stops[0]._id}/status`).set(driver.auth).send({ status: 'completed' })
    await api().patch(`/api/routes/${route._id}/stops/${route.stops[1]._id}/status`).set(driver.auth).send({ status: 'failed', reason: 'Address locked' })

    const res = await api().get('/api/drivers').set(manager.auth)
    expect(res.status).toBe(200)
    const row = res.body.drivers.find(d => d._id === driver.user._id.toString())
    expect(row.totalDeliveries).toBe(1)
    expect(row.failedDeliveries).toBe(1)
    expect(row.completionRate).toBe(50)
    expect(row.activeRoute.routeId).toBe(route.routeId)
    expect(row).not.toHaveProperty('rating')

    const again = await api().get('/api/drivers').set(manager.auth)
    expect(again.body.drivers[0]).toEqual(res.body.drivers[0]) // deterministic
  })

  it('marks drivers on an active route in the availability list', async () => {
    const manager = await createUser('fleet_manager')
    const driver = await createUser('driver')
    const route = await createRoute(manager.auth, { assignments: [{ driver: driver.user._id }] })
    await Route.updateOne({ _id: route._id }, { status: 'active' })
    const res = await api().get('/api/drivers/available').set(manager.auth)
    expect(res.body.drivers.find(d => d._id === driver.user._id.toString()).onRoute).toBe(true)
  })
})

describe('map', () => {
  it('validates geocoding input and never fabricates coordinates', async () => {
    const { auth } = await createUser('fleet_manager')
    expect((await api().get('/api/map/suggest').query({ q: 'ab' }).set(auth)).status).toBe(400)
    // Providers are disabled in tests: the API says so instead of inventing data
    const res = await api().get('/api/map/geocode').query({ address: 'Lalpur Chowk, Ranchi' }).set(auth)
    expect(res.status).toBe(503)
  })

  it('returns estimated straight-line geometry without a Mapbox token', async () => {
    const { auth } = await createUser('fleet_manager')
    const res = await api().get('/api/map/directions').query({ coordinates: '85.3521,23.3756;85.3383,23.3722' }).set(auth)
    expect(res.status).toBe(200)
    expect(res.body.source).toBe('estimated')
    expect(res.body.geometry.coordinates).toHaveLength(2)
  })
})
