import express from 'express'
import { body, query, validationResult } from 'express-validator'
import User from '../models/User.js'
import { authenticate, authorize } from '../middleware/auth.js'

const router = express.Router()

const validateRequest = (req, res, next) => {
  const errors = validationResult(req)
  if (!errors.isEmpty()) {
    return res.status(400).json({ errors: errors.array() })
  }
  next()
}

// H4: Whitelist allowed fields for user creation/update (admin only)
const userCreateFields = ['name', 'email', 'password', 'role', 'phone']
const userUpdateFields = ['name', 'email', 'role', 'phone', 'isActive']

function pick(obj, allowed) {
  const picked = {}
  for (const key of allowed) {
    if (obj[key] !== undefined) picked[key] = obj[key]
  }
  return picked
}

router.get('/users', authenticate, authorize('admin'), [
  query('page').optional().isInt({ min: 1 }),
  query('limit').optional().isInt({ min: 1, max: 100 }),
  query('role').optional().isIn(['admin', 'fleet_manager', 'driver']),
  query('search').optional().trim(),
  validateRequest
], async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1
    const limit = parseInt(req.query.limit) || 20
    const skip = (page - 1) * limit

    const filter = {}
    if (req.query.role) filter.role = req.query.role
    if (req.query.search) {
      const search = req.query.search
      filter.$or = [
        { name: { $regex: search, $options: 'i' } },
        { email: { $regex: search, $options: 'i' } }
      ]
    }

    const [users, total] = await Promise.all([
      User.find(filter)
        .select('-password')
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit),
      User.countDocuments(filter)
    ])

    res.json({
      users,
      pagination: {
        page,
        limit,
        total,
        pages: Math.ceil(total / limit)
      }
    })
  } catch (error) {
    res.status(500).json({ message: 'Failed to fetch users' })
  }
})

router.post('/users', authenticate, authorize('admin'), [
  body('name').trim().notEmpty().withMessage('Name is required'),
  body('email').isEmail().normalizeEmail().withMessage('Valid email is required'),
  body('password').isLength({ min: 6 }).withMessage('Password must be at least 6 characters'),
  body('role').isIn(['admin', 'fleet_manager', 'driver']).withMessage('Invalid role'),
  body('phone').optional().trim(),
  validateRequest
], async (req, res) => {
  try {
    const allowedData = pick(req.body, userCreateFields)
    const existing = await User.findOne({ email: allowedData.email })
    if (existing) {
      return res.status(400).json({ message: 'Email already registered' })
    }

    const user = await User.create(allowedData)

    res.status(201).json({ user })
  } catch (error) {
    res.status(500).json({ message: 'Failed to create user' })
  }
})

router.get('/users/:id', authenticate, authorize('admin'), async (req, res) => {
  try {
    const user = await User.findById(req.params.id).select('-password')
    if (!user) {
      return res.status(404).json({ message: 'User not found' })
    }
    res.json({ user })
  } catch (error) {
    res.status(500).json({ message: 'Failed to fetch user' })
  }
})

router.put('/users/:id', authenticate, authorize('admin'), [
  body('name').optional().trim().notEmpty(),
  body('email').optional().isEmail().normalizeEmail(),
  body('role').optional().isIn(['admin', 'fleet_manager', 'driver']),
  body('phone').optional().trim(),
  body('isActive').optional().isBoolean(),
  validateRequest
], async (req, res) => {
  try {
    const allowedData = pick(req.body, userUpdateFields)
    delete allowedData.password

    const user = await User.findByIdAndUpdate(
      req.params.id,
      allowedData,
      { new: true, runValidators: true }
    ).select('-password')

    if (!user) {
      return res.status(404).json({ message: 'User not found' })
    }

    res.json({ user })
  } catch (error) {
    res.status(500).json({ message: 'Failed to update user' })
  }
})

router.patch('/users/:id/status', authenticate, authorize('admin'), [
  body('isActive').isBoolean().withMessage('isActive must be boolean'),
  validateRequest
], async (req, res) => {
  try {
    const { isActive } = req.body
    const user = await User.findByIdAndUpdate(
      req.params.id,
      { isActive },
      { new: true }
    ).select('-password')

    if (!user) {
      return res.status(404).json({ message: 'User not found' })
    }

    res.json({ user })
  } catch (error) {
    res.status(500).json({ message: 'Failed to update user status' })
  }
})

router.delete('/users/:id', authenticate, authorize('admin'), async (req, res) => {
  try {
    if (req.params.id === req.user.id) {
      return res.status(400).json({ message: 'Cannot delete yourself' })
    }

    const user = await User.findByIdAndDelete(req.params.id)
    if (!user) {
      return res.status(404).json({ message: 'User not found' })
    }

    res.json({ message: 'User deleted' })
  } catch (error) {
    res.status(500).json({ message: 'Failed to delete user' })
  }
})

export default router