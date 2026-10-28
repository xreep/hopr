import { describe, it, expect } from 'vitest'
import request from 'supertest'
import app from '../src/app.js'
import { useTestDb } from './db.js'

useTestDb()

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

  // Last in the file: it uses up the ordinary rate limit for this address
  it('never rate limits the health check, which the host and the uptime monitor poll constantly', async () => {
    // Render checks /api/health every few seconds; a 429 there marks the server failed
    for (let i = 0; i < 150; i++) {
      const res = await request(app).get('/api/health')
      expect(res.status).toBe(200)
    }
    // Ordinary API calls from the same address are still limited (100 per 15 minutes)
    const statuses = []
    for (let i = 0; i < 101; i++) statuses.push((await request(app).get('/api/vehicles')).status)
    expect(statuses.at(-1)).toBe(429)
  })
})
