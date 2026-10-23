import mongoose from 'mongoose'

export const CONTACT_TOPICS = ['demo', 'question', 'support', 'data_request']
export const FLEET_SIZES = ['1-5', '6-20', '21-100', '100+']

// A message sent from the public website's contact form. Kept for a year, then deleted.
const contactMessageSchema = new mongoose.Schema({
  name: { type: String, required: true, trim: true, maxlength: 100 },
  email: { type: String, required: true, trim: true, lowercase: true, maxlength: 200 },
  company: { type: String, trim: true, maxlength: 120 },
  fleetSize: { type: String, enum: FLEET_SIZES },
  topic: { type: String, enum: CONTACT_TOPICS, required: true },
  message: { type: String, required: true, trim: true, maxlength: 4000 },
  handled: { type: Boolean, default: false }
}, { timestamps: true })

contactMessageSchema.index({ createdAt: 1 }, { expireAfterSeconds: 365 * 86400 })

export default mongoose.model('ContactMessage', contactMessageSchema)
