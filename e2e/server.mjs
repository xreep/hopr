// API for the end-to-end tests: a throwaway in-memory MongoDB with the demo data loaded.
// Outside services are off (NODE_ENV=test), so the tests never depend on the internet.
import { MongoMemoryServer } from 'mongodb-memory-server'
import mongoose from 'mongoose'

const PORT = Number(process.env.E2E_API_PORT || 5055)

process.env.NODE_ENV = 'test'
process.env.DEMO_MODE = 'true'
process.env.JWT_SECRET = 'e2e-only-secret-not-used-anywhere-else'
process.env.FRONTEND_URL = `http://localhost:${process.env.E2E_WEB_PORT || 4180}`
delete process.env.MAPBOX_TOKEN

const mongo = await MongoMemoryServer.create()
await mongoose.connect(mongo.getUri())

const { default: app } = await import('../backend/src/app.js')
const { seedDemo } = await import('../backend/src/services/demo.js')
await seedDemo()

const server = app.listen(PORT, () => console.log(`E2E API on ${PORT}`))
const stop = async () => {
  server.close()
  await mongoose.disconnect()
  await mongo.stop()
  process.exit(0)
}
process.on('SIGINT', stop)
process.on('SIGTERM', stop)
