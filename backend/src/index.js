import 'dotenv/config'
import express from 'express'
import mongoose from 'mongoose'
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

// H1: Fail fast on missing JWT_SECRET in production
if (process.env.NODE_ENV === 'production' && !process.env.JWT_SECRET) {
  console.error('FATAL: JWT_SECRET environment variable is required in production')
  process.exit(1)
}
if (!process.env.JWT_SECRET) {
  console.warn('WARNING: JWT_SECRET not set, using development fallback. Set JWT_SECRET in production!')
}

const app = express()
const PORT = process.env.PORT || 5000

app.use(helmet({
  crossOriginResourcePolicy: { policy: 'cross-origin' }
}))
app.use(cors({
  origin: process.env.FRONTEND_URL || 'http://localhost:3000',
  credentials: true
}))
app.use(express.json())
app.use(express.urlencoded({ extended: true }))

// H3: NoSQL injection guard
app.use(mongoSanitize())

const limiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 100,
  message: { message: 'Too many requests, please try again later' }
})
app.use('/api/', limiter)

// H2: Strict rate limit on auth endpoints
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
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

app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() })
})

// H8: Production error handler - no stack traces in production
app.use((err, req, res, next) => {
  // Log full error server-side
  console.error(`[${new Date().toISOString()}] ERROR ${req.method} ${req.path}:`, err.message, err.stack)
  
  const isDev = process.env.NODE_ENV === 'development'
  const status = err.status || 500
  
  res.status(status).json({
    message: isDev ? err.message : 'Internal server error',
    ...(isDev && { stack: err.stack })
  })
})

// H12: Security event logging middleware
app.use((req, res, next) => {
  const start = Date.now()
  res.on('finish', () => {
    const duration = Date.now() - start
    // Log 401s and 429s for security monitoring
    if (res.statusCode === 401 || res.statusCode === 429) {
      console.warn(`[${new Date().toISOString()}] SECURITY ${req.method} ${req.path} ${res.statusCode} - IP: ${req.ip} - Duration: ${duration}ms`)
    }
    // Log admin mutations
    if (req.path.startsWith('/api/admin') && ['POST', 'PUT', 'PATCH', 'DELETE'].includes(req.method)) {
      console.info(`[${new Date().toISOString()}] ADMIN_MUTATION ${req.method} ${req.path} - User: ${req.user?.id || 'unknown'} - IP: ${req.ip}`)
    }
  })
  next()
})

const connectDB = async () => {
  try {
    const conn = await mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/hopr')
    console.log(`MongoDB connected: ${conn.connection.host}`)
  } catch (error) {
    console.error('Database connection error:', error)
    process.exit(1)
  }
}

const startServer = async () => {
  await connectDB()
  app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`)
  })
}

startServer()

export default app