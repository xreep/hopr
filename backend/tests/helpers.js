import request from 'supertest'
import app from '../src/app.js'
import User from '../src/models/User.js'
import { generateToken } from '../src/services/token.js'

let counter = 0

export async function createUser(role = 'driver', overrides = {}) {
  counter += 1
  const user = await User.create({
    name: overrides.name || `Test ${role} ${counter}`,
    email: overrides.email || `${role}${counter}@hopr.test`,
    password: overrides.password || 'password123',
    role,
    ...overrides
  })
  return { user, token: generateToken(user), auth: { Authorization: `Bearer ${generateToken(user)}` } }
}

export const api = () => request(app)
export { app }

// A planning payload: 5 real Ranchi deliveries departing Thursday 15 Oct 2026 10:00 IST
import { RANCHI_HUB, RANCHI_LOCATIONS as L } from '../src/data/ranchiLocations.js'
export const DEPART = '2026-10-15T04:30:00.000Z'
export const fiveStops = () => [
  { ...L.harmuChowk, customerName: 'Priya Sharma', packageWeightKg: 4 },
  { ...L.ranchiJunction, customerName: 'Rohit Oraon', packageWeightKg: 2, priority: 'urgent' },
  { ...L.morabadiMaidan, customerName: 'Neha Kumari', packageWeightKg: 6, windowStart: '10:30', windowEnd: '12:00' },
  { ...L.albertEkkaChowk, customerName: 'Amit Mahto', packageWeightKg: 3 },
  { ...L.lalpurChowk, customerName: 'Sunita Devi', packageWeightKg: 1.5 }
]
export const planBody = (extra = {}) => ({ stops: fiveStops(), depot: RANCHI_HUB, departureTime: DEPART, vehicleType: 'van', ...extra })

export async function createRoute(managerAuth, extra = {}) {
  const res = await request(app).post('/api/routes').set(managerAuth).send(planBody(extra))
  if (res.status !== 201) throw new Error(`createRoute failed: ${res.status} ${JSON.stringify(res.body)}`)
  return res.body.routes[0]
}
