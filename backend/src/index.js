import 'dotenv/config'
import mongoose from 'mongoose'
import app from './app.js'

// H1: Fail fast on missing JWT_SECRET in production
if (process.env.NODE_ENV === 'production' && !process.env.JWT_SECRET) {
  console.error('FATAL: JWT_SECRET environment variable is required in production')
  process.exit(1)
}
if (!process.env.JWT_SECRET) {
  console.warn('WARNING: JWT_SECRET not set, using development fallback. Set JWT_SECRET in production!')
}

const PORT = process.env.PORT || 5000

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
  await connectDB()
  app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`)
  })
}

startServer()

export default app
