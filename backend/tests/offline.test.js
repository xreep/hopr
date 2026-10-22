import { describe, it, expect } from 'vitest'
import { api, createUser, createRoute, TINY_PNG } from './helpers.js'
import { useTestDb } from './db.js'
import { eventTime } from '../src/routes/routes.js'

useTestDb()

async function setup() {
  const manager = await createUser('fleet_manager')
  const driver = await createUser('driver')
  const route = await createRoute(manager.auth, { assignments: [{ driver: driver.user._id }] })
  return { driver, route }
}

const minutesAgo = n => new Date(Date.now() - n * 60000).toISOString()

describe('updates sent late by the offline driver app', () => {
  it('trusts the time an update happened only within the last day and never in the future', () => {
    const now = new Date('2026-10-22T10:00:00Z')
    expect(eventTime('2026-10-22T09:20:00Z', now).toISOString()).toBe('2026-10-22T09:20:00.000Z')
    expect(eventTime('2026-10-22T10:30:00Z', now)).toBe(now)
    expect(eventTime('2026-10-20T09:00:00Z', now)).toBe(now)
    expect(eventTime(undefined, now)).toBe(now)
  })

  it('records the start, a failure and a delivery at the times they happened on the road', async () => {
    const { driver, route } = await setup()
    const [first, second] = [...route.stops].sort((a, b) => a.sequence - b.sequence)

    const start = await api().patch(`/api/routes/${route._id}/start`).set(driver.auth).send({ at: minutesAgo(50) })
    expect(start.status).toBe(200)
    expect(Math.abs(new Date(start.body.route.startedAt) - new Date(minutesAgo(50)))).toBeLessThan(5000)

    const failed = await api().patch(`/api/routes/${route._id}/stops/${first._id}/status`).set(driver.auth)
      .send({ status: 'failed', reason: 'Address not found', at: minutesAgo(40) })
    expect(failed.status).toBe(200)
    const failedStop = failed.body.route.stops.find(s => s._id === first._id)
    expect(Math.abs(new Date(failedStop.failedAt) - new Date(minutesAgo(40)))).toBeLessThan(5000)

    const delivered = await api().post(`/api/routes/${route._id}/stops/${second._id}/complete`).set(driver.auth)
      .attach('photo', TINY_PNG, { filename: 'door.png', contentType: 'image/png' })
      .field('at', minutesAgo(30))
    expect(delivered.status).toBe(200)
    const done = delivered.body.route.stops.find(s => s._id === second._id)
    expect(Math.abs(new Date(done.completedAt) - new Date(minutesAgo(30)))).toBeLessThan(5000)
    expect(done.proof.completedAt).toBe(done.completedAt)

    // Sent twice (the reply was lost on a bad connection): the second is refused, not doubled
    const again = await api().post(`/api/routes/${route._id}/stops/${second._id}/complete`).set(driver.auth)
      .attach('photo', TINY_PNG, { filename: 'door.png', contentType: 'image/png' })
    expect(again.status).toBe(409)
  })

  it('rejects a time that is not a date', async () => {
    const { driver, route } = await setup()
    const res = await api().patch(`/api/routes/${route._id}/start`).set(driver.auth).send({ at: 'yesterday' })
    expect(res.status).toBe(400)
  })
})
