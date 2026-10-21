import mongoose from 'mongoose'
import { validationResult } from 'express-validator'

export const validateRequest = (req, res, next) => {
  const errors = validationResult(req)
  if (!errors.isEmpty()) {
    return res.status(400).json({
      message: errors.array()[0].msg,
      errors: errors.array()
    })
  }
  next()
}

// H4: Mass-assignment guard — copy only whitelisted keys
export function pick(obj, allowed) {
  const picked = {}
  for (const key of allowed) {
    if (obj?.[key] !== undefined) picked[key] = obj[key]
  }
  return picked
}

// User-supplied search text is matched literally (prevents ReDoS / regex injection)
export function escapeRegex(text) {
  return String(text).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

// router.param handler: malformed ObjectIds become 400 instead of a CastError 500
export function objectIdParam(req, res, next, value) {
  if (!mongoose.isValidObjectId(value)) {
    return res.status(400).json({ message: 'Invalid id' })
  }
  next()
}
