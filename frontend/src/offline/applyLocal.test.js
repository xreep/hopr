import { describe, it, expect } from 'vitest'
import { applyLocal, applyPending } from './applyLocal'

const route = () => ({
  _id: 'r1',
  status: 'planned',
  stops: [
    { _id: 's2', sequence: 2, status: 'pending', estimatedArrival: '2026-10-22T05:00:00.000Z' },
    { _id: 's1', sequence: 1, status: 'pending', estimatedArrival: '2026-10-22T04:40:00.000Z' }
  ]
})
const at = '2026-10-22T04:30:00.000Z'

describe('updates applied on the phone', () => {
  it('starts the route and moves to the first stop', () => {
    const started = applyLocal(route(), { kind: 'start', routeId: 'r1', at })
    expect(started.status).toBe('active')
    expect(started.startedAt).toBe(at)
    expect(started.stops.find(s => s._id === 's1').status).toBe('in_progress')
  })

  it('marks deliveries done in order, waiting to send, and finishes the route', () => {
    const items = [
      { kind: 'complete', routeId: 'r1', stopId: 's1', at, body: { note: 'At the gate' } },
      { kind: 'status', routeId: 'r1', stopId: 's2', at, body: { status: 'failed', reason: 'Address not found' } }
    ]
    const afterFirst = applyLocal(route(), items[0])
    expect(afterFirst.status).toBe('active')
    expect(afterFirst.stops.find(s => s._id === 's1')).toMatchObject({ status: 'completed', completedAt: at, pendingSync: true, proof: { note: 'At the gate' } })
    expect(afterFirst.stops.find(s => s._id === 's2').status).toBe('in_progress')

    const [done] = applyPending([route()], items)
    expect(done.status).toBe('completed')
    expect(done.stops.find(s => s._id === 's2')).toMatchObject({ status: 'failed', failureReason: 'Address not found' })
  })

  it('shifts the remaining ETAs for a reported delay', () => {
    const late = applyLocal(route(), { kind: 'issue', routeId: 'r1', stopId: 's1', at, body: { type: 'delay', delayMinutes: 15 } })
    expect(late.stops.find(s => s._id === 's1').estimatedArrival).toBe('2026-10-22T04:55:00.000Z')
  })

  it('leaves other routes, and stops the server already closed, untouched', () => {
    const r = route()
    expect(applyLocal(r, { kind: 'start', routeId: 'other', at })).toBe(r)
    const closed = { ...r, status: 'active', stops: r.stops.map(s => ({ ...s, status: 'completed' })) }
    expect(applyLocal(closed, { kind: 'complete', routeId: 'r1', stopId: 's1', at, body: {} })).toBe(closed)
  })
})
