import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { api, createUser } from './helpers.js'
import { useTestDb } from './db.js'
import ContactMessage from '../src/models/ContactMessage.js'
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

// A fresh sender address per test, so the per-address limit does not carry over
let n = 0
const message = (extra = {}) => ({
  name: 'Meera Iyer', email: `meera.${n}@example.com`, company: 'Kirana Express', fleetSize: '6-20', topic: 'demo',
  message: 'We run 12 bikes from two dark stores in Pune and want to try route planning.', ...extra
})
const contact = body => api().post('/api/contact').send(body)

describe('contact form', () => {
  beforeEach(() => { n += 1 })

  it('stores a message and emails the admins', async () => {
    await createUser('admin', { email: 'owner@example.com' })
    const res = await contact(message())
    expect(res.status).toBe(201)
    await settled()
    const saved = await ContactMessage.find()
    expect(saved).toHaveLength(1)
    expect(saved[0]).toMatchObject({ name: 'Meera Iyer', topic: 'demo', fleetSize: '6-20', handled: false })
    expect(sent.map(m => m.to[0])).toEqual(['owner@example.com'])
    expect(sent[0].subject).toMatch(/demo/i)
    expect(sent[0].reply_to).toBe(saved[0].email)
  })

  it('rejects incomplete messages and quietly drops bots', async () => {
    expect((await contact(message({ email: 'not-an-email' }))).status).toBe(400)
    expect((await contact(message({ message: '' }))).status).toBe(400)
    expect((await contact(message({ topic: 'spam' }))).status).toBe(400)
    // The hidden "website" field is only ever filled in by bots
    expect((await contact(message({ website: 'http://spam.example' }))).status).toBe(201)
    expect(await ContactMessage.countDocuments()).toBe(0)
  })

  it('shows messages to admins only, who can mark them handled', async () => {
    const admin = await createUser('admin')
    const manager = await createUser('fleet_manager')
    await contact(message())
    expect((await api().get('/api/admin/messages').set(manager.auth)).status).toBe(403)
    const list = await api().get('/api/admin/messages').set(admin.auth)
    expect(list.status).toBe(200)
    expect(list.body.messages).toHaveLength(1)
    const id = list.body.messages[0]._id
    const done = await api().patch(`/api/admin/messages/${id}`).set(admin.auth).send({ handled: true })
    expect(done.status).toBe(200)
    expect(done.body.message.handled).toBe(true)
  })

  it('limits how often one sender can write', async () => {
    for (let i = 0; i < 5; i++) expect((await contact(message())).status).toBe(201)
    expect((await contact(message())).status).toBe(429)
  })
})
