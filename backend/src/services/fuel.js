import { ENERGY_UNITS, EMISSION_FACTORS, defaultFuelPrices } from '../config/fleet.js'

const round = (n, d = 2) => Math.round(n * 10 ** d) / 10 ** d

// Energy, cost (INR) and CO2 for driving `distanceKm` with a vehicle whose
// `mileage` is km per unit of its fuel (L, kg CNG, or kWh).
export function estimateFuel(distanceKm, { fuelType, mileage }, prices = defaultFuelPrices()) {
  if (!(mileage > 0)) {
    throw new Error(`Vehicle mileage must be positive (got ${mileage})`)
  }
  const quantity = distanceKm / mileage
  const unitPrice = prices[fuelType] ?? 0
  return {
    fuelType,
    unit: ENERGY_UNITS[fuelType] ?? 'L',
    quantity: round(quantity, 2),
    cost: round(quantity * unitPrice, 2),
    unitPrice,
    co2Kg: round(quantity * (EMISSION_FACTORS[fuelType] ?? 0), 2),
    costPerKm: distanceKm > 0 ? round((quantity * unitPrice) / distanceKm, 2) : 0
  }
}
