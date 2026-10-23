import express from 'express'
import { body } from 'express-validator'
import rateLimit from 'express-rate-limit'
import ContactMessage, { CONTACT_TOPICS, FLEET_SIZES } from '../models/ContactMessage.js'
import { validateRequest } from '../middleware/validate.js'
import * as notify from '../services/notify.js'

const router = express.Router()

const limit = (max, keyGenerator) => rateLimit({
  windowMs: 60 * 60 * 1000,
  max,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  ...(keyGenerator && { keyGenerator }),
  message: { message: 'Too many messages. Please try again in an hour.' }
})
// 20 messages an hour from one network, 5 from one sender
const perIp = limit(20)
const perSender = limit(5, req => `contact:${String(req.body?.email || '').trim().toLowerCase()}`)

// The public website's contact form. Stored for the admins (Admin page) and emailed to
// them when email is set up, so no message is lost while it is not.
router.post('/', perIp, perSender, [
  body('name').isString().trim().notEmpty().isLength({ max: 100 }).withMessage('Enter your name'),
  body('email').isEmail().withMessage('Enter a valid email').normalizeEmail({ gmail_remove_dots: false }),
  body('company').optional({ values: 'falsy' }).isString().trim().isLength({ max: 120 }),
  body('fleetSize').optional({ values: 'falsy' }).isIn(FLEET_SIZES),
  body('topic').isIn(CONTACT_TOPICS).withMessage('Choose what the message is about'),
  body('message').isString().trim().isLength({ min: 1, max: 4000 }).withMessage('Write a message (up to 4,000 characters)'),
  validateRequest
], async (req, res) => {
  try {
    // A hidden field people never see; anything in it came from a bot
    if (!req.body.website) {
      const saved = await ContactMessage.create({
        name: req.body.name,
        email: req.body.email,
        company: req.body.company || undefined,
        fleetSize: req.body.fleetSize || undefined,
        topic: req.body.topic,
        message: req.body.message
      })
      notify.inBackground(notify.contactReceived(saved))
    }
    res.status(201).json({ message: 'Thanks. We reply within two working days.' })
  } catch (error) {
    res.status(500).json({ message: 'Could not send your message. Please try again.' })
  }
})

export default router
