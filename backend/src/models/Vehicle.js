import mongoose from 'mongoose'

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
    enum: ['van', 'truck', 'bike', 'ev_van'],
    required: true
  },
  fuelType: {
    type: String,
    enum: ['diesel', 'petrol', 'electric', 'cng', 'hybrid'],
    required: true
  },
  mileage: {
    type: Number,
    default: 0,
    min: 0
  },
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