import { describe, it, expect } from 'vitest'
import { api, createUser, createRoute, completeStop, TINY_PNG } from './helpers.js'
import { useTestDb } from './db.js'
import Upload from '../src/models/Upload.js'

useTestDb()

async function setup() {
  const manager = await createUser('fleet_manager')
  const driver = await createUser('driver')
  const route = await createRoute(manager.auth, { assignments: [{ driver: driver.user._id }] })
  return { manager, driver, route, stop: route.stops[0] }
}

describe('F1 proof of delivery', () => {
  it('completes a stop with photo, signature and note, recording who and when', async () => {
    const { manager, driver, route, stop } = await setup()
    const res = await completeStop(driver.auth, route._id, stop._id, { note: 'Handed to customer at gate 2' })
    expect(res.status).toBe(200)
    const done = res.body.route.stops.find(s => s._id === stop._id)
    expect(done.status).toBe('completed')
    expect(done.proof.photo).toBeTruthy()
    expect(done.proof.signature).toBeTruthy()
    expect(done.proof.note).toBe('Handed to customer at gate 2')
    expect(done.proof.completedBy.name).toBe(driver.user.name)
    expect(new Date(done.proof.completedAt).getTime()).toBeGreaterThan(Date.now() - 60000)
    expect(res.body.route.status).toBe('active') // auto-started

    // Viewable on the route detail by the manager
    const detail = await api().get(`/api/routes/${route._id}`).set(manager.auth)
    const photoId = detail.body.route.stops.find(s => s._id === stop._id).proof.photo
    const img = await api().get(`/api/uploads/${photoId}`).set(manager.auth)
    expect(img.status).toBe(200)
    expect(img.headers['content-type']).toBe('image/png')
    expect(Buffer.compare(img.body, TINY_PNG)).toBe(0)
  })

  it('accepts a signature on its own', async () => {
    const { driver, route, stop } = await setup()
    const res = await api().post(`/api/routes/${route._id}/stops/${stop._id}/complete`).set(driver.auth)
      .attach('signature', TINY_PNG, { filename: 'sig.png', contentType: 'image/png' })
    expect(res.status).toBe(200)
  })

  it('requires a photo or signature', async () => {
    const { driver, route, stop } = await setup()
    const res = await api().post(`/api/routes/${route._id}/stops/${stop._id}/complete`).set(driver.auth).field('note', 'no proof')
    expect(res.status).toBe(400)
  })

  it('rejects files that are not really images', async () => {
    const { driver, route, stop } = await setup()
    const fake = await api().post(`/api/routes/${route._id}/stops/${stop._id}/complete`).set(driver.auth)
      .attach('photo', Buffer.from('#!/bin/sh\necho pwned\n'), { filename: 'photo.png', contentType: 'image/png' })
    expect(fake.status).toBe(400)
    const wrongType = await api().post(`/api/routes/${route._id}/stops/${stop._id}/complete`).set(driver.auth)
      .attach('photo', Buffer.from('hello'), { filename: 'a.txt', contentType: 'text/plain' })
    expect(wrongType.status).toBe(400)
    expect(await Upload.countDocuments()).toBe(0)
  })

  it('rejects images over 5 MB', async () => {
    const { driver, route, stop } = await setup()
    const big = Buffer.concat([TINY_PNG, Buffer.alloc(5 * 1024 * 1024 + 10)])
    const res = await api().post(`/api/routes/${route._id}/stops/${stop._id}/complete`).set(driver.auth)
      .attach('photo', big, { filename: 'big.png', contentType: 'image/png' })
    expect(res.status).toBe(413)
  })

  it('makes drivers use proof of delivery (managers may override)', async () => {
    const { manager, driver, route, stop } = await setup()
    const asDriver = await api().patch(`/api/routes/${route._id}/stops/${stop._id}/status`).set(driver.auth).send({ status: 'completed' })
    expect(asDriver.status).toBe(403)
    const asManager = await api().patch(`/api/routes/${route._id}/stops/${stop._id}/status`).set(manager.auth).send({ status: 'completed' })
    expect(asManager.status).toBe(200)
  })

  it('keeps proof images private to managers and the route\'s driver', async () => {
    const { driver, route, stop } = await setup()
    const res = await completeStop(driver.auth, route._id, stop._id)
    const photoId = res.body.route.stops.find(s => s._id === stop._id).proof.photo
    const other = await createUser('driver')
    expect((await api().get(`/api/uploads/${photoId}`).set(other.auth)).status).toBe(403)
    expect((await api().get(`/api/uploads/${photoId}`).set(driver.auth)).status).toBe(200)
    expect((await api().get(`/api/uploads/${photoId}`)).status).toBe(401)
  })

  it('does not let another driver complete the stop', async () => {
    const { route, stop } = await setup()
    const other = await createUser('driver')
    expect((await completeStop(other.auth, route._id, stop._id)).status).toBe(403)
  })
})
