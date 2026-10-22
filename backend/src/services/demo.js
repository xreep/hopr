import User from '../models/User.js'
import Vehicle from '../models/Vehicle.js'
import Route from '../models/Route.js'
import Upload from '../models/Upload.js'
import { planBatch } from './routeOptimizer.js'
import { routeDocsFromPlan } from './routePlanning.js'
import { DEMO_CITIES } from '../data/indiaCities.js'
import { istMinutesOfDay, istDateAt } from '../utils/time.js'

// Demo accounts documented in the README. Only created when missing; existing
// passwords are never overwritten.
export const DEMO_ACCOUNTS = [
  { name: 'Anita Verma', email: 'admin@hopr.com', password: 'admin123', role: 'admin', phone: '+91 90000 00001' },
  { name: 'Sanjay Mahto', email: 'manager@hopr.com', password: 'manager123', role: 'fleet_manager', phone: '+91 90000 00002' },
  { name: 'Ravi Kumar Oraon', email: 'driver@hopr.com', password: 'driver123', role: 'driver', phone: '+91 90000 00003' },
  { name: 'Pooja Kumari', email: 'pooja.driver@hopr.com', password: 'driver123', role: 'driver', phone: '+91 90000 00004' },
  { name: 'Imran Ansari', email: 'imran.driver@hopr.com', password: 'driver123', role: 'driver', phone: '+91 90000 00005' },
  { name: 'Kavya Reddy', email: 'kavya.driver@hopr.com', password: 'driver123', role: 'driver', phone: '+91 90000 00006' },
  { name: 'Sourav Das', email: 'sourav.driver@hopr.com', password: 'driver123', role: 'driver', phone: '+91 90000 00007' }
]

const hubOf = key => DEMO_CITIES.find(c => c.key === key).hub

// One local driver and vehicle per city, based at that city's hub, with state number
// plates. Mileage = km per litre (km/kWh for the EV).
export const DEMO_VEHICLES = [
  { vehicleId: 'VEH-ACE01', name: 'Tata Ace Gold', type: 'van', fuelType: 'diesel', mileage: 18, capacity: 750, licensePlate: 'JH01DK4521', city: 'ranchi', driverEmail: 'driver@hopr.com' },
  { vehicleId: 'VEH-407', name: 'Tata 407 Gold', type: 'truck', fuelType: 'diesel', mileage: 9, capacity: 2500, licensePlate: 'JH01CA7781', city: 'ranchi' },
  { vehicleId: 'VEH-EV01', name: 'Tata Ace EV', type: 'ev_van', fuelType: 'electric', mileage: 7, capacity: 600, licensePlate: 'DL1LAB4410', city: 'delhi', driverEmail: 'pooja.driver@hopr.com' },
  { vehicleId: 'VEH-JTO01', name: 'Mahindra Jeeto', type: 'van', fuelType: 'diesel', mileage: 22, capacity: 700, licensePlate: 'MH02FX3307', city: 'mumbai', driverEmail: 'imran.driver@hopr.com' },
  { vehicleId: 'VEH-ACE02', name: 'Tata Ace Gold', type: 'van', fuelType: 'diesel', mileage: 18, capacity: 750, licensePlate: 'KA05MN8812', city: 'bengaluru', driverEmail: 'kavya.driver@hopr.com' },
  { vehicleId: 'VEH-SPL01', name: 'Hero Splendor+', type: 'bike', fuelType: 'petrol', mileage: 60, capacity: 25, licensePlate: 'WB02AK5096', city: 'kolkata', driverEmail: 'sourav.driver@hopr.com' }
]

// Customers per city (names and notes for the five demo deliveries)
const CUSTOMERS = {
  delhi: [['Aditi Malhotra', 'Office reception, 2nd floor'], ['Rahul Khanna', 'Call on arrival'], ['Simran Kaur', null], ['Vikram Sethi', 'Leave with the guard if closed'], ['Meera Bhatia', null]],
  mumbai: [['Rohan Desai', 'Shop counter'], ['Priya Iyer', 'Building B, flat 1204'], ['Farhan Shaikh', null], ['Neha Kulkarni', 'Call on arrival'], ['Aakash Patil', null]],
  bengaluru: [['Ananya Rao', 'Gate 3'], ['Karthik Gowda', null], ['Divya Menon', 'Call on arrival'], ['Suresh Naidu', null], ['Lakshmi Prasad', 'Pharmacy order']],
  kolkata: [['Arijit Sen', null], ['Moumita Ghosh', 'Office lobby'], ['Debashis Roy', 'Call on arrival'], ['Tanushree Bose', null], ['Sayan Mukherjee', null]],
  ranchi: [['Sunita Devi', 'Pharmacy order. Hand over at the counter'], ['Neha Kumari', 'Call on arrival, gate 2'], ['Amit Mahto', null], ['Rohit Oraon', 'Parcel counter, platform 1 side'], ['Priya Sharma', null]]
}

const hhmm = minutes => {
  const m = Math.max(0, Math.min(23 * 60 + 59, Math.round(minutes)))
  return `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`
}

