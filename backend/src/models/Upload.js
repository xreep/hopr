import mongoose from 'mongoose'

// Proof-of-delivery images. Stored in MongoDB (not on local disk) because the
// free Render instance has an ephemeral filesystem that is wiped on restart.
const uploadSchema = new mongoose.Schema({
  kind: { type: String, enum: ['photo', 'signature'], required: true },
  contentType: { type: String, enum: ['image/jpeg', 'image/png', 'image/webp'], required: true },
  size: { type: Number, required: true },
  data: { type: Buffer, required: true, select: false },
  route: { type: mongoose.Schema.Types.ObjectId, ref: 'Route', required: true, index: true },
  stopId: { type: mongoose.Schema.Types.ObjectId, required: true },
  uploadedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true }
}, { timestamps: true })

// Retention: MongoDB deletes images itself once they are PROOF_RETENTION_DAYS old
// (default 90; 0 keeps them forever), so the free 512 MB database never fills up.
// The delivery record keeps its time, driver and note; only the image goes.
export const retentionDays = () => {
  const days = Number(process.env.PROOF_RETENTION_DAYS ?? 90)
  return Number.isFinite(days) && days > 0 ? days : 0
}
export const RETENTION_INDEX = 'proof_retention'
if (retentionDays()) {
  uploadSchema.index({ createdAt: 1 }, { name: RETENTION_INDEX, expireAfterSeconds: retentionDays() * 86400 })
}

// The index keeps the lifetime it was created with: bring it in line with the setting
export async function syncRetention(connection = mongoose.connection) {
  const days = retentionDays()
  if (!days) return null
  try {
    await connection.db.command({ collMod: 'uploads', index: { name: RETENTION_INDEX, expireAfterSeconds: days * 86400 } })
  } catch { /* collection or index not created yet: Mongoose creates it with the current setting */ }
  return days
}

export default mongoose.model('Upload', uploadSchema)
