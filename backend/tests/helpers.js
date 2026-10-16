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
