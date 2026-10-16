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

export default mongoose.model('Upload', uploadSchema)
