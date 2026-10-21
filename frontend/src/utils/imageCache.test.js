import { describe, it, expect, vi, beforeEach } from 'vitest'
import api from './api'
import { loadImage, clearImageCache } from './imageCache'

vi.mock('./api', () => ({ default: { get: vi.fn() } }))

describe('proof image cache', () => {
  beforeEach(async () => {
    clearImageCache()
    await new Promise(r => setTimeout(r)) // let the previous test's releases settle
    vi.mocked(api.get).mockReset()
    let n = 0
    URL.createObjectURL = vi.fn(() => `blob:${++n}`)
    URL.revokeObjectURL = vi.fn()
  })

  it('downloads each upload once per session', async () => {
    vi.mocked(api.get).mockResolvedValue({ data: new Blob(['x']) })
    const a = await loadImage('abc')
    const b = await loadImage('abc')
    expect(a).toBe(b)
    expect(api.get).toHaveBeenCalledTimes(1)
  })

  it('retries after a failed download instead of caching the failure', async () => {
    vi.mocked(api.get).mockRejectedValueOnce(new Error('offline')).mockResolvedValue({ data: new Blob(['x']) })
    await expect(loadImage('abc')).rejects.toThrow('offline')
    await expect(loadImage('abc')).resolves.toMatch(/^blob:/)
    expect(api.get).toHaveBeenCalledTimes(2)
  })

  it('releases everything on sign-out', async () => {
    vi.mocked(api.get).mockResolvedValue({ data: new Blob(['x']) })
    await loadImage('a')
    await loadImage('b')
    clearImageCache()
    await Promise.resolve()
    expect(URL.revokeObjectURL).toHaveBeenCalledTimes(2)
    await loadImage('a')
    expect(api.get).toHaveBeenCalledTimes(3)
  })
})
