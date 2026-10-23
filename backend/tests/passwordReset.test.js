import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { api, createUser } from './helpers.js'
import { useTestDb } from './db.js'
import User from '../src/models/User.js'
import { settled } from '../src/services/notify.js'

useTestDb()

let sent
beforeEach(() => {
  sent = []
  process.env.RESEND_API_KEY = 'test-key'
  process.env.EMAIL_FROM = 'Hopr <alerts@example.com>'
  vi.stubGlobal('fetch', vi.fn(async (url, init) => {
    sent.push({ url, ...JSON.parse(init.body) })
    return { ok: true, status: 200 }
  }))
})
afterEach(() => {
  delete process.env.RESEND_API_KEY
  delete process.env.EMAIL_FROM
  vi.unstubAllGlobals()
})

const forgot = email => api().post('/api/auth/forgot-password').send({ email })
const reset = (token, password) => api().post('/api/auth/reset-password').send({ token, password })
const tokenFrom = mail => new URL(mail.text.match(/https?:\/\/\S+/)[0]).searchParams.get('token')

describe('forgot password', () => {
  it('answers the same whether or not the account exists', async () => {
    await createUser('driver', { email: 'ravi@example.com' })
    const known = await forgot('ravi@example.com')
    const unknown = await forgot('nobody@example.com')
    await settled()
    expect(known.status).toBe(200)
    expect(unknown.status).toBe(200)
    expect(unknown.body).toEqual(known.body)
    expect(sent.map(m => m.to[0])).toEqual(['ravi@example.com'])
  })

  it('resets the password once with the emailed link and signs out everywhere', async () => {
    const { user, auth } = await createUser('driver', { email: 'pooja@example.com' })
    await forgot('pooja@example.com')
    await settled()
    expect(sent).toHaveLength(1)
    expect(sent[0].subject).toMatch(/reset/i)
    const token = tokenFrom(sent[0])
    expect(token).toMatch(/^[A-Za-z0-9_-]{40,}$/)
    // Only a hash of the token is stored
    const stored = await User.findById(user._id).select('+resetTokenHash')
    expect(stored.resetTokenHash).toBeTruthy()
    expect(stored.resetTokenHash).not.toContain(token)

    expect((await reset(token, 'short')).status).toBe(400)
    const done = await reset(token, 'a-new-long-passphrase')
    expect(done.status).toBe(200)
    // The old session is revoked, the new password works, the link is spent
    expect((await api().get('/api/auth/me').set(auth)).status).toBe(401)
    expect((await api().post('/api/auth/login').send({ email: 'pooja@example.com', password: 'a-new-long-passphrase' })).status).toBe(200)
    expect((await reset(token, 'another-long-passphrase')).status).toBe(400)
  })

  it('refuses an expired or made-up link', async () => {
    const { user } = await createUser('driver', { email: 'imran@example.com' })
    await forgot('imran@example.com')
    await settled()
    const token = tokenFrom(sent[0])
    await User.updateOne({ _id: user._id }, { resetTokenExpires: new Date(Date.now() - 1000) })
    const expired = await reset(token, 'a-new-long-passphrase')
    expect(expired.status).toBe(400)
    expect(expired.body.message).toMatch(/invalid or has expired/)
    expect((await reset('x'.repeat(43), 'a-new-long-passphrase')).status).toBe(400)
  })

  it('limits reset emails to the same address', async () => {
    await createUser('driver', { email: 'kavya@example.com' })
    for (let i = 0; i < 3; i++) expect((await forgot('kavya@example.com')).status).toBe(200)
    expect((await forgot('kavya@example.com')).status).toBe(429)
    expect((await forgot('someone.else@example.com')).status).toBe(200)
  })
})
