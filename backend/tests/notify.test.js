import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { api, createUser, createRoute } from './helpers.js'
import { useTestDb } from './db.js'
import User from '../src/models/User.js'
import Vehicle from '../src/models/Vehicle.js'
import { settled, maintenanceDue, weeklyReport } from '../src/services/notify.js'

useTestDb()

let sent
beforeEach(() => {
  sent = []
  process.env.RESEND_API_KEY = 'test-key'
  process.env.EMAIL_FROM = 'Hopr <alerts@example.com>'
  vi.stubGlobal('fetch', vi.fn(async (url, init) => {
    sent.push({ url, ...JSON.parse(init.body) })
    return { ok: true, status: 200 }
  }))
})
afterEach(() => {
  delete process.env.RESEND_API_KEY
  delete process.env.EMAIL_FROM
  vi.unstubAllGlobals()
})

const recipients = () => sent.flatMap(m => m.to).sort()

describe('email notifications', () => {
  it('tells managers about a failed delivery, by their own settings', async () => {
    const manager = await createUser('fleet_manager', { email: 'wants@example.com' })
    await createUser('fleet_manager', { email: 'quiet@example.com', notifications: { email: false } })
    await createUser('fleet_manager', { email: 'no-routes@example.com', notifications: { email: true, routeUpdates: false } })
    const driver = await createUser('driver', { name: 'Ravi Kumar Oraon' })
    const route = await createRoute(manager.auth, { assignments: [{ driver: driver.user._id }] })
    await settled()
    sent = []

    await api().patch(`/api/routes/${route._id}/stops/${route.stops[0]._id}/status`).set(driver.auth).send({ status: 'failed', reason: 'Address not found' })
    await settled()
    expect(recipients()).toEqual(['wants@example.com'])
    expect(sent[0].url).toBe('https://api.resend.com/emails')
    expect(sent[0].subject).toMatch(/^Delivery failed/)
    expect(sent[0].text).toContain('Ravi Kumar Oraon could not deliver')
    expect(sent[0].text).toContain('Address not found')
  })

  it('tells a driver when a route is assigned to them', async () => {
    const manager = await createUser('fleet_manager', { notifications: { email: false } })
    const driver = await createUser('driver', { email: 'ravi@example.com' })
    const route = await createRoute(manager.auth)
    await api().patch(`/api/routes/${route._id}`).set(manager.auth).send({ driver: driver.user._id.toString() })
    await settled()
    expect(recipients()).toEqual(['ravi@example.com'])
    expect(sent[0].subject).toMatch(/^New route/)
  })

  it('never emails the shared demo accounts', async () => {
    const manager = await createUser('fleet_manager', { notifications: { email: false } })
    await api().post('/api/demo/seed').set(manager.auth)
    const driver = await User.findOne({ email: 'pooja.driver@hopr.com' })
    const route = await createRoute(manager.auth)
    await api().patch(`/api/routes/${route._id}`).set(manager.auth).send({ driver: driver._id.toString() })
    await settled()
    expect(sent).toEqual([])
  })

  it('sends one maintenance alert per service date', async () => {
    await createUser('admin', { email: 'fleet@example.com' })
    await Vehicle.create({ vehicleId: 'VEH-T1', name: 'Tata Ace', type: 'van', fuelType: 'diesel', mileage: 16, capacity: 750, licensePlate: 'JH01AB1234', nextMaintenance: new Date(Date.now() + 2 * 86400000) })
    expect(await maintenanceDue()).toBe(1)
    expect(await maintenanceDue()).toBe(0)
    expect(sent.map(m => m.subject)).toEqual(['Service due: Tata Ace (JH01AB1234)'])
  })

  it('sends the weekly report on Monday morning, once', async () => {
    await createUser('fleet_manager', { email: 'weekly@example.com', notifications: { email: true, weeklyReports: true } })
    const sundayNight = new Date('2026-10-18T16:00:00Z') // 21:30 IST Sunday
    const mondayMorning = new Date('2026-10-19T03:30:00Z') // 09:00 IST Monday
    expect(await weeklyReport(sundayNight)).toBe(0)
    expect(await weeklyReport(mondayMorning)).toBe(1)
    expect(await weeklyReport(new Date(mondayMorning.getTime() + 3600000))).toBe(0)
    expect(sent[0].text).toContain('Last week in Hopr')
  })

  it('sends nothing without an email key', async () => {
    delete process.env.RESEND_API_KEY
    await createUser('admin')
    await Vehicle.create({ vehicleId: 'VEH-T2', name: 'Tata Ace', type: 'van', fuelType: 'diesel', mileage: 16, capacity: 750, licensePlate: 'JH01AB9999', nextMaintenance: new Date() })
    await maintenanceDue()
    expect(fetch).not.toHaveBeenCalled()
  })
})
