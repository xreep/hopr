import { describe, it, expect, afterEach } from 'vitest'
import jwt from 'jsonwebtoken'
import { api, createUser, createRoute, completeStop } from './helpers.js'
import { useTestDb } from './db.js'
import User from '../src/models/User.js'
import Route from '../src/models/Route.js'

useTestDb()

const signIn = (email, password) => api().post('/api/auth/login').send({ email, password })
const auth = token => ({ Authorization: `Bearer ${token}` })

describe('demo features only in demo mode', () => {
  afterEach(() => { process.env.DEMO_MODE = 'true' })

  it('without DEMO_MODE a fleet manager cannot create the known admin account', async () => {
    delete process.env.DEMO_MODE
    const manager = await createUser('fleet_manager')
    expect((await api().post('/api/demo/seed').set(manager.auth)).status).toBe(404)
    expect((await api().post('/api/demo/simulate').set(manager.auth)).status).toBe(404)
    expect(await User.exists({ email: 'admin@hopr.com' })).toBeNull()
    expect((await signIn('admin@hopr.com', 'admin123')).status).toBe(401)
    expect((await api().get('/api/demo/status')).body).toEqual({ enabled: false })
    expect((await api().get('/api/dashboard').set(manager.auth)).body.demo).toBeNull()
  })

  it('says when demo mode is on', async () => {
    expect((await api().get('/api/demo/status')).body).toEqual({ enabled: true })
  })
})

describe('shared demo accounts in demo mode', () => {
  async function demo() {
    const manager = await createUser('fleet_manager')
    await api().post('/api/demo/seed').set(manager.auth)
    const admin = (await signIn('admin@hopr.com', 'admin123')).body.token
    const users = Object.fromEntries((await User.find({ email: /@hopr\.com$/ })).map(u => [u.email, u._id.toString()]))
    return { manager, admin, users }
  }

  it('cannot be changed, deactivated or deleted, even by the demo admin', async () => {
    const { manager, admin, users } = await demo()
    const target = users['manager@hopr.com']
    expect((await api().put(`/api/admin/users/${target}`).set(auth(admin)).send({ password: 'taken-over' })).status).toBe(403)
    expect((await api().put(`/api/admin/users/${target}`).set(auth(admin)).send({ role: 'driver' })).status).toBe(403)
    expect((await api().patch(`/api/admin/users/${target}/status`).set(auth(admin)).send({ isActive: false })).status).toBe(403)
    expect((await api().delete(`/api/admin/users/${target}`).set(auth(admin))).status).toBe(403)
    expect((await api().patch(`/api/drivers/${users['driver@hopr.com']}/status`).set(manager.auth).send({ isActive: false })).status).toBe(403)
    expect((await signIn('manager@hopr.com', 'manager123')).status).toBe(200)

    // Other accounts are managed as usual
    const other = await createUser('driver')
    expect((await api().put(`/api/admin/users/${other.user._id}`).set(auth(admin)).send({ name: 'Renamed Driver' })).status).toBe(200)
  })

  it('cannot change their own email or password', async () => {
    await demo()
    const driver = (await signIn('driver@hopr.com', 'driver123')).body.token
    expect((await api().put('/api/auth/profile').set(auth(driver)).send({ email: 'mine@example.com' })).status).toBe(403)
    expect((await api().put('/api/auth/password').set(auth(driver)).send({ currentPassword: 'driver123', newPassword: 'locked-out' })).status).toBe(403)
  })

  it('cannot be locked out by someone typing wrong passwords', async () => {
    await demo()
    for (let i = 0; i < 6; i++) expect((await signIn('kavya.driver@hopr.com', 'wrong-password')).status).toBe(401)
    expect((await signIn('kavya.driver@hopr.com', 'driver123')).status).toBe(200)
  })
})

