import { describe, it, expect, vi, beforeEach } from 'vitest'

const store = { items: [] }
vi.mock('./store', () => ({
  outboxAdd: vi.fn(async item => { store.items.push({ ...item, id: store.items.length + 1 }) }),
  outboxRemove: vi.fn(async id => { store.items = store.items.filter(i => i.id !== id) }),
  outboxList: vi.fn(async userId => store.items.filter(i => i.userId === userId))
}))
const api = { patch: vi.fn(), post: vi.fn() }
vi.mock('../utils/api', () => ({ default: api }))

const { queueUpdate, flushOutbox, isNetworkError } = await import('./outbox')
const httpError = status => Object.assign(new Error(`HTTP ${status}`), { response: { status } })

describe('outbox', () => {
  beforeEach(() => {
    store.items = []
    api.patch.mockReset()
    api.post.mockReset()
  })

  it('sends queued updates in order with the time they happened', async () => {
    await queueUpdate('u1', { kind: 'start', routeId: 'r1', at: '2026-10-22T04:30:00.000Z' })
    await queueUpdate('u1', { kind: 'status', routeId: 'r1', stopId: 's1', at: '2026-10-22T04:45:00.000Z', body: { status: 'failed', reason: 'Address not found' } })
    api.patch.mockResolvedValue({ data: {} })
    expect(await flushOutbox('u1')).toEqual({ sent: 2, dropped: 0, remaining: 0 })
    expect(api.patch.mock.calls.map(c => c[0])).toEqual(['/routes/r1/start', '/routes/r1/stops/s1/status'])
    expect(api.patch.mock.calls[1][1]).toEqual({ status: 'failed', reason: 'Address not found', at: '2026-10-22T04:45:00.000Z' })
    expect(store.items).toEqual([])
  })

  it('stops at the first update that needs signal again, keeping it and everything after', async () => {
    await queueUpdate('u1', { kind: 'start', routeId: 'r1', at: 'a' })
    await queueUpdate('u1', { kind: 'start', routeId: 'r2', at: 'b' })
    api.patch.mockRejectedValueOnce(new Error('Network Error'))
    expect(await flushOutbox('u1')).toEqual({ sent: 0, dropped: 0, remaining: 2 })
    expect(store.items).toHaveLength(2)
  })

  it('drops updates the server will never accept, such as a stop already delivered', async () => {
    await queueUpdate('u1', { kind: 'start', routeId: 'r1', at: 'a' })
    await queueUpdate('u1', { kind: 'start', routeId: 'r2', at: 'b' })
    api.patch.mockRejectedValueOnce(httpError(409)).mockResolvedValueOnce({ data: {} })
    expect(await flushOutbox('u1')).toEqual({ sent: 1, dropped: 1, remaining: 0 })
  })

  it('keeps another driver’s updates for when they sign in', async () => {
    await queueUpdate('u2', { kind: 'start', routeId: 'r9', at: 'a' })
    expect(await flushOutbox('u1')).toEqual({ sent: 0, dropped: 0, remaining: 0 })
    expect(store.items).toHaveLength(1)
  })

  it('drops updates older than a week without sending them', async () => {
    await queueUpdate('u1', { kind: 'start', routeId: 'r1', at: new Date(Date.now() - 8 * 86400000).toISOString() })
    expect(await flushOutbox('u1')).toEqual({ sent: 0, dropped: 1, remaining: 0 })
    expect(api.patch).not.toHaveBeenCalled()
    expect(store.items).toEqual([])
  })

  it('tells a lost connection apart from a refusal', () => {
    expect(isNetworkError(new Error('Network Error'))).toBe(true)
    expect(isNetworkError(httpError(503))).toBe(true)
    expect(isNetworkError(httpError(500))).toBe(false)
    expect(isNetworkError(httpError(409))).toBe(false)
  })
})
