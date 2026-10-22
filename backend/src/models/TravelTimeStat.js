import mongoose from 'mongoose'

// How real drives compared with the plan, per area (~11 km cell around a hub), kind of
// day (Mon-Sat, Sunday, or all days together) and IST hour: the running sum of
// log(actual / predicted) over delivered legs
export const DAY_TYPES = ['weekday', 'sunday', 'all']
const travelTimeStatSchema = new mongoose.Schema({
  area: { type: String, required: true },
  dayType: { type: String, enum: DAY_TYPES, default: 'all' },
  hour: { type: Number, required: true, min: 0, max: 23 },
  samples: { type: Number, default: 0 },
  sumLogRatio: { type: Number, default: 0 }
}, { timestamps: true })

travelTimeStatSchema.index({ area: 1, dayType: 1, hour: 1 }, { unique: true })

export default mongoose.model('TravelTimeStat', travelTimeStatSchema)
