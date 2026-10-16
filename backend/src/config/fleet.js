// Operating assumptions for Ranchi, Jharkhand. Every number here is a documented,
// realistic default; deployments can override prices via environment variables.

export const MAX_STOPS_PER_ROUTE = 30 // nearest-neighbour + 2-opt is tuned for <= 30 stops
export const MAX_VEHICLES_PER_BATCH = 10
export const MAX_STOPS_PER_BATCH = MAX_STOPS_PER_ROUTE * MAX_VEHICLES_PER_BATCH

// Hopr's hub (warehouse) in Kokar, Ranchi
export { RANCHI_HUB as DEFAULT_DEPOT } from '../data/ranchiLocations.js'

// Straight-line km x circuity = road km when no road network (Mapbox) is available.
// 1.35 is typical for Indian urban grids.
export const ROAD_CIRCUITY = 1.35

// Free-flow city speeds (km/h), service time per stop (min), capacity (kg),
// and mileage in km per unit of energy (litre, kg of CNG, or kWh).
export const VEHICLE_PROFILES = Object.freeze({
  bike: { label: 'Motorbike', fuelType: 'petrol', mileage: 45, capacityKg: 25, speedKmh: 28, serviceMin: 4 },
  van: { label: 'Delivery Van', fuelType: 'diesel', mileage: 16, capacityKg: 750, speedKmh: 24, serviceMin: 6 },
  truck: { label: 'Light Truck', fuelType: 'diesel', mileage: 9, capacityKg: 2500, speedKmh: 20, serviceMin: 10 },
  ev_van: { label: 'Electric Van', fuelType: 'electric', mileage: 7, capacityKg: 600, speedKmh: 24, serviceMin: 6 }
})

export const VEHICLE_TYPES = Object.keys(VEHICLE_PROFILES)
export const FUEL_TYPES = ['diesel', 'petrol', 'electric', 'cng', 'hybrid']

export const ENERGY_UNITS = Object.freeze({ petrol: 'L', diesel: 'L', hybrid: 'L', cng: 'kg', electric: 'kWh' })

// Approximate Ranchi retail prices (INR). Electricity is the depot charging tariff.
export function defaultFuelPrices() {
  const num = (key, fallback) => {
    const v = Number(process.env[key])
    return Number.isFinite(v) && v > 0 ? v : fallback
  }
  return {
    petrol: num('FUEL_PRICE_PETROL', 97.9),
    diesel: num('FUEL_PRICE_DIESEL', 92.6),
    cng: num('FUEL_PRICE_CNG', 91.5),
    hybrid: num('FUEL_PRICE_PETROL', 97.9),
    electric: num('FUEL_PRICE_ELECTRICITY', 10)
  }
}

// Tailpipe / grid CO2 per unit (kg). Electricity uses India's grid emission factor (CEA).
export const EMISSION_FACTORS = Object.freeze({
  petrol: 2.31,
  hybrid: 2.31,
  diesel: 2.68,
  cng: 2.75,
  electric: 0.71
})

// Optimizer objective = operating cost in INR:
//   driver time + fuel + missed-window penalty + priority waiting cost
export const DRIVER_COST_PER_MIN = 3 // ~INR 180/hour driver wage + overhead
export const LATE_PENALTY_PER_MIN = 30 // SLA cost of arriving after a delivery window closes
// INR per minute a stop waits from route start, by priority (pulls urgent stops forward)
export const PRIORITY_WAIT_COST = Object.freeze({ urgent: 1.5, standard: 0.15, low: 0 })
export const PRIORITIES = Object.keys(PRIORITY_WAIT_COST)
export const OPTIMIZER_TIME_BUDGET_MS = 3000
export const ARRIVING_RADIUS_M = 500
export const STALE_LOCATION_SEC = 60
