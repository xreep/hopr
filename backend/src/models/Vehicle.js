import mongoose from 'mongoose'
import { VEHICLE_TYPES, FUEL_TYPES } from '../config/fleet.js'

const vehicleSchema = new mongoose.Schema({
  vehicleId: {
    type: String,
    required: true,
    unique: true,
    uppercase: true,
    trim: true
  },
  name: {
    type: String,
    required: true,
    trim: true
  },
  type: {
    type: String,
    enum: VEHICLE_TYPES,
    required: true
  },
  fuelType: {
    type: String,
    enum: FUEL_TYPES,
    required: true
  },
  // km per unit of fuel: litre (petrol/diesel/hybrid), kg (CNG) or kWh (electric)
  mileage: {
    type: Number,
    default: 0,
    min: 0
  },
  // Payload capacity in kg
  capacity: {
    type: Number,
    required: true,
    min: 0
  },
  licensePlate: {
    type: String,
    required: true,
    unique: true,
    uppercase: true,
    trim: true
  },
  driver: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    default: null
  },
  status: {
    type: String,
    enum: ['active', 'maintenance', 'inactive'],
    default: 'active'
  },
  purchaseDate: {
    type: Date
  },
  lastMaintenance: {
    type: Date
  },
  nextMaintenance: {
    type: Date
  },
  totalDistance: {
    type: Number,
    default: 0
  },
  totalFuelConsumed: {
    type: Number,
    default: 0
  }
}, {
  timestamps: true
})

vehicleSchema.index({ status: 1 })
vehicleSchema.index({ driver: 1 })

export default mongoose.model('Vehicle', vehicleSchema)