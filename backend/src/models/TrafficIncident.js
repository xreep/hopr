import mongoose from 'mongoose'
import { isValidCoordinate } from '../utils/geo.js'

// A congestion zone or road closure reported by a fleet manager (or simulated).
// Active incidents feed the optimizer and flag affected routes for recalculation.
const trafficIncidentSchema = new mongoose.Schema({
  type: { type: String, enum: ['congestion', 'closure'], required: true },
  label: { type: String, trim: true, maxlength: 120, required: true },
  coordinates: {
    type: [Number],
    required: true,
    validate: { validator: isValidCoordinate, message: 'Invalid coordinates' }
  },
  radiusKm: { type: Number, min: 0.1, max: 5, default: 0.5 },
  // Travel-time multiplier inside a congestion zone
  severity: { type: Number, min: 1, max: 4, default: 1.8 },
  active: { type: Boolean, default: true },
  expiresAt: Date,
  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' }
}, { timestamps: true })

trafficIncidentSchema.statics.findActive = function findActive(now = new Date()) {
  return this.find({ active: true, $or: [{ expiresAt: null }, { expiresAt: { $exists: false } }, { expiresAt: { $gt: now } }] })
}

export default mongoose.model('TrafficIncident', trafficIncidentSchema)
