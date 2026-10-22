import express from 'express'
import { body } from 'express-validator'
import User from '../models/User.js'
import { authenticate } from '../middleware/auth.js'
import { validateRequest, pick } from '../middleware/validate.js'
import { generateToken } from '../services/token.js'
import { protectDemoAccount } from '../middleware/demo.js'
import { demoMode, isDemoEmail } from '../services/demo.js'
import * as notify from '../services/notify.js'

const router = express.Router()

// H4: fields a user may change on their own profile
const profileFields = ['name', 'email', 'phone', 'address']
const notificationFields = ['email', 'sms', 'push', 'routeUpdates', 'maintenanceAlerts', 'weeklyReports']

router.post('/register', [
  body('name').trim().notEmpty().withMessage('Name is required'),
  body('email').isEmail().normalizeEmail().withMessage('Valid email is required'),
  body('password').isLength({ min: 6, max: 128 }).withMessage('Password must be 6-128 characters'),
  body('phone').optional({ values: 'falsy' }).trim().isLength({ max: 20 }),
  validateRequest
], async (req, res) => {
  try {
    const { name, email, password, phone } = req.body

    const existingUser = await User.findOne({ email })
    if (existingUser) {
      return res.status(400).json({ message: 'Email already registered' })
    }

    // Outside demo mode a new driver waits for a manager's approval before signing in
    const needsApproval = !demoMode()
    const user = await User.create({
      name,
      email,
      password,
      role: 'driver',
      phone,
      ...(needsApproval && { isActive: false, pendingApproval: true })
    })
    if (needsApproval) {
      notify.inBackground(notify.driverAwaitingApproval(user))
      return res.status(201).json({ pendingApproval: true, message: 'Account created. A fleet manager needs to approve it before you can sign in.' })
    }

    const token = generateToken(user)

    res.status(201).json({
      token,
      user: {
        _id: user._id,
        name: user.name,
        email: user.email,
        role: user.role,
        phone: user.phone
      }
    })
  } catch (error) {
    res.status(500).json({ message: 'Registration failed' })
  }
})

router.post('/login', [
  body('email').isEmail().normalizeEmail().withMessage('Valid email is required'),
  body('password').notEmpty().withMessage('Password is required'),
  validateRequest
], async (req, res) => {
  try {
    const { email, password } = req.body

    const user = await User.findOne({ email }).select('+password')
    if (!user) {
      // H12: Log failed login attempt
      console.warn(`[${new Date().toISOString()}] SECURITY LOGIN_FAILED - Email: ${email} - IP: ${req.ip}`)
      return res.status(401).json({ message: 'Invalid credentials' })
    }

    if (!user.isActive) {
      return res.status(401).json({ message: user.pendingApproval ? 'Your account is waiting for a fleet manager to approve it' : 'Account is deactivated' })
    }

    // Shared demo accounts have published passwords: locking them would only let one
    // visitor shut everyone else out
    const lockable = !(demoMode() && isDemoEmail(user.email))

    // H10: Check if account is locked
    if (lockable && user.isLocked()) {
      console.warn(`[${new Date().toISOString()}] SECURITY ACCOUNT_LOCKED - Email: ${email} - IP: ${req.ip}`)
      return res.status(429).json({ message: 'Too many failed attempts. Please try again later.' })
    }

    const isMatch = await user.comparePassword(password)
    if (!isMatch) {
      // H10: Increment failed attempts
      if (lockable) await user.incrementFailedAttempts()
      console.warn(`[${new Date().toISOString()}] SECURITY LOGIN_FAILED - Email: ${email} - IP: ${req.ip}`)
      return res.status(401).json({ message: 'Invalid credentials' })
    }

    // H10: Reset failed attempts on successful login
    await user.resetFailedAttempts()

    user.lastLogin = new Date()
    await user.save()

    const token = generateToken(user)

    res.json({
      token,
      user: {
        _id: user._id,
        name: user.name,
        email: user.email,
        role: user.role,
        phone: user.phone,
        address: user.address,
        notifications: user.notifications,
        createdAt: user.createdAt,
        lastLogin: user.lastLogin
      }
    })
  } catch (error) {
    // H10: Handle locked account error
    if (error.message.includes('locked')) {
      return res.status(429).json({ message: 'Too many failed attempts. Please try again later.' })
    }
    res.status(500).json({ message: 'Login failed' })
  }
})

router.get('/me', authenticate, async (req, res) => {
  try {
    const user = await User.findById(req.user.id)
    if (!user) {
      return res.status(404).json({ message: 'User not found' })
    }
    res.json({ user })
  } catch (error) {
    res.status(500).json({ message: 'Failed to fetch user' })
  }
})

const ownAccount = protectDemoAccount(req => req.user.id)

router.put('/profile', authenticate, ownAccount, [
  body('name').optional().trim().notEmpty().isLength({ max: 100 }),
  body('email').optional().isEmail().normalizeEmail(),
  body('phone').optional().trim().isLength({ max: 20 }),
  body('address').optional().trim().isLength({ max: 300 }),
  validateRequest
], async (req, res) => {
  try {
    const updates = pick(req.body, profileFields)

    if (updates.email) {
      const taken = await User.exists({ email: updates.email, _id: { $ne: req.user.id } })
      if (taken) {
        return res.status(409).json({ message: 'Email already in use' })
      }
    }

    const user = await User.findByIdAndUpdate(
      req.user.id,
      updates,
      { new: true, runValidators: true }
    )

    if (!user) {
      return res.status(404).json({ message: 'User not found' })
    }

    res.json({ user })
  } catch (error) {
    res.status(500).json({ message: 'Failed to update profile' })
  }
})

router.put('/password', authenticate, ownAccount, [
  body('currentPassword').notEmpty().withMessage('Current password is required'),
  body('newPassword').isLength({ min: 6, max: 128 }).withMessage('New password must be 6-128 characters'),
  validateRequest
], async (req, res) => {
  try {
    const { currentPassword, newPassword } = req.body

    const user = await User.findById(req.user.id).select('+password')
    if (!user) {
      return res.status(404).json({ message: 'User not found' })
    }

    const isMatch = await user.comparePassword(currentPassword)
    if (!isMatch) {
      return res.status(400).json({ message: 'Current password is incorrect' })
    }

    user.password = newPassword
    // H11: Increment token version to invalidate all existing tokens
    await user.incrementTokenVersion()

    res.json({ message: 'Password updated successfully. Please log in again.' })
  } catch (error) {
    res.status(500).json({ message: 'Failed to update password' })
  }
})

router.put('/notifications', authenticate, [
  body('email').optional().isBoolean(),
  body('sms').optional().isBoolean(),
  body('push').optional().isBoolean(),
  body('routeUpdates').optional().isBoolean(),
  body('maintenanceAlerts').optional().isBoolean(),
  body('weeklyReports').optional().isBoolean(),
  validateRequest
], async (req, res) => {
  try {
    // Merge individual flags instead of replacing the whole sub-document
    const updates = {}
    for (const [key, value] of Object.entries(pick(req.body, notificationFields))) {
      updates[`notifications.${key}`] = value
    }
    const user = await User.findByIdAndUpdate(
      req.user.id,
      { $set: updates },
      { new: true, runValidators: true }
    )

    if (!user) {
      return res.status(404).json({ message: 'User not found' })
    }

    res.json({ notifications: user.notifications })
  } catch (error) {
    res.status(500).json({ message: 'Failed to update notifications' })
  }
})

export default router