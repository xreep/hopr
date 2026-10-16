import express from 'express'
import cors from 'cors'
import helmet from 'helmet'
import rateLimit from 'express-rate-limit'
import mongoSanitize from 'express-mongo-sanitize'

import authRoutes from './routes/auth.js'
import routeRoutes from './routes/routes.js'
import vehicleRoutes from './routes/vehicles.js'
import driverRoutes from './routes/drivers.js'
import analyticsRoutes from './routes/analytics.js'
import adminRoutes from './routes/admin.js'
import mapRoutes from './routes/map.js'
import incidentRoutes from './routes/incidents.js'

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

const limiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 100,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  message: { message: 'Too many requests, please try again later' }
})
app.use('/api/', limiter)

// H2: Strict rate limit on auth endpoints
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  message: { message: 'Too many authentication attempts, please try again later' }
})
app.use('/api/auth', authLimiter)

app.use('/api/auth', authRoutes)
app.use('/api/routes', routeRoutes)
app.use('/api/vehicles', vehicleRoutes)
app.use('/api/drivers', driverRoutes)
app.use('/api/analytics', analyticsRoutes)
app.use('/api/admin', adminRoutes)
app.use('/api/map', mapRoutes)
app.use('/api/incidents', incidentRoutes)

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
