import { describe, it, expect } from 'vitest'
import { api, createUser, createRoute, completeStop } from './helpers.js'
import { useTestDb } from './db.js'
import Route from '../src/models/Route.js'
import User from '../src/models/User.js'
import { RANCHI_HUB, RANCHI_LOCATIONS as L } from '../src/data/ranchiLocations.js'
import { projectAlong, sliceLine, lengthKm } from '../src/services/tracking.js'

useTestDb()

async function activeRoute() {
  const manager = await createUser('fleet_manager')
  const driver = await createUser('driver', { name: 'Ravi Kumar Oraon' })
  const route = await createRoute(manager.auth, { assignments: [{ driver: driver.user._id }] })
  await api().patch(`/api/routes/${route._id}/start`).set(driver.auth)
  const fresh = await Route.findById(route._id)
  return { manager, driver, route: fresh }
}

const ping = (auth, id, coordinates, extra = {}) => api().patch(`/api/routes/${id}/location`).set(auth).send({ coordinates, ...extra })

describe('tracking geometry', () => {
  it('projects and slices along a polyline', () => {
    const line = [RANCHI_HUB.coordinates, L.lalpurChowk.coordinates, L.albertEkkaChowk.coordinates]
    const mid = projectAlong(line, [85.345, 23.374])
    expect(mid.segment).toBe(0)
    expect(mid.offKm).toBeLessThan(0.1)
    const rest = sliceLine(line, mid.alongKm, lengthKm(line))
    expect(rest[rest.length - 1]).toEqual(L.albertEkkaChowk.coordinates)
    expect(lengthKm(rest)).toBeCloseTo(lengthKm(line) - mid.alongKm, 3)
  })
})

describe('F2 driver location pings', () => {
  it('stores the live position, updates the driver and accumulates driven distance', async () => {
    const { driver, route } = await activeRoute()
    expect((await ping(driver.auth, route._id, RANCHI_HUB.coordinates, { accuracy: 8, heading: 270, speed: 6 })).status).toBe(200)
    const second = await ping(driver.auth, route._id, L.lalpurChowk.coordinates, { accuracy: 8 })
    expect(second.status).toBe(200)
    expect(second.body.movedKm).toBeGreaterThan(1.3)
    const stored = await Route.findById(route._id)
    expect(stored.driverLocation.coordinates).toEqual(L.lalpurChowk.coordinates)
    expect(stored.actualDistance).toBeGreaterThan(1.3)
    expect((await User.findById(driver.user._id)).lastLocation.coordinates).toEqual(L.lalpurChowk.coordinates)
  })

  it('ignores GPS jitter and implausible jumps in the odometer', async () => {
    const { driver, route } = await activeRoute()
    await ping(driver.auth, route._id, [85.3383, 23.3722])
    await ping(driver.auth, route._id, [85.33831, 23.37221]) // ~1 m
    await ping(driver.auth, route._id, [85.9, 23.9]) // ~80 km teleport
    expect((await Route.findById(route._id)).actualDistance).toBe(0)
  })

  it('moves the van but not the odometer on a fix without a usable accuracy', async () => {
    const { driver, route } = await activeRoute()
    await ping(driver.auth, route._id, RANCHI_HUB.coordinates, { accuracy: 8 })
    // A position set by hand on the map, then a coarse fix 300 m off
    expect((await ping(driver.auth, route._id, L.lalpurChowk.coordinates, { accuracy: null })).body.movedKm).toBe(0)
    expect((await ping(driver.auth, route._id, RANCHI_HUB.coordinates, { accuracy: 300 })).body.movedKm).toBe(0)
    const stored = await Route.findById(route._id)
    expect(stored.driverLocation.coordinates).toEqual(RANCHI_HUB.coordinates)
    expect(stored.actualDistance).toBe(0)
  })

  it('only accepts pings from the assigned driver on an active route', async () => {
    const { driver, route } = await activeRoute()
    const other = await createUser('driver')
    expect((await ping(other.auth, route._id, RANCHI_HUB.coordinates)).status).toBe(403)
    expect((await ping(driver.auth, route._id, [85.3, 123])).status).toBe(400)
    await Route.updateOne({ _id: route._id }, { status: 'planned' })
    expect((await ping(driver.auth, route._id, RANCHI_HUB.coordinates)).status).toBe(409)
  })

  it('has its own rate limit (30/min) separate from the global API budget', async () => {
    const { driver, route } = await activeRoute()
    let limited = 0
    for (let i = 0; i < 32; i++) {
      const res = await ping(driver.auth, route._id, [85.3383 + i * 0.0002, 23.3722])
      if (res.status === 429) limited++
    }
    expect(limited).toBe(2)
  })
})

