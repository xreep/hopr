import { describe, it, expect } from 'vitest'
import { api, createUser, createRoute, planBody, TINY_PNG } from './helpers.js'
import { useTestDb } from './db.js'
import Route from '../src/models/Route.js'
import TravelTimeStat from '../src/models/TravelTimeStat.js'
import { legSample, correction, areaOf, MIN_SAMPLES } from '../src/services/learnedTraffic.js'
import { arrivalErrorMinutes, computeKpis } from '../src/services/analytics.js'
import { RANCHI_HUB } from '../src/data/ranchiLocations.js'

useTestDb()

const at = (base, min) => new Date(new Date(base).getTime() + min * 60000)

describe('learning travel times from delivered legs', () => {
  const start = new Date('2026-10-15T04:30:00Z') // 10:00 IST
  const route = (completedMin, legMinutes = 10) => ({
    depot: RANCHI_HUB, vehicleType: 'van', startedAt: start,
    stops: [{ sequence: 1, status: 'completed', legMinutes, completedAt: at(start, completedMin) }]
  })

  it('compares the real drive (minus time at the door) with the planned leg', () => {
    // 26 min after leaving, less 6 min at the door: a 20 min drive planned as 10
    expect(legSample(route(26), route(26).stops[0])).toEqual({ area: areaOf(RANCHI_HUB.coordinates), hour: 10, ratio: 2 })
  })

  it('ignores legs that were a break or a detour rather than traffic', () => {
    expect(legSample(route(66), route(66).stops[0])).toBeNull() // 6x the plan
    expect(legSample(route(7), route(7).stops[0])).toBeNull() // faster than physically likely
  })

  it('blends a correction in only after enough legs, and gradually', () => {
    expect(correction({ samples: MIN_SAMPLES - 1, sumLogRatio: (MIN_SAMPLES - 1) * Math.log(2) })).toBe(1)
    // 20 legs at 1.5x weigh as much as the model: halfway in log terms
    expect(correction({ samples: 20, sumLogRatio: 20 * Math.log(1.5) })).toBeCloseTo(Math.sqrt(1.5), 6)
    expect(correction({ samples: 1000, sumLogRatio: 1000 * Math.log(10) })).toBe(2.2) // bounded
  })

  it('records real deliveries and plans later ETAs where drives have been slower', async () => {
    const manager = await createUser('fleet_manager')
    const driver = await createUser('driver')
    const planned = await createRoute(manager.auth, { assignments: [{ driver: driver.user._id }] })
    const first = [...planned.stops].sort((a, b) => a.sequence - b.sequence)[0]
    const leftAt = at(Date.now(), -90)
    await api().patch(`/api/routes/${planned._id}/start`).set(driver.auth).send({ at: leftAt.toISOString() })
    await api().post(`/api/routes/${planned._id}/stops/${first._id}/complete`).set(driver.auth)
      .attach('photo', TINY_PNG, { filename: 'door.png', contentType: 'image/png' })
      .field('at', at(leftAt, first.legMinutes * 1.5 + 6).toISOString())
    const stat = await TravelTimeStat.findOne({ area: areaOf(RANCHI_HUB.coordinates) })
    expect(stat.samples).toBe(1)
    expect(Math.exp(stat.sumLogRatio)).toBeCloseTo(1.5, 1)

    const before = (await api().post('/api/routes/optimize').set(manager.auth).send(planBody())).body.routes[0].totals.driveMinutes
    await TravelTimeStat.deleteMany({})
    await TravelTimeStat.insertMany(Array.from({ length: 24 }, (_, hour) => ({ area: areaOf(RANCHI_HUB.coordinates), hour, samples: 40, sumLogRatio: 40 * Math.log(1.5) })))
    const after = (await api().post('/api/routes/optimize').set(manager.auth).send(planBody())).body.routes[0].totals.driveMinutes
    expect(after).toBeGreaterThan(before * 1.25)

    const analytics = await api().get('/api/analytics').set(manager.auth)
    expect(analytics.body.learning).toEqual({ legs: 960, areas: 1, hoursInUse: 24 })
  })

  it('never learns from simulated demo drives', async () => {
    const manager = await createUser('fleet_manager')
    await api().post('/api/demo/seed').set(manager.auth)
    await Route.updateMany({ isDemo: true }, { $set: { 'stops.$[].legMinutes': 10 } })
    const { advanceSimulations } = await import('../src/services/simulation.js')
    await api().post('/api/demo/simulate').set(manager.auth)
    await advanceSimulations(new Date(Date.now() + 3600000))
    expect(await TravelTimeStat.countDocuments()).toBe(0)
  })
})

describe('arrival time accuracy', () => {
  it('measures the promised arrival against when the driver reached the door', () => {
    const eta = new Date('2026-10-15T05:00:00Z')
    const stop = { status: 'completed', estimatedArrival: eta, completedAt: at(eta, 16) } // reached 10 min late
    expect(arrivalErrorMinutes(stop, { vehicleType: 'van' })).toBeCloseTo(10, 6)
    expect(arrivalErrorMinutes(stop, { vehicleType: 'van', isDemo: true })).toBeNull()

    const early = { status: 'completed', estimatedArrival: eta, completedAt: at(eta, -14) } // 20 min early
    const kpis = computeKpis([{ status: 'completed', vehicleType: 'van', stops: [stop, early] }], 1)
    expect(kpis.etaErrorMin).toBe(15)
    expect(kpis.etaWithin10Pct).toBe(50)
  })
})
