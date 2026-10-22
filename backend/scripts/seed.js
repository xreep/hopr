// Creates the demo accounts, a fleet in five Indian cities and a fresh demo route in each.
// Usage: npm run seed --workspace=backend   (uses MONGODB_URI from backend/.env)
import 'dotenv/config'
import mongoose from 'mongoose'
import { seedDemo, DEMO_ACCOUNTS } from '../src/services/demo.js'

const uri = process.env.MONGODB_URI || 'mongodb://localhost:27017/hopr'
await mongoose.connect(uri)
try {
  const result = await seedDemo()
  console.log(`Demo ready: ${result.routes.length} routes (${result.routes.map(r => r.name).join(', ')}), ${result.vehicles} vehicles.`)
  console.log('Accounts (email / password):')
  for (const a of DEMO_ACCOUNTS) console.log(`  ${a.role.padEnd(13)} ${a.email} / ${a.password}`)
} finally {
  await mongoose.disconnect()
}