// The last demo window closes this long after departure
const DEMO_WINDOW_SPAN_MIN = 210

// Five real deliveries in a city, with windows placed relative to the departure time.
// The Kolkata route runs on a motorbike, so its parcels stay light.
export function demoStops(departure, cityKey = 'ranchi') {
  const t0 = istMinutesOfDay(departure)
  const city = DEMO_CITIES.find(c => c.key === cityKey)
  const bike = cityKey === 'kolkata'
  const plan = [
    { priority: 'standard', kg: bike ? 3 : 1.5, size: 'small', from: 0, to: 90 },
    { priority: 'urgent', kg: bike ? 4 : 6, size: 'medium', from: 10, to: 60 },
    { priority: 'standard', kg: bike ? 2 : 3, size: 'small', from: 30, to: 150 },
    { priority: 'standard', kg: bike ? 5 : 4.5, size: 'medium', from: 45, to: 180 },
    { priority: 'low', kg: 2, size: 'small', from: 60, to: 210 }
  ]
  return city.stops.map((stop, i) => {
    const [customerName, notes] = CUSTOMERS[cityKey][i]
    const p = plan[i]
    return {
      address: stop.address,
      coordinates: stop.coordinates,
      customerName,
      customerPhone: `+91 90000 1${String(DEMO_CITIES.indexOf(city)).padStart(2, '0')}${i + 1}`,
      priority: p.priority,
      packageWeightKg: p.kg,
      packageSize: p.size,
      windowStart: hhmm(t0 + p.from),
      windowEnd: hhmm(t0 + p.to),
      ...(notes && { notes })
    }
  })
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
  for (const { driverEmail, city, ...data } of DEMO_VEHICLES) {
    const base = hubOf(city)
    let vehicle = await Vehicle.findOne({ vehicleId: data.vehicleId })
    if (!vehicle) vehicle = await Vehicle.create({ ...data, base })
    else if (!vehicle.base?.coordinates?.length) {
      vehicle.base = base // older demo data had no home hubs
      await vehicle.save()
    }
    const driver = driverEmail ? users[driverEmail] : null
    // Loading the demo restores its pairings, so each city's driver drives that city's vehicle
    if (driver && String(vehicle.driver || '') !== String(driver._id)) {
      await Vehicle.updateMany({ driver: driver._id, _id: { $ne: vehicle._id } }, { driver: null })
      vehicle.driver = driver._id
      await vehicle.save()
    }
    vehicles[data.vehicleId] = vehicle
  }
  return vehicles
}

// One-click demo: accounts, a fleet in five cities and a fresh five-stop route in each.
// Ravi's Ranchi route is assigned so the driver app has work; the others wait for
// auto-dispatch, which pairs each with the driver based in that city.
export async function seedDemo({ createdBy, now = new Date() } = {}) {
  const users = await ensureDemoAccounts()
  const vehicles = await ensureDemoFleet(users)
  const vehicleFor = key => vehicles[DEMO_VEHICLES.find(v => v.city === key && v.driverEmail).vehicleId]

  // Replace previous demo routes that have not started, so the demo can be replayed
  const stale = await Route.find({ isDemo: true, status: { $in: ['planned', 'cancelled', 'completed'] } }).select('_id')
  await Upload.deleteMany({ route: { $in: stale.map(r => r._id) } })
  const removed = await Route.deleteMany({ _id: { $in: stale.map(r => r._id) } })
  await Route.updateMany({ isDemo: true, status: 'active' }, { status: 'cancelled' })

  // Leave in 5 minutes, unless the last delivery window (start + 210 min) would run past
  // midnight: then schedule the demo for 10:00 IST the next morning, as a dispatcher would
  let departure = new Date(Math.ceil((now.getTime() + 5 * 60000) / 60000) * 60000)
  if (istMinutesOfDay(departure) + DEMO_WINDOW_SPAN_MIN > 23 * 60 + 59) {
    departure = istDateAt(new Date(departure.getTime() + 24 * 3600000), '10:00')
  }
  const owner = createdBy || users['manager@hopr.com']._id
  const routes = []
  for (const city of DEMO_CITIES) {
    const plan = planBatch({
      depot: city.hub,
      stops: demoStops(departure, city.key),
      vehicles: [vehicleFor(city.key).toObject()],
      departureTime: departure,
      trafficEnabled: true
    })
    const { docs } = await routeDocsFromPlan(plan, {
      name: `${city.city} morning run`,
      createdBy: owner,
      assignments: city.key === 'ranchi' ? [{ driver: users['driver@hopr.com']._id }] : [],
      isDemo: true
    })
    // Waiting routes keep only a planned vehicle type; auto-dispatch picks the vehicle
    if (city.key !== 'ranchi') docs[0].vehicle = undefined
    routes.push(...(await Route.insertMany(docs)))
  }
  return {
    route: routes.find(r => r.name.startsWith('Ranchi')),
    routes,
    accounts: DEMO_ACCOUNTS.map(({ email, role, name }) => ({ email, role, name })),
    vehicles: Object.keys(vehicles).length,
    replacedRoutes: removed.deletedCount
  }
}
