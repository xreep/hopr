import express from 'express'
import Upload from '../models/Upload.js'
import Route from '../models/Route.js'
import { authenticate, isManager } from '../middleware/auth.js'
import { objectIdParam } from '../middleware/validate.js'

const router = express.Router()
router.param('id', objectIdParam)

// Proof-of-delivery image: visible to managers and to the driver of that route
router.get('/:id', authenticate, async (req, res) => {
  try {
    const upload = await Upload.findById(req.params.id).select('+data')
    if (!upload) return res.status(404).json({ message: 'Not found' })
    if (!isManager(req.user)) {
      const route = await Route.findById(upload.route).select('driver')
      if (!route || route.driver?.toString() !== req.user.id) {
        return res.status(403).json({ message: 'Not authorized' })
      }
    }
    res.set({
      'Content-Type': upload.contentType,
      'Content-Length': upload.size,
      'Cache-Control': 'private, max-age=86400',
      'Content-Disposition': 'inline'
    })
    res.send(upload.data)
  } catch (error) {
    res.status(500).json({ message: 'Failed to load image' })
  }
})

export default router
