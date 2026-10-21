import { describe, it, expect } from 'vitest'
import { api, createUser } from './helpers.js'
import Route from '../src/models/Route.js'
import User from '../src/models/User.js'
import { useTestDb } from './db.js'

useTestDb()

async function makeRoute(createdBy, driver) {
  return Route.create({
    routeId: `RT-${Math.random().toString(36).slice(2, 8)}`,
    name: 'Test route',
    createdBy,
    driver,
    stops: [
      { deliveryId: 'DLV-1', address: 'Albert Ekka Chowk, Main Road, Ranchi', coordinates: [85.3249, 23.3702] },
      { deliveryId: 'DLV-2', address: 'Morabadi Maidan, Ranchi', coordinates: [85.3278, 23.3909] }
    ]
  })
}

describe('authorization', () => {
  it('lets a driver read their own route', async () => {
    const manager = await createUser('fleet_manager')
    const driver = await createUser('driver')
    const route = await makeRoute(manager.user._id, driver.user._id)
    const res = await api().get(`/api/routes/${route._id}`).set(driver.auth)
    expect(res.status).toBe(200)
  })

  it('forbids a driver from reading another driver\'s route', async () => {
    const manager = await createUser('fleet_manager')
    const owner = await createUser('driver')
    const intruder = await createUser('driver')
    const route = await makeRoute(manager.user._id, owner.user._id)
    const res = await api().get(`/api/routes/${route._id}`).set(intruder.auth)
    expect(res.status).toBe(403)
  })

  it('forbids drivers from creating or optimizing routes', async () => {
    const driver = await createUser('driver')
    const stops = [
      { address: 'A', coordinates: [85.32, 23.36] },
      { address: 'B', coordinates: [85.33, 23.37] }
    ]
    expect((await api().post('/api/routes/optimize').set(driver.auth).send({ stops })).status).toBe(403)
    expect((await api().post('/api/routes').set(driver.auth).send({ stops })).status).toBe(403)
  })

  it('forbids a fleet manager from deactivating an admin through the drivers API', async () => {
    const manager = await createUser('fleet_manager')
    const admin = await createUser('admin')
    const res = await api().patch(`/api/drivers/${admin.user._id}/status`).set(manager.auth).send({ isActive: false })
    expect(res.status).toBe(404)
    expect((await User.findById(admin.user._id)).isActive).toBe(true)
  })

  it('prevents an admin from deleting or deactivating themselves', async () => {
    const admin = await createUser('admin')
    expect((await api().delete(`/api/admin/users/${admin.user._id}`).set(admin.auth)).status).toBe(400)
    expect((await api().patch(`/api/admin/users/${admin.user._id}/status`).set(admin.auth).send({ isActive: false })).status).toBe(400)
    expect(await User.findById(admin.user._id)).not.toBeNull()
  })

  it('treats regex metacharacters in search as literal text', async () => {
    const admin = await createUser('admin')
    const res = await api().get('/api/admin/users').query({ search: '(a+)+$[' }).set(admin.auth)
    expect(res.status).toBe(200)
    expect(res.body.users).toEqual([])
  })

  it('returns 400 (not 500) for malformed ids', async () => {
    const manager = await createUser('fleet_manager')
    const res = await api().get('/api/routes/not-an-id').set(manager.auth)
    expect(res.status).toBe(400)
  })

  it('blocks admin endpoints for non-admins', async () => {
    const manager = await createUser('fleet_manager')
    expect((await api().get('/api/admin/users').set(manager.auth)).status).toBe(403)
  })
})
