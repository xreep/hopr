export const MAPBOX_TOKEN = import.meta.env.VITE_MAPBOX_TOKEN || ''
export const RANCHI_CENTRE = [85.3096, 23.3441]
export const DEFAULT_DEPOT = {
  name: 'Hopr Hub, Kokar',
  address: 'Kokar, Ranchi, Jharkhand 834001',
  coordinates: [85.3521, 23.3756]
}

// Mirrors backend/src/config/fleet.js (labels and defaults shown in the UI)
export const VEHICLE_TYPES = [
  { id: 'bike', name: 'Motorbike', fuelType: 'petrol', mileage: 45, unit: 'km/L', capacity: 25 },
  { id: 'van', name: 'Delivery Van', fuelType: 'diesel', mileage: 16, unit: 'km/L', capacity: 750 },
  { id: 'truck', name: 'Light Truck', fuelType: 'diesel', mileage: 9, unit: 'km/L', capacity: 2500 },
  { id: 'ev_van', name: 'Electric Van', fuelType: 'electric', mileage: 7, unit: 'km/kWh', capacity: 600 }
]
export const vehicleTypeLabel = id => VEHICLE_TYPES.find(v => v.id === id)?.name || id

export const FUEL_UNITS = { petrol: 'km/L', diesel: 'km/L', hybrid: 'km/L', cng: 'km/kg', electric: 'km/kWh' }

export const PRIORITY_OPTIONS = [
  { value: 'urgent', label: 'Urgent' },
  { value: 'standard', label: 'Standard' },
  { value: 'low', label: 'Low' }
]

export const MAX_STOPS_PER_ROUTE = 30

// The selected route is always volt; other routes in a batch use these muted hues
export const VOLT = '#D4FF3F'
export const ROUTE_COLORS = ['#7AA2FF', '#B39DFF', '#F5B544', '#5EEAD4', '#FF9AA2', '#9FB4D9', '#E2A8FF', '#86EFAC', '#FDBA74', '#94A3B8']

// Icon names (components/icons.jsx) per vehicle type
export const VEHICLE_ICONS = { bike: 'bike', van: 'van', truck: 'bigTruck', ev_van: 'plug' }
