import mongoose from 'mongoose'

const stopSchema = new mongoose.Schema({
  address: {
    type: String,
    required: true,
    trim: true
  },
  coordinates: {
    type: [Number],
    required: true,
    validate: {
      validator: function(v) {
        return v.length === 2 && 
               v[0] >= -180 && v[0] <= 180 && 
               v[1] >= -90 && v[1] <= 90
      },
      message: 'Invalid coordinates'
    }
  },
  priority: {
    type: String,
    enum: ['urgent', 'standard', 'low'],
    default: 'standard'
  },
  timeWindow: {
    type: String,
    trim: true
  },
  notes: {
    type: String,
    trim: true
  },
  status: {
    type: String,
    enum: ['pending', 'in_progress', 'completed', 'failed'],
    default: 'pending'
  },
  completedAt: {
    type: Date
  },
  issues: [{
    description: String,
    reportedAt: { type: Date, default: Date.now }
  }],
  estimatedArrival: {
    type: Date
  },
  actualArrival: {
    type: Date
  }
}, { _id: false })

const routeSchema = new mongoose.Schema({
  routeId: {
    type: String,
    required: true,
    unique: true,
    uppercase: true
  },
  name: {
    type: String,
    trim: true
  },
  stops: [stopSchema],
  vehicle: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Vehicle'
  },
  driver: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  },
  vehicleCount: {
    type: Number,
    default: 1
  },
  vehicleType: {
    type: String,
    enum: ['van', 'truck', 'bike', 'ev_van'],
    default: 'van'
  },
  status: {
    type: String,
    enum: ['planned', 'active', 'completed', 'cancelled'],
    default: 'planned'
  },
  currentStopIndex: {
    type: Number,
    default: 0
  },
  geometry: {
    type: {
      type: String,
      enum: ['LineString'],
      default: 'LineString'
    },
    coordinates: {
      type: [[Number]],
      default: []
    }
  },
  totalDistance: {
    type: Number,
    default: 0
  },
  estimatedTime: {
    type: Number,
    default: 0
  },
  actualTime: {
    type: Number,
    default: 0
  },
  fuelEstimate: {
    type: Number,
    default: 0
  },
  fuelCost: {
    type: Number,
    default: 0
  },
  fuelPrice: {
    type: Number,
    default: 1.5
  },
  trafficEnabled: {
    type: Boolean,
    default: true
  },
  optimizedStops: [{
    address: String,
    coordinates: [Number],
    priority: String,
    timeWindow: String,
    sequence: Number
  }],
  startedAt: {
    type: Date
  },
  completedAt: {
    type: Date
  },
  createdBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  }
}, {
  timestamps: true
})

routeSchema.index({ driver: 1, status: 1 })
routeSchema.index({ vehicle: 1 })
routeSchema.index({ status: 1 })
routeSchema.index({ createdAt: -1 })

export default mongoose.model('Route', routeSchema)