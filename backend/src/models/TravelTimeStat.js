import mongoose from 'mongoose'

// How real drives compared with the plan, per area (~11 km cell around a hub) and IST
// hour: the running sum of log(actual / predicted) over delivered legs
const travelTimeStatSchema = new mongoose.Schema({
  area: { type: String, required: true },
  hour: { type: Number, required: true, min: 0, max: 23 },
  samples: { type: Number, default: 0 },
  sumLogRatio: { type: Number, default: 0 }
}, { timestamps: true })

travelTimeStatSchema.index({ area: 1, hour: 1 }, { unique: true })

export default mongoose.model('TravelTimeStat', travelTimeStatSchema)