describe('access and tokens', () => {
  it('keeps address search and road routing for managers', async () => {
    const driver = await createUser('driver')
    for (const path of ['/api/map/config', '/api/map/suggest?q=Lalpur', '/api/map/geocode?address=Lalpur', '/api/map/directions?coordinates=85.35,23.37;85.33,23.37']) {
      expect((await api().get(path).set(driver.auth)).status, path).toBe(403)
    }
  })

  it('accepts sign-in tokens signed with HS256 only', async () => {
    const { user } = await createUser('fleet_manager')
    const forged = jwt.sign({ id: user._id.toString(), role: user.role, tokenVersion: user.tokenVersion }, process.env.JWT_SECRET, { algorithm: 'HS512' })
    expect((await api().get('/api/auth/me').set(auth(forged))).status).toBe(401)
  })
})

describe('tracking links and late updates', () => {
  it('expires a tracking link two days after the delivery', async () => {
    const manager = await createUser('fleet_manager')
    const driver = await createUser('driver')
    const route = await createRoute(manager.auth, { assignments: [{ driver: driver.user._id }] })
    const stop = route.stops[0]
    await completeStop(driver.auth, route._id, stop._id)
    const { trackingToken } = (await Route.findById(route._id)).stops.id(stop._id)
    expect((await api().get(`/api/track/${trackingToken}`)).status).toBe(200)

    await Route.updateOne({ _id: route._id, 'stops._id': stop._id }, { $set: { 'stops.$.completedAt': new Date(Date.now() - 49 * 3600000) } })
    const expired = await api().get(`/api/track/${trackingToken}`)
    expect(expired.status).toBe(410)
    expect(expired.body).toEqual({ message: 'This tracking link has expired' })
  })

  it('marks updates recorded offline with when they arrived', async () => {
    const manager = await createUser('fleet_manager')
    const driver = await createUser('driver')
    const route = await createRoute(manager.auth, { assignments: [{ driver: driver.user._id }] })
    const [first, second] = [...route.stops].sort((a, b) => a.sequence - b.sequence)
    await api().patch(`/api/routes/${route._id}/stops/${first._id}/status`).set(driver.auth)
      .send({ status: 'failed', reason: 'Address not found', at: new Date(Date.now() - 30 * 60000).toISOString() })
    await completeStop(driver.auth, route._id, second._id)
    const saved = await Route.findById(route._id)
    expect(saved.stops.id(first._id).receivedAt).toBeInstanceOf(Date)
    expect(saved.stops.id(second._id).receivedAt).toBeUndefined()
  })
})

describe('sign-up approval outside demo mode', () => {
  afterEach(() => { process.env.DEMO_MODE = 'true' })

  it('makes a new driver wait for a manager before signing in', async () => {
    delete process.env.DEMO_MODE
    const signup = await api().post('/api/auth/register').send({ name: 'New Driver', email: 'new.driver@example.com', password: 'secret123' })
    expect(signup.status).toBe(201)
    expect(signup.body.pendingApproval).toBe(true)
    expect(signup.body.token).toBeUndefined()

    const early = await signIn('new.driver@example.com', 'secret123')
    expect(early.status).toBe(401)
    expect(early.body.message).toMatch(/waiting for a fleet manager/)

    const manager = await createUser('fleet_manager')
    expect((await api().get('/api/dashboard').set(manager.auth)).body.driversAwaitingApproval).toBe(1)
    const pending = await User.findOne({ email: 'new.driver@example.com' })
    const approve = await api().patch(`/api/drivers/${pending._id}/status`).set(manager.auth).send({ isActive: true })
    expect(approve.body.driver.pendingApproval).toBe(false)
    expect((await signIn('new.driver@example.com', 'secret123')).status).toBe(200)
  })

  it('lets demo visitors sign up and start straight away', async () => {
    const signup = await api().post('/api/auth/register').send({ name: 'Demo Visitor', email: 'visitor@example.com', password: 'secret123' })
    expect(signup.status).toBe(201)
    expect(signup.body.token).toBeTruthy()
  })
})
