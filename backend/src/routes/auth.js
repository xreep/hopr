import express from 'express'
import jwt from 'jsonwebtoken'
import { body, validationResult } from 'express-validator'
import User from '../models/User.js'
import { authenticate } from '../middleware/auth.js'

const router = express.Router()

const generateToken = (user) => {
  return jwt.sign(
    { id: user._id, role: user.role, tokenVersion: user.tokenVersion },
    process.env.JWT_SECRET || 'hopr-secret-key',
    { expiresIn: '7d' }
  )
}

const validateRequest = (req, res, next) => {
  const errors = validationResult(req)
  if (!errors.isEmpty()) {
    return res.status(400).json({ errors: errors.array() })
  }
  next()
}

router.post('/register', [
  body('name').trim().notEmpty().withMessage('Name is required'),
  body('email').isEmail().normalizeEmail().withMessage('Valid email is required'),
  body('password').isLength({ min: 6 }).withMessage('Password must be at least 6 characters'),
  validateRequest
], async (req, res) => {
  try {
    const { name, email, password, phone } = req.body

    const existingUser = await User.findOne({ email })
    if (existingUser) {
      return res.status(400).json({ message: 'Email already registered' })
    }

    const user = await User.create({
      name,
      email,
      password,
      role: 'driver',
      phone
    })

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
      return res.status(401).json({ message: 'Account is deactivated' })
    }

    // H10: Check if account is locked
    if (user.isLocked()) {
      console.warn(`[${new Date().toISOString()}] SECURITY ACCOUNT_LOCKED - Email: ${email} - IP: ${req.ip}`)
      return res.status(429).json({ message: 'Too many failed attempts. Please try again later.' })
    }

    const isMatch = await user.comparePassword(password)
    if (!isMatch) {
      // H10: Increment failed attempts
      await user.incrementFailedAttempts()
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

router.put('/profile', authenticate, [
  body('name').optional().trim().notEmpty(),
  body('email').optional().isEmail().normalizeEmail(),
  body('phone').optional().trim(),
  body('address').optional().trim(),
  validateRequest
], async (req, res) => {
  try {
    const updates = req.body
    delete updates.password
    delete updates.role
    delete updates.isActive

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

router.put('/password', authenticate, [
  body('currentPassword').notEmpty().withMessage('Current password is required'),
  body('newPassword').isLength({ min: 6 }).withMessage('New password must be at least 6 characters'),
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
    const user = await User.findByIdAndUpdate(
      req.user.id,
      { notifications: req.body },
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