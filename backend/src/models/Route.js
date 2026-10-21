import mongoose from 'mongoose'
import { isValidCoordinate } from '../utils/geo.js'
import { isHHMM } from '../utils/time.js'
import { VEHICLE_TYPES, PRIORITIES } from '../config/fleet.js'

const coordinateField = (required = true) => ({
  type: [Number],
  required,
  default: undefined,
  validate: {
    validator: v => v === undefined || isValidCoordinate(v),
    message: 'Invalid coordinates'
  }
})

const hhmmField = {
  type: String,
  trim: true,
  validate: { validator: v => !v || isHHMM(v), message: 'Time must be HH:MM' }
}

const proofSchema = new mongoose.Schema({
  photo: { type: mongoose.Schema.Types.ObjectId, ref: 'Upload' },
  signature: { type: mongoose.Schema.Types.ObjectId, ref: 'Upload' },
  note: { type: String, trim: true, maxlength: 500 },
  completedAt: Date,
  completedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' }
}, { _id: false })

const issueSchema = new mongoose.Schema({
  type: { type: String, enum: ['issue', 'delay'], default: 'issue' },
  description: { type: String, trim: true, maxlength: 500 },
  delayMinutes: { type: Number, min: 0, max: 600 },
  reportedAt: { type: Date, default: Date.now },
  reportedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' }
}, { _id: false })

const stopSchema = new mongoose.Schema({
  deliveryId: { type: String, required: true },
  address: { type: String, required: true, trim: true, maxlength: 300 },
  coordinates: coordinateField(),
  customerName: { type: String, trim: true, maxlength: 100 },
  customerPhone: { type: String, trim: true, maxlength: 20 },
  priority: { type: String, enum: PRIORITIES, default: 'standard' },
  windowStart: hhmmField,
  windowEnd: hhmmField,
  packageWeightKg: { type: Number, min: 0, default: 0 },
  packageSize: { type: String, enum: ['small', 'medium', 'large'], default: 'small' },
  notes: { type: String, trim: true, maxlength: 500 },
  sequence: { type: Number, min: 1 },
  status: {
    type: String,
    enum: ['pending', 'in_progress', 'completed', 'failed'],
    default: 'pending'
  },
  // ETA as currently forecast, and the ETA promised when the route was planned
  estimatedArrival: Date,
  plannedArrival: Date,
  windowStatus: { type: String, enum: ['none', 'on_time', 'early', 'late'], default: 'none' },
  lateByMin: { type: Number, default: 0 },
  legDistanceKm: Number,
  legMinutes: Number,
  completedAt: Date,
  failedAt: Date,
  failureReason: { type: String, trim: true, maxlength: 300 },
  proof: proofSchema,
  issues: [issueSchema],
  // Unguessable capability for the public customer tracking page
  trackingToken: { type: String, index: true }
})

const violationSchema = new mongoose.Schema({
  sequence: Number,
  address: String,
  eta: Date,
  windowEnd: String,
  lateByMin: Number,
  message: String
}, { _id: false })

const routeSchema = new mongoose.Schema({
  routeId: { type: String, required: true, unique: true, uppercase: true },
  batchId: { type: String, uppercase: true, index: true },
  name: { type: String, trim: true, maxlength: 120 },
  stops: {
    type: [stopSchema],
    validate: { validator: v => v.length >= 1 && v.length <= 30, message: 'A route needs 1-30 stops' }
  },
  depot: {
    name: String,
    address: String,
    coordinates: coordinateField(false)
  },
  vehicle: { type: mongoose.Schema.Types.ObjectId, ref: 'Vehicle' },
  driver: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  assignedAt: Date,
  vehicleType: { type: String, enum: VEHICLE_TYPES, default: 'van' },
  status: {
    type: String,
    enum: ['planned', 'active', 'completed', 'cancelled'],
    default: 'planned'
  },
  currentStopIndex: { type: Number, default: 0 },
  plannedStart: Date,
  startedAt: Date,
  completedAt: Date,
  returnToDepot: { type: Boolean, default: false },
  trafficEnabled: { type: Boolean, default: true },
  trafficImpactFactor: { type: Number, default: 1 },
  trafficLevel: { type: String, enum: ['light', 'moderate', 'heavy'], default: 'light' },
  geometry: {
    type: { type: String, enum: ['LineString'], default: 'LineString' },
    coordinates: { type: [[Number]], default: [] }
  },
  geometrySource: { type: String, enum: ['mapbox', 'estimated'], default: 'estimated' },
  roadDistanceKm: Number,
  // Planned figures
  totalDistance: { type: Number, default: 0 },
  estimatedTime: { type: Number, default: 0 },
  fuelType: String,
  fuelUnit: String,
  fuelEstimate: { type: Number, default: 0 },
  fuelPrice: Number,
  fuelCost: { type: Number, default: 0 },
  co2Kg: { type: Number, default: 0 },
  loadKg: { type: Number, default: 0 },
  capacityKg: Number,
  violations: [violationSchema],
  savings: {
    distanceKm: Number,
    fuelCost: Number,
    minutes: Number
  },
  alternatives: [mongoose.Schema.Types.Mixed],
  // Actuals (from the driver app)
  actualTime: { type: Number, default: 0 },
  actualDistance: { type: Number, default: 0 },
  driverLocation: {
    coordinates: coordinateField(false),
    accuracy: Number,
    heading: Number,
    speed: Number,
    updatedAt: Date
  },
  needsRecalculation: { type: Boolean, default: false },
  recalculations: [{
    at: Date,
    reason: String,
    previousFinish: Date,
    newFinish: Date,
    _id: false
  }],
  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  isDemo: { type: Boolean, default: false }
}, {
  timestamps: true
})

routeSchema.index({ driver: 1, status: 1 })
routeSchema.index({ vehicle: 1 })
routeSchema.index({ status: 1 })
routeSchema.index({ createdAt: -1 })

routeSchema.methods.refreshProgress = function refreshProgress() {
  const next = this.stops.findIndex(s => s.status === 'pending' || s.status === 'in_progress')
  this.currentStopIndex = next === -1 ? Math.max(0, this.stops.length - 1) : next
  const allDone = this.stops.length > 0 && this.stops.every(s => s.status === 'completed' || s.status === 'failed')
  if (allDone && this.status !== 'completed') {
    this.status = 'completed'
    this.completedAt = new Date()
    if (this.startedAt) this.actualTime = Math.round((this.completedAt - this.startedAt) / 60000)
  }
  return this
}

export default mongoose.model('Route', routeSchema)
