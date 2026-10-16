import { describe, it, expect } from 'vitest'
import { api, createUser } from './helpers.js'
import { useTestDb } from './db.js'
import Route from '../src/models/Route.js'
import User from '../src/models/User.js'
import Vehicle from '../src/models/Vehicle.js'

useTestDb()

describe('demo seeder', () => {
  it('creates accounts, fleet and a 5-stop Ranchi route assigned to the demo driver (idempotent)', async () => {
    const manager = await createUser('fleet_manager')
    const first = await api().post('/api/demo/seed').set(manager.auth)
    expect(first.status).toBe(201)
    const route = await Route.findById(first.body.routeId).populate('driver')
    expect(route.stops).toHaveLength(5)
    expect(route.driver.email).toBe('driver@hopr.com')
    expect(route.stops.every(s => s.address.includes('Ranchi') && s.windowStart && s.windowEnd)).toBe(true)
    expect(route.isDemo).toBe(true)

    const login = await api().post('/api/auth/login').send({ email: 'driver@hopr.com', password: 'driver123' })
    expect(login.status).toBe(200)

    const second = await api().post('/api/demo/seed').set(manager.auth)
    expect(second.status).toBe(201)
    expect(await Route.countDocuments({ isDemo: true })).toBe(1)
    expect(await User.countDocuments({ email: 'admin@hopr.com' })).toBe(1)
    expect(await Vehicle.countDocuments()).toBe(4)
  })

  it('is not available to drivers', async () => {
    const driver = await createUser('driver')
    expect((await api().post('/api/demo/seed').set(driver.auth)).status).toBe(403)
  })
})
