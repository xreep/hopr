import express from 'express'
import { body } from 'express-validator'
import TrafficIncident from '../models/TrafficIncident.js'
import { authenticate, authorize } from '../middleware/auth.js'
import { validateRequest, pick, objectIdParam } from '../middleware/validate.js'
import { flagAffectedRoutes } from '../services/incidents.js'

const router = express.Router()
router.param('id', objectIdParam)

router.get('/', authenticate, async (req, res) => {
  try {
    const incidents = await TrafficIncident.findActive().sort({ createdAt: -1 }).limit(100)
    res.json({ incidents })
  } catch (error) {
    res.status(500).json({ message: 'Failed to fetch incidents' })
  }
})

router.post('/', authenticate, authorize('admin', 'fleet_manager'), [
  body('type').isIn(['congestion', 'closure']).withMessage('Type must be congestion or closure'),
  body('label').isString().trim().notEmpty().isLength({ max: 120 }).withMessage('Describe the incident'),
  body('coordinates').isArray({ min: 2, max: 2 }).withMessage('Location is required'),
  body('coordinates.*').isFloat({ min: -180, max: 180 }),
  body('radiusKm').optional().isFloat({ min: 0.1, max: 5 }).toFloat(),
  body('severity').optional().isFloat({ min: 1, max: 4 }).toFloat(),
  body('durationMinutes').optional().isInt({ min: 5, max: 1440 }).toInt(),
  validateRequest
], async (req, res) => {
  try {
    const data = pick(req.body, ['type', 'label', 'radiusKm', 'severity'])
    data.coordinates = req.body.coordinates.map(Number)
    if (req.body.durationMinutes) data.expiresAt = new Date(Date.now() + req.body.durationMinutes * 60000)
    const incident = await TrafficIncident.create({ ...data, createdBy: req.user.id })
    const affectedRoutes = await flagAffectedRoutes(incident)
    res.status(201).json({ incident, affectedRoutes })
  } catch (error) {
    res.status(500).json({ message: 'Failed to create incident' })
  }
})

router.patch('/:id/resolve', authenticate, authorize('admin', 'fleet_manager'), async (req, res) => {
  try {
    const incident = await TrafficIncident.findByIdAndUpdate(req.params.id, { active: false }, { new: true })
    if (!incident) return res.status(404).json({ message: 'Incident not found' })
    res.json({ incident })
  } catch (error) {
    res.status(500).json({ message: 'Failed to resolve incident' })
  }
})

export default router
