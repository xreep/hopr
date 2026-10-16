import { describe, it, expect } from 'vitest'
import request from 'supertest'
import app from '../src/app.js'

describe('app bootstrap', () => {
  it('serves the health check without starting a server', async () => {
    const res = await request(app).get('/api/health')
    expect(res.status).toBe(200)
    expect(res.body.status).toBe('ok')
  })

  it('returns JSON 404 for unknown API paths', async () => {
    const res = await request(app).get('/api/does-not-exist')
    expect(res.status).toBe(404)
    expect(res.body.message).toBe('Not found')
  })

  it('sets helmet security headers', async () => {
    const res = await request(app).get('/api/health')
    expect(res.headers['x-content-type-options']).toBe('nosniff')
  })
})
