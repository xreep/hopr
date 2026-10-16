export const MAPBOX_TOKEN = import.meta.env.VITE_MAPBOX_TOKEN || ''
export const RANCHI_CENTRE = [85.3096, 23.3441]
export const DEFAULT_DEPOT = {
  name: 'Hopr Hub, Kokar',
  address: 'Kokar, Ranchi, Jharkhand 834001',
  coordinates: [85.3521, 23.3756]
}

// Mirrors backend/src/config/fleet.js (labels and defaults shown in the UI)
export const VEHICLE_TYPES = [
  { id: 'bike', name: 'Motorbike', fuelType: 'petrol', mileage: 45, unit: 'km/L', capacity: 25, icon: '🏍️' },
  { id: 'van', name: 'Delivery Van', fuelType: 'diesel', mileage: 16, unit: 'km/L', capacity: 750, icon: '🚐' },
  { id: 'truck', name: 'Light Truck', fuelType: 'diesel', mileage: 9, unit: 'km/L', capacity: 2500, icon: '🚛' },
  { id: 'ev_van', name: 'Electric Van', fuelType: 'electric', mileage: 7, unit: 'km/kWh', capacity: 600, icon: '🔋' }
]
export const vehicleTypeLabel = id => VEHICLE_TYPES.find(v => v.id === id)?.name || id

export const FUEL_UNITS = { petrol: 'km/L', diesel: 'km/L', hybrid: 'km/L', cng: 'km/kg', electric: 'km/kWh' }

export const PRIORITY_OPTIONS = [
  { value: 'urgent', label: 'Urgent' },
  { value: 'standard', label: 'Standard' },
  { value: 'low', label: 'Low' }
]

export const MAX_STOPS_PER_ROUTE = 30

export const ROUTE_COLORS = ['#2563eb', '#10b981', '#f59e0b', '#8b5cf6', '#ef4444', '#06b6d4', '#ec4899', '#84cc16', '#f97316', '#64748b']
