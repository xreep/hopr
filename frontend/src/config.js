// The whole of India: the map's starting view before there is anything to fit
export const INDIA_VIEW = { center: [80.4, 22.6], zoom: 3.6 }
export const INDIA_BOUNDS = [[68.1, 6.5], [97.4, 35.7]]

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

// The selected route is highway-sign green; other routes in a batch use these hues,
// chosen to stay readable on a light street map (red is kept for failures)
export const ROUTE_GREEN = '#0B6B3A'
export const ROUTE_COLORS = ['#1F4E9C', '#6B3FA0', '#B85C00', '#0E7C86', '#A1286A', '#5B6B12', '#3D5A80', '#7A5230', '#2F7D32', '#5E6873']

// Icon names (components/icons.jsx) per vehicle type
export const VEHICLE_ICONS = { bike: 'bike', van: 'van', truck: 'bigTruck', ev_van: 'plug' }
