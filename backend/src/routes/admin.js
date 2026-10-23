import express from 'express'
import { body, query } from 'express-validator'
import User from '../models/User.js'
import ContactMessage from '../models/ContactMessage.js'
import { authenticate, authorize } from '../middleware/auth.js'
import { protectDemoAccount } from '../middleware/demo.js'
import { validateRequest, pick, escapeRegex, objectIdParam } from '../middleware/validate.js'

const router = express.Router()
router.param('id', objectIdParam)
router.param('messageId', objectIdParam)

const ROLES = ['admin', 'fleet_manager', 'driver']

// H4: Whitelist allowed fields for user creation/update (admin only)
const userCreateFields = ['name', 'email', 'password', 'role', 'phone']
const userUpdateFields = ['name', 'email', 'role', 'phone', 'isActive']

router.get('/users', authenticate, authorize('admin'), [
  query('page').optional().isInt({ min: 1 }),
  query('limit').optional().isInt({ min: 1, max: 100 }),
  query('role').optional().isIn(ROLES),
  query('search').optional().trim().isLength({ max: 100 }),
  validateRequest
], async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1
    const limit = parseInt(req.query.limit) || 50
    const skip = (page - 1) * limit

    const filter = {}
    if (req.query.role) filter.role = req.query.role
    if (req.query.search) {
      const search = escapeRegex(req.query.search)
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
      pagination: { page, limit, total, pages: Math.ceil(total / limit) }
    })
  } catch (error) {
    res.status(500).json({ message: 'Failed to fetch users' })
  }
})

router.post('/users', authenticate, authorize('admin'), [
  body('name').trim().notEmpty().isLength({ max: 100 }).withMessage('Name is required'),
  body('email').isEmail().normalizeEmail().withMessage('Valid email is required'),
  body('password').isLength({ min: 6, max: 128 }).withMessage('Password must be 6-128 characters'),
  body('role').isIn(ROLES).withMessage('Invalid role'),
  body('phone').optional().trim().isLength({ max: 20 }),
  validateRequest
], async (req, res) => {
  try {
    const allowedData = pick(req.body, userCreateFields)
    const existing = await User.findOne({ email: allowedData.email })
    if (existing) {
      return res.status(409).json({ message: 'Email already registered' })
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

router.put('/users/:id', authenticate, authorize('admin'), protectDemoAccount(), [
  body('name').optional().trim().notEmpty().isLength({ max: 100 }),
  body('email').optional().isEmail().normalizeEmail(),
  body('role').optional().isIn(ROLES),
  body('phone').optional().trim().isLength({ max: 20 }),
  body('isActive').optional().isBoolean(),
  body('password').optional({ values: 'falsy' }).isLength({ min: 6, max: 128 }).withMessage('Password must be 6-128 characters'),
  validateRequest
], async (req, res) => {
  try {
    const isSelf = req.params.id === req.user.id
    const allowedData = pick(req.body, userUpdateFields)

    if (isSelf && (allowedData.isActive === false || (allowedData.role && allowedData.role !== 'admin'))) {
      return res.status(400).json({ message: 'You cannot deactivate or demote your own account' })
    }

    const user = await User.findById(req.params.id).select('+password')
    if (!user) {
      return res.status(404).json({ message: 'User not found' })
    }

    if (allowedData.email && allowedData.email !== user.email) {
      const taken = await User.exists({ email: allowedData.email, _id: { $ne: user._id } })
      if (taken) {
        return res.status(409).json({ message: 'Email already in use' })
      }
    }

    Object.assign(user, allowedData)
    if (req.body.password) {
      // Admin password reset: hashed by the pre-save hook, and all existing sessions are revoked (H11)
      user.password = req.body.password
      user.tokenVersion += 1
    }
    await user.save()

    res.json({ user })
  } catch (error) {
    res.status(500).json({ message: 'Failed to update user' })
  }
})

router.patch('/users/:id/status', authenticate, authorize('admin'), protectDemoAccount(), [
  body('isActive').isBoolean().withMessage('isActive must be boolean'),
  validateRequest
], async (req, res) => {
  try {
    if (req.params.id === req.user.id) {
      return res.status(400).json({ message: 'You cannot change your own status' })
    }

    const user = await User.findByIdAndUpdate(
      req.params.id,
      { isActive: req.body.isActive, ...(req.body.isActive && { pendingApproval: false }) },
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

router.delete('/users/:id', authenticate, authorize('admin'), protectDemoAccount(), async (req, res) => {
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

// Messages from the website's contact form, newest first
router.get('/messages', authenticate, authorize('admin'), async (req, res) => {
  try {
    const messages = await ContactMessage.find().sort({ createdAt: -1 }).limit(100).lean()
    res.json({ messages })
  } catch (error) {
    res.status(500).json({ message: 'Failed to fetch messages' })
  }
})

router.patch('/messages/:messageId', authenticate, authorize('admin'), [
  body('handled').isBoolean().withMessage('handled must be boolean'),
  validateRequest
], async (req, res) => {
  try {
    const message = await ContactMessage.findByIdAndUpdate(req.params.messageId, { handled: req.body.handled }, { new: true })
    if (!message) return res.status(404).json({ message: 'Message not found' })
    res.json({ message })
  } catch (error) {
    res.status(500).json({ message: 'Failed to update message' })
  }
})

export default router
