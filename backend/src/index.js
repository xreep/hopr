import 'dotenv/config'
import mongoose from 'mongoose'
import app from './app.js'
import { startSimulationClock } from './services/simulation.js'
import { initMonitoring } from './services/monitoring.js'
import { syncRetention } from './models/Upload.js'
import TravelTimeStat from './models/TravelTimeStat.js'

// H1: Fail fast on missing JWT_SECRET in production
if (process.env.NODE_ENV === 'production' && !process.env.JWT_SECRET) {
  console.error('FATAL: JWT_SECRET environment variable is required in production')
  process.exit(1)
}
if (!process.env.JWT_SECRET) {
  console.warn('WARNING: JWT_SECRET not set, using development fallback. Set JWT_SECRET in production!')
}

// Render sets PORT. Locally 5001, because macOS AirPlay Receiver occupies 5000.
const PORT = process.env.PORT || 5001

const connectDB = async () => {
  try {
    const conn = await mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/hopr')
    console.log(`MongoDB connected: ${conn.connection.host}`)
  } catch (error) {
    console.error('Database connection error:', error.message)
    process.exit(1)
  }
}

const startServer = async () => {
  if (await initMonitoring()) console.log('Error tracking on')
  await connectDB()
  await syncRetention() // proof images expire after PROOF_RETENTION_DAYS
  await TravelTimeStat.syncIndexes() // learned travel times are keyed by kind of day too
  startSimulationClock() // demo morning drives, if any are running
  app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`)
  })
}

startServer()

export default app
