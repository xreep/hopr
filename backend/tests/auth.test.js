import { describe, it, expect } from 'vitest'
import { api, createUser } from './helpers.js'
import User from '../src/models/User.js'
import { useTestDb } from './db.js'

useTestDb()

const newUser = { name: 'Asha Toppo', email: 'asha@hopr.test', password: 'secret123' }

describe('auth', () => {
  it('registers a user (201) and returns a token', async () => {
    const res = await api().post('/api/auth/register').send(newUser)
    expect(res.status).toBe(201)
    expect(res.body.token).toBeTruthy()
    expect(res.body.user.password).toBeUndefined()
  })

  it('forces the driver role even when admin is requested', async () => {
    const res = await api().post('/api/auth/register').send({ ...newUser, role: 'admin' })
    expect(res.status).toBe(201)
    expect(res.body.user.role).toBe('driver')
    const stored = await User.findOne({ email: newUser.email })
    expect(stored.role).toBe('driver')
  })

  it('logs in with valid credentials (200)', async () => {
    await api().post('/api/auth/register').send(newUser)
    const res = await api().post('/api/auth/login').send({ email: newUser.email, password: newUser.password })
    expect(res.status).toBe(200)
    expect(res.body.token).toBeTruthy()
    expect(res.body.user.email).toBe(newUser.email)
  })

  it('returns the current user for a valid token (200)', async () => {
    const reg = await api().post('/api/auth/register').send(newUser)
    const res = await api().get('/api/auth/me').set('Authorization', `Bearer ${reg.body.token}`)
    expect(res.status).toBe(200)
    expect(res.body.user.email).toBe(newUser.email)
    expect(res.body.user.password).toBeUndefined()
  })

  it('rejects /me without a token (401)', async () => {
    const res = await api().get('/api/auth/me')
    expect(res.status).toBe(401)
  })

  it('does not count session checks (GET /me) against the strict auth limit of 20', async () => {
    const reg = await api().post('/api/auth/register').send(newUser)
    for (let i = 0; i < 25; i++) {
      const res = await api().get('/api/auth/me').set('Authorization', `Bearer ${reg.body.token}`)
      expect(res.status).toBe(200)
    }
  })

  it('locks the account on the 6th bad login', async () => {
    await api().post('/api/auth/register').send(newUser)
    for (let i = 0; i < 5; i++) {
      const res = await api().post('/api/auth/login').send({ email: newUser.email, password: 'wrong-password' })
      expect(res.status).toBe(401)
    }
    const sixth = await api().post('/api/auth/login').send({ email: newUser.email, password: 'wrong-password' })
    expect(sixth.status).toBe(429)
    // Even the correct password is refused while locked
    const correct = await api().post('/api/auth/login').send({ email: newUser.email, password: newUser.password })
    expect(correct.status).toBe(429)
  })

  it('invalidates existing tokens after a password change', async () => {
    const reg = await api().post('/api/auth/register').send(newUser)
    const auth = { Authorization: `Bearer ${reg.body.token}` }
    const change = await api().put('/api/auth/password').set(auth).send({ currentPassword: newUser.password, newPassword: 'newsecret456' })
    expect(change.status).toBe(200)
    const me = await api().get('/api/auth/me').set(auth)
    expect(me.status).toBe(401)
  })

  it('only lets profile updates touch whitelisted fields', async () => {
    const { user, auth } = await createUser('driver')
    const res = await api().put('/api/auth/profile').set(auth).send({
      name: 'Renamed', role: 'admin', tokenVersion: 99, failedAttempts: 0, lockUntil: null, isActive: false
    })
    expect(res.status).toBe(200)
    const stored = await User.findById(user._id)
    expect(stored.name).toBe('Renamed')
    expect(stored.role).toBe('driver')
    expect(stored.tokenVersion).toBe(0)
    expect(stored.isActive).toBe(true)
  })

  it('rejects a profile email that belongs to someone else with 409', async () => {
    const other = await createUser('driver')
    const { auth } = await createUser('driver')
    const res = await api().put('/api/auth/profile').set(auth).send({ email: other.user.email })
    expect(res.status).toBe(409)
  })
})
