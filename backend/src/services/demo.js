import User from '../models/User.js'
import Vehicle from '../models/Vehicle.js'
import Route from '../models/Route.js'
import Upload from '../models/Upload.js'
import { planBatch } from './routeOptimizer.js'
import { routeDocsFromPlan } from './routePlanning.js'
import { RANCHI_HUB, RANCHI_LOCATIONS as L } from '../data/ranchiLocations.js'
import { istMinutesOfDay } from '../utils/time.js'

// Demo accounts documented in the README. Only created when missing; existing
// passwords are never overwritten.
export const DEMO_ACCOUNTS = [
  { name: 'Anita Verma', email: 'admin@hopr.com', password: 'admin123', role: 'admin', phone: '+91 90000 00001' },
  { name: 'Sanjay Mahto', email: 'manager@hopr.com', password: 'manager123', role: 'fleet_manager', phone: '+91 90000 00002' },
  { name: 'Ravi Kumar Oraon', email: 'driver@hopr.com', password: 'driver123', role: 'driver', phone: '+91 90000 00003' },
  { name: 'Pooja Kumari', email: 'pooja.driver@hopr.com', password: 'driver123', role: 'driver', phone: '+91 90000 00004' },
  { name: 'Imran Ansari', email: 'imran.driver@hopr.com', password: 'driver123', role: 'driver', phone: '+91 90000 00005' }
]

// Typical Ranchi last-mile fleet. Mileage = km per litre (km/kWh for the EV).
export const DEMO_VEHICLES = [
  { vehicleId: 'VEH-ACE01', name: 'Tata Ace Gold', type: 'van', fuelType: 'diesel', mileage: 18, capacity: 750, licensePlate: 'JH01DK4521', driverEmail: 'driver@hopr.com' },
  { vehicleId: 'VEH-SPL01', name: 'Hero Splendor+', type: 'bike', fuelType: 'petrol', mileage: 60, capacity: 25, licensePlate: 'JH01EF2208', driverEmail: 'pooja.driver@hopr.com' },
  { vehicleId: 'VEH-EV01', name: 'Tata Ace EV', type: 'ev_van', fuelType: 'electric', mileage: 7, capacity: 600, licensePlate: 'JH01EV0412', driverEmail: 'imran.driver@hopr.com' },
  { vehicleId: 'VEH-407', name: 'Tata 407 Gold', type: 'truck', fuelType: 'diesel', mileage: 9, capacity: 2500, licensePlate: 'JH01CA7781' }
]

const hhmm = minutes => {
  const m = Math.max(0, Math.min(23 * 60 + 59, Math.round(minutes)))
  return `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`
}

// Five real Ranchi deliveries with windows placed relative to the departure time
export function demoStops(departure) {
  const t0 = istMinutesOfDay(departure)
  return [
    { ...L.lalpurChowk, customerName: 'Sunita Devi', customerPhone: '+91 90000 10001', priority: 'standard', packageWeightKg: 1.5, packageSize: 'small', windowStart: hhmm(t0), windowEnd: hhmm(t0 + 90), notes: 'Pharmacy order. Hand over at the counter' },
    { ...L.morabadiMaidan, customerName: 'Neha Kumari', customerPhone: '+91 90000 10002', priority: 'urgent', packageWeightKg: 6, packageSize: 'medium', windowStart: hhmm(t0 + 10), windowEnd: hhmm(t0 + 60), notes: 'Call on arrival, gate 2' },
    { ...L.albertEkkaChowk, customerName: 'Amit Mahto', customerPhone: '+91 90000 10003', priority: 'standard', packageWeightKg: 3, packageSize: 'small', windowStart: hhmm(t0 + 30), windowEnd: hhmm(t0 + 150) },
    { ...L.ranchiJunction, customerName: 'Rohit Oraon', customerPhone: '+91 90000 10004', priority: 'standard', packageWeightKg: 4.5, packageSize: 'medium', windowStart: hhmm(t0 + 45), windowEnd: hhmm(t0 + 180), notes: 'Parcel counter, platform 1 side' },
    { ...L.harmuChowk, customerName: 'Priya Sharma', customerPhone: '+91 90000 10005', priority: 'low', packageWeightKg: 2, packageSize: 'small', windowStart: hhmm(t0 + 60), windowEnd: hhmm(t0 + 210) }
  ]
}

export async function ensureDemoAccounts() {
  const users = {}
  for (const account of DEMO_ACCOUNTS) {
    let user = await User.findOne({ email: account.email })
    if (!user) user = await User.create(account)
    users[account.email] = user
  }
  return users
}

export async function ensureDemoFleet(users) {
  const vehicles = {}
  for (const { driverEmail, ...data } of DEMO_VEHICLES) {
    let vehicle = await Vehicle.findOne({ vehicleId: data.vehicleId })
    if (!vehicle) vehicle = await Vehicle.create(data)
    const driver = driverEmail ? users[driverEmail] : null
    if (driver && !vehicle.driver) {
      await Vehicle.updateMany({ driver: driver._id, _id: { $ne: vehicle._id } }, { driver: null })
      vehicle.driver = driver._id
      await vehicle.save()
    }
    vehicles[data.vehicleId] = vehicle
  }
  return vehicles
}

// One-click demo: accounts + fleet + a fresh 5-stop Ranchi route assigned to the demo driver
export async function seedDemo({ createdBy, now = new Date() } = {}) {
  const users = await ensureDemoAccounts()
  const vehicles = await ensureDemoFleet(users)
  const driver = users['driver@hopr.com']
  const van = vehicles['VEH-ACE01']

  // Replace previous demo routes that have not started, so the demo can be replayed
  const stale = await Route.find({ isDemo: true, status: { $in: ['planned', 'cancelled', 'completed'] } }).select('_id')
  await Upload.deleteMany({ route: { $in: stale.map(r => r._id) } })
  const removed = await Route.deleteMany({ _id: { $in: stale.map(r => r._id) } })
  await Route.updateMany({ isDemo: true, status: 'active' }, { status: 'cancelled' })

  const departure = new Date(Math.ceil((now.getTime() + 5 * 60000) / 60000) * 60000)
  const plan = planBatch({
    depot: RANCHI_HUB,
    stops: demoStops(departure),
    vehicles: [van.toObject()],
    departureTime: departure,
    trafficEnabled: true
  })
  const { docs } = await routeDocsFromPlan(plan, {
    name: 'Ranchi demo · Kokar hub',
    createdBy: createdBy || users['manager@hopr.com']._id,
    assignments: [{ driver: driver._id }],
    isDemo: true
  })
  const [route] = await Route.insertMany(docs)
  return {
    route,
    accounts: DEMO_ACCOUNTS.map(({ email, role, name }) => ({ email, role, name })),
    vehicles: Object.keys(vehicles).length,
    replacedRoutes: removed.deletedCount
  }
}
