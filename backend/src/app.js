import express from 'express'
import cors from 'cors'
import helmet from 'helmet'
import rateLimit from 'express-rate-limit'
import mongoSanitize from 'express-mongo-sanitize'
import jwt from 'jsonwebtoken'
import { jwtSecret } from './services/token.js'

import authRoutes from './routes/auth.js'
import routeRoutes from './routes/routes.js'
import vehicleRoutes from './routes/vehicles.js'
import driverRoutes from './routes/drivers.js'
import analyticsRoutes from './routes/analytics.js'
import adminRoutes from './routes/admin.js'
import mapRoutes from './routes/map.js'
import incidentRoutes from './routes/incidents.js'
import dashboardRoutes from './routes/dashboard.js'
import demoRoutes from './routes/demo.js'
import uploadRoutes from './routes/uploads.js'
import trackRoutes from './routes/track.js'
import dispatchRoutes from './routes/dispatch.js'

const app = express()

// Behind Render/Vercel proxies req.ip must come from X-Forwarded-For, otherwise
// every client shares one rate-limit bucket. Only trusted when explicitly configured
// (or in production) so local clients cannot spoof their IP.
const trustProxy = process.env.TRUST_PROXY ?? (process.env.NODE_ENV === 'production' ? '1' : '')
if (trustProxy) app.set('trust proxy', Number.isNaN(Number(trustProxy)) ? trustProxy : Number(trustProxy))

app.use(helmet({
  crossOriginResourcePolicy: { policy: 'cross-origin' }
}))
app.use(cors({
  origin: process.env.FRONTEND_URL || 'http://localhost:3000',
  credentials: true
}))
app.use(express.json({ limit: '100kb' }))
app.use(express.urlencoded({ extended: true, limit: '100kb' }))

// H3: NoSQL injection guard
app.use(mongoSanitize())

// H12: Security event logging — registered before the routers so it sees every response
app.use((req, res, next) => {
  const start = Date.now()
  res.on('finish', () => {
    const duration = Date.now() - start
    if (res.statusCode === 401 || res.statusCode === 429) {
      console.warn(`[${new Date().toISOString()}] SECURITY ${req.method} ${req.originalUrl} ${res.statusCode} - IP: ${req.ip} - Duration: ${duration}ms`)
    }
    if (req.originalUrl.startsWith('/api/admin') && ['POST', 'PUT', 'PATCH', 'DELETE'].includes(req.method)) {
      console.info(`[${new Date().toISOString()}] ADMIN_MUTATION ${req.method} ${req.originalUrl} ${res.statusCode} - User: ${req.user?.id || 'unknown'} - IP: ${req.ip}`)
    }
  })
  next()
})

// Rate limiting. Clients are keyed by verified user id when a valid token is sent
// (drivers behind one depot Wi-Fi must not share a bucket), otherwise by IP.
function clientKey(req) {
  const header = req.headers.authorization
  if (header?.startsWith('Bearer ')) {
    try {
      return `user:${jwt.verify(header.slice(7), jwtSecret()).id}`
    } catch { /* fall through to IP */ }
  }
  return `ip:${req.ip}`
}

const pathOf = req => req.originalUrl.split('?')[0]
// High-frequency endpoints get their own dedicated limits instead of the global budget
const isLocationPing = req => req.method === 'PATCH' && /^\/api\/routes\/[a-f\d]{24}\/location$/i.test(pathOf(req))
const isTracking = req => req.method === 'GET' && /^\/api\/track\//.test(pathOf(req))
const isLiveRead = req => req.method === 'GET' && /^\/api\/(dashboard|incidents|routes)(\/|$)/.test(pathOf(req))

const limiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 100,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  keyGenerator: clientKey,
  skip: req => isLocationPing(req) || isTracking(req) || isLiveRead(req),
  message: { message: 'Too many requests, please try again later' }
})
app.use('/api/', limiter)

// Live GPS pings from the driver app: every 5 s while a route is active
const locationLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 30,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  keyGenerator: clientKey,
  message: { message: 'Location updates are too frequent' }
})
// Public customer tracking page polls every 5 s
const trackingLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 30,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  message: { message: 'Too many tracking requests, please slow down' }
})
// Read-only polling of live dashboards / route status
const liveLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 60,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  keyGenerator: clientKey,
  message: { message: 'Too many requests, please try again later' }
})
app.use('/api/', (req, res, next) => {
  if (isLocationPing(req)) return locationLimiter(req, res, next)
  if (isTracking(req)) return trackingLimiter(req, res, next)
  if (isLiveRead(req)) return liveLimiter(req, res, next)
  next()
})

// H2: Strict rate limit on auth endpoints
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  message: { message: 'Too many authentication attempts, please try again later' }
})
// Brute-force protection applies to credential endpoints only, not the session check (GET /me)
app.use('/api/auth', (req, res, next) => (req.method === 'GET' ? next() : authLimiter(req, res, next)))

app.use('/api/auth', authRoutes)
app.use('/api/routes', routeRoutes)
app.use('/api/vehicles', vehicleRoutes)
app.use('/api/drivers', driverRoutes)
app.use('/api/analytics', analyticsRoutes)
app.use('/api/admin', adminRoutes)
app.use('/api/map', mapRoutes)
app.use('/api/incidents', incidentRoutes)
app.use('/api/dashboard', dashboardRoutes)
app.use('/api/demo', demoRoutes)
app.use('/api/uploads', uploadRoutes)
app.use('/api/track', trackRoutes)
app.use('/api/dispatch', dispatchRoutes)

app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() })
})

app.use('/api', (req, res) => {
  res.status(404).json({ message: 'Not found' })
})

// H8: Production error handler - no stack traces in production
// eslint-disable-next-line no-unused-vars
app.use((err, req, res, next) => {
  console.error(`[${new Date().toISOString()}] ERROR ${req.method} ${req.originalUrl}:`, err.message, err.stack)

  const isDev = process.env.NODE_ENV === 'development'
  const status = err.status || err.statusCode || 500

  res.status(status).json({
    message: isDev || status < 500 ? err.message : 'Internal server error',
    ...(isDev && { stack: err.stack })
  })
})

export default app
