import mongoose from 'mongoose'
import bcrypt from 'bcryptjs'

const userSchema = new mongoose.Schema({
  name: {
    type: String,
    required: true,
    trim: true
  },
  email: {
    type: String,
    required: true,
    unique: true,
    lowercase: true,
    trim: true
  },
  password: {
    type: String,
    required: true,
    minlength: 6,
    select: false
  },
  role: {
    type: String,
    enum: ['admin', 'fleet_manager', 'driver'],
    default: 'driver'
  },
  phone: {
    type: String,
    trim: true
  },
  address: {
    type: String,
    trim: true
  },
  isActive: {
    type: Boolean,
    default: true
  },
  lastLogin: {
    type: Date
  },
  // Last GPS fix reported from the driver app (used by auto-dispatch proximity scoring)
  lastLocation: {
    coordinates: { type: [Number], default: undefined },
    updatedAt: Date
  },
  // H10: Per-account brute-force lockout
  failedAttempts: {
    type: Number,
    default: 0
  },
  lockUntil: {
    type: Date
  },
  // H11: Token version for invalidation on password change
  tokenVersion: {
    type: Number,
    default: 0
  },
  notifications: {
    email: { type: Boolean, default: true },
    sms: { type: Boolean, default: false },
    push: { type: Boolean, default: true },
    routeUpdates: { type: Boolean, default: true },
    maintenanceAlerts: { type: Boolean, default: true },
    weeklyReports: { type: Boolean, default: false }
  }
}, {
  timestamps: true
})

userSchema.pre('save', async function(next) {
  if (!this.isModified('password')) return next()
  this.password = await bcrypt.hash(this.password, 12)
  next()
})

// H10: Check if account is locked
userSchema.methods.isLocked = function() {
  return this.lockUntil && this.lockUntil > Date.now()
}

// H10: Increment failed attempts and lock if needed
userSchema.methods.incrementFailedAttempts = async function() {
  this.failedAttempts += 1
  if (this.failedAttempts >= 5) {
    this.lockUntil = new Date(Date.now() + 15 * 60 * 1000) // 15 minutes
  }
  await this.save()
}

// H10: Reset failed attempts on successful login
userSchema.methods.resetFailedAttempts = async function() {
  if (this.failedAttempts > 0 || this.lockUntil) {
    this.failedAttempts = 0
    this.lockUntil = null
    await this.save()
  }
}

// H11: Increment token version (invalidates all existing tokens)
userSchema.methods.incrementTokenVersion = async function() {
  this.tokenVersion += 1
  await this.save()
}

userSchema.methods.comparePassword = async function(candidatePassword) {
  // H10: If account is locked, reject immediately
  if (this.isLocked()) {
    throw new Error('Account temporarily locked due to failed login attempts')
  }
  return bcrypt.compare(candidatePassword, this.password)
}

userSchema.methods.toJSON = function() {
  const obj = this.toObject()
  delete obj.password
  return obj
}

export default mongoose.model('User', userSchema)