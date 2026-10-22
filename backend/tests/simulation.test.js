import { describe, it, expect } from 'vitest'
import { api, createUser, createRoute } from './helpers.js'
import { useTestDb } from './db.js'
import Route from '../src/models/Route.js'
import Vehicle from '../src/models/Vehicle.js'
import { simulationPlan, simulatedState, advanceSimulations, SIM_SPEEDUP, SIM_PROOF_NOTE } from '../src/services/simulation.js'

useTestDb()

// A straight 6 km road east from the hub with stops at 2 km and 5 km
const line = [[85.0, 23.0], [85.0587, 23.0]]
const stopAt = (km, sequence) => ({ sequence, status: 'pending', coordinates: [85.0 + (0.0587 * km) / 6, 23.0] })
const straightRoute = () => ({
  stops: [stopAt(5, 2), stopAt(2, 1)],
  geometry: { coordinates: line },
  vehicleType: 'van',
  trafficEnabled: false
})

describe('demo drive timeline', () => {
  it('drives to each stop in sequence at the vehicle\'s speed and waits there for the service time', () => {
    const plan = simulationPlan(straightRoute(), new Date('2026-10-15T04:30:00Z'))
    expect(plan.speedKmh).toBe(24)
    expect(plan.stops.map(s => Math.round(s.alongKm * 10) / 10)).toEqual([2, 5])
    expect(plan.stops[0].arriveMin).toBeCloseTo(5, 1) // 2 km at 24 km/h
    expect(plan.stops[1].arriveMin).toBeCloseTo(5 + 6 + 7.5, 1) // + 6 min at the door + 3 km

    expect(simulatedState(plan, 2.5)).toMatchObject({ delivered: 0, moving: true })
    expect(simulatedState(plan, 2.5).alongKm).toBeCloseTo(1, 1)
    expect(simulatedState(plan, 7)).toMatchObject({ delivered: 0, moving: false }) // at stop 1
    expect(simulatedState(plan, 12)).toMatchObject({ delivered: 1, moving: true })
    expect(simulatedState(plan, 60)).toMatchObject({ delivered: 2, finished: true })
  })
})

describe('demo morning API', () => {
  it('dispatches the waiting demo routes, drives all five and finishes them with simulated proof', async () => {
    const manager = await createUser('fleet_manager')
    await api().post('/api/demo/seed').set(manager.auth)

    const res = await api().post('/api/demo/simulate').set(manager.auth)
    expect(res.status).toBe(200)
    expect(res.body.speedup).toBe(SIM_SPEEDUP)
    expect(res.body.started.map(s => s.driver).sort()).toEqual(['Imran Ansari', 'Kavya Reddy', 'Pooja Kumari', 'Ravi Kumar Oraon', 'Sourav Das'])

    const dash = await api().get('/api/dashboard').set(manager.auth)
    expect(dash.body.demo).toEqual({ waiting: 0, running: 5, speedup: SIM_SPEEDUP })

    // ETAs follow the simulated clock: the first stop is minutes away, not an hour
    const delhi = await Route.findOne({ name: 'New Delhi morning run' })
    const startedAt = delhi.simulation.startedAt
    const firstEta = delhi.stops.find(s => s.sequence === 1).estimatedArrival
    expect(firstEta - startedAt).toBeLessThan(5 * 60000)
    expect(delhi.driverLocation.coordinates).toEqual(delhi.geometry.coordinates[0])

    // Customer tracking counts down on the same clock and says it is a demo
    const token = delhi.stops.find(s => s.sequence === 2).trackingToken
    await advanceSimulations(new Date(startedAt.getTime() + 20000))
    const track = await api().get(`/api/track/${token}`)
    expect(track.body.status).toMatch(/on_the_way|arriving/)
    expect(track.body.demo).toEqual({ speedup: SIM_SPEEDUP })
    expect(track.body.eta.minutes).toBeLessThan(15)

    // Part way: the van has moved and some stops are delivered
    await advanceSimulations(new Date(startedAt.getTime() + 60000))
    const moving = await Route.findById(delhi._id)
    expect(moving.driverLocation.coordinates).not.toEqual(delhi.geometry.coordinates[0])
    expect(moving.actualDistance).toBeGreaterThan(0)

    // Long after: every demo route is done, the drive has ended, the vehicle has the distance
    await advanceSimulations(new Date(startedAt.getTime() + 60 * 60000))
    const done = await Route.find({ isDemo: true })
    expect(done.every(r => r.status === 'completed' && !r.simulation?.startedAt)).toBe(true)
    expect(done.every(r => r.stops.every(s => s.status === 'completed' && s.proof.note === SIM_PROOF_NOTE))).toBe(true)
    const vehicle = await Vehicle.findById(done.find(r => r.name === 'New Delhi morning run').vehicle)
    expect(vehicle.totalDistance).toBeGreaterThan(0)
    expect((await api().get('/api/dashboard').set(manager.auth)).body.demo.running).toBe(0)
  })

  it('never simulates real routes, and stops on request', async () => {
    const manager = await createUser('fleet_manager')
    const driver = await createUser('driver')
    const real = await createRoute(manager.auth, { assignments: [{ driver: driver.user._id }] })

    expect((await api().post('/api/demo/simulate').set(manager.auth)).status).toBe(409)
    expect((await Route.findById(real._id)).status).toBe('planned')

    await api().post('/api/demo/seed').set(manager.auth)
    expect((await api().post('/api/demo/simulate').set(manager.auth)).status).toBe(200)
    expect((await Route.findById(real._id)).status).toBe('planned')

    const stop = await api().delete('/api/demo/simulate').set(manager.auth)
    expect(stop.body.stopped).toBe(5)
    expect(await advanceSimulations(new Date(Date.now() + 3600000))).toBe(0)
  })

  it('is for managers only', async () => {
    const driver = await createUser('driver')
    expect((await api().post('/api/demo/simulate').set(driver.auth)).status).toBe(403)
    expect((await api().delete('/api/demo/simulate').set(driver.auth)).status).toBe(403)
  })
})