describe('F2 public tracking page', () => {
  it('needs no login, rejects unknown tokens and shows "Packed" before the route starts', async () => {
    const manager = await createUser('fleet_manager')
    const route = await createRoute(manager.auth)
    expect((await api().get('/api/track/not-a-real-token-1234567')).status).toBe(404)
    expect((await api().get('/api/track/x')).status).toBe(404)
    const res = await api().get(`/api/track/${route.stops[2].trackingToken}`)
    expect(res.status).toBe(200)
    expect(res.body.status).toBe('packed')
    expect(res.body.location).toBeNull()
  })

  it('shows the moving driver, the remaining path to this customer and an ETA', async () => {
    const { driver, route } = await activeRoute()
    const target = route.stops[3]
    await ping(driver.auth, route._id, RANCHI_HUB.coordinates)
    const res = await api().get(`/api/track/${target.trackingToken}`)
    expect(res.body.status).toBe('on_the_way')
    expect(res.body.driver).toEqual({ firstName: 'Ravi', initials: 'RK' })
    expect(res.body.location.coordinates).toEqual(RANCHI_HUB.coordinates)
    expect(res.body.location.stale).toBe(false)
    const path = res.body.remainingPath
    expect(path[0]).toEqual(RANCHI_HUB.coordinates)
    expect(path[path.length - 1][0]).toBeCloseTo(target.coordinates[0], 5)
    expect(path[path.length - 1][1]).toBeCloseTo(target.coordinates[1], 5)
    expect(res.body.eta.minutes).toBeGreaterThan(5)
    expect(res.body.eta.stopsBefore).toBe(3)
    expect(res.body.timeline.map(t => t.done)).toEqual([true, true, false, false])
  })

  it('switches to "Arriving" within 500 m and "Delivered" after completion', async () => {
    const { driver, route } = await activeRoute()
    const target = route.stops[0]
    const [lng, lat] = target.coordinates
    await ping(driver.auth, route._id, [lng + 0.003, lat]) // ~300 m away
    const arriving = await api().get(`/api/track/${target.trackingToken}`)
    expect(arriving.body.status).toBe('arriving')
    expect(arriving.body.timeline.map(t => t.done)).toEqual([true, true, true, false])

    await completeStop(driver.auth, route._id, target._id)
    const delivered = await api().get(`/api/track/${target.trackingToken}`)
    expect(delivered.body.status).toBe('delivered')
    expect(delivered.body.location).toBeNull()
    expect(delivered.body.delivery.completedAt).toBeTruthy()
  })

  it('flags stale locations after 60 s without a ping', async () => {
    const { driver, route } = await activeRoute()
    await ping(driver.auth, route._id, RANCHI_HUB.coordinates)
    await Route.updateOne({ _id: route._id }, { 'driverLocation.updatedAt': new Date(Date.now() - 90000) })
    const res = await api().get(`/api/track/${route.stops[1].trackingToken}`)
    expect(res.body.location.stale).toBe(true)
  })

  it('reveals nothing about other customers or contact details', async () => {
    const { driver, route } = await activeRoute()
    await ping(driver.auth, route._id, RANCHI_HUB.coordinates)
    const res = await api().get(`/api/track/${route.stops[1].trackingToken}`)
    const body = JSON.stringify(res.body)
    for (const other of route.stops.filter((_, i) => i !== 1)) {
      expect(body).not.toContain(other.address)
      if (other.customerName) expect(body).not.toContain(other.customerName)
    }
    expect(body).not.toContain('customerPhone')
    expect(body).not.toContain('trackingToken')
    expect(body).not.toContain(driver.user.email)
  })
})
