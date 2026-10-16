import express from 'express'
import { authenticate, authorize } from '../middleware/auth.js'
import { seedDemo } from '../services/demo.js'

const router = express.Router()

// One-click demo data for admins / fleet managers
router.post('/seed', authenticate, authorize('admin', 'fleet_manager'), async (req, res) => {
  try {
    const result = await seedDemo({ createdBy: req.user.id })
    res.status(201).json({
      message: 'Demo data ready',
      routeId: result.route._id,
      route: result.route.routeId,
      accounts: result.accounts,
      vehicles: result.vehicles
    })
  } catch (error) {
    console.error('Demo seed failed:', error)
    res.status(500).json({ message: 'Failed to create demo data' })
  }
})

export default router
