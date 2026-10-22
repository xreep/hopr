import { describe, it, expect } from 'vitest'
import { api, createUser } from './helpers.js'
import { useTestDb } from './db.js'
import Route from '../src/models/Route.js'
import User from '../src/models/User.js'
import Vehicle from '../src/models/Vehicle.js'

useTestDb()

describe('demo seeder', () => {
  it('creates accounts, a fleet in five cities and a route in each; Ranchi is assigned to the demo driver (idempotent)', async () => {
    const manager = await createUser('fleet_manager')
    const first = await api().post('/api/demo/seed').set(manager.auth)
    expect(first.status).toBe(201)
    expect(first.body.routes).toBe(5)
    const route = await Route.findById(first.body.routeId).populate('driver')
    expect(route.stops).toHaveLength(5)
    expect(route.driver.email).toBe('driver@hopr.com')
    expect(route.stops.every(s => s.address.includes('Ranchi') && s.windowStart && s.windowEnd)).toBe(true)
    expect(route.isDemo).toBe(true)

    const routes = await Route.find({ isDemo: true }).sort({ name: 1 })
    expect(routes.map(r => r.name)).toEqual(['Bengaluru morning run', 'Kolkata morning run', 'Mumbai morning run', 'New Delhi morning run', 'Ranchi morning run'])
    const city = { Bengaluru: 'Karnataka', Kolkata: 'West Bengal', Mumbai: 'Maharashtra', 'New Delhi': 'Delhi', Ranchi: 'Jharkhand' }
    for (const r of routes) {
      const name = r.name.replace(' morning run', '')
      expect(r.stops.every(s => s.address.includes(city[name]) || s.address.includes(name))).toBe(true)
      expect(Boolean(r.driver)).toBe(name === 'Ranchi')
    }

    const login = await api().post('/api/auth/login').send({ email: 'kavya.driver@hopr.com', password: 'driver123' })
    expect(login.status).toBe(200)

    const second = await api().post('/api/demo/seed').set(manager.auth)
    expect(second.status).toBe(201)
    expect(await Route.countDocuments({ isDemo: true })).toBe(5)
    expect(await User.countDocuments({ email: 'admin@hopr.com' })).toBe(1)
    expect(await Vehicle.countDocuments()).toBe(6)
    expect(await Vehicle.countDocuments({ 'base.coordinates.1': { $exists: true } })).toBe(6)
  })

  it('lets auto-dispatch pair each city\'s route with the driver based in that city', async () => {
    const manager = await createUser('fleet_manager')
    await api().post('/api/demo/seed').set(manager.auth)
    const preview = await api().post('/api/dispatch/preview').set(manager.auth)
    expect(preview.status).toBe(200)
    const pairs = Object.fromEntries(preview.body.assignments.map(a => [a.route.name, a.driver.name]))
    expect(pairs).toEqual({
      'New Delhi morning run': 'Pooja Kumari',
      'Mumbai morning run': 'Imran Ansari',
      'Bengaluru morning run': 'Kavya Reddy',
      'Kolkata morning run': 'Sourav Das'
    })
  })

  it('still works late at night by scheduling the demo for the next morning', async () => {
    const { seedDemo } = await import('../src/services/demo.js')
    // 23:10 IST on 20 Oct 2026: windows would run past midnight
    const { route } = await seedDemo({ now: new Date('2026-10-20T17:40:00Z') })
    expect(route.plannedStart.toISOString()).toBe('2026-10-21T04:30:00.000Z') // 10:00 IST next day
    for (const s of route.stops) expect(s.windowEnd > s.windowStart).toBe(true)
  })

  it('is not available to drivers', async () => {
    const driver = await createUser('driver')
    expect((await api().post('/api/demo/seed').set(driver.auth)).status).toBe(403)
  })
})
