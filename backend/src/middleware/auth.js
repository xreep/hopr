import jwt from 'jsonwebtoken'
import User from '../models/User.js'
import { jwtSecret } from '../services/token.js'

export const authenticate = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ message: 'No token provided' })
    }

    const token = authHeader.split(' ')[1]
    const decoded = jwt.verify(token, jwtSecret())

    const user = await User.findById(decoded.id)
    if (!user || !user.isActive) {
      return res.status(401).json({ message: 'User not found or inactive' })
    }

    // H11: Check token version
    if (decoded.tokenVersion !== user.tokenVersion) {
      return res.status(401).json({ message: 'Token invalidated. Please log in again.' })
    }

    // id is a string so ownership checks can compare with `other.toString() === req.user.id`
    req.user = { id: user._id.toString(), role: user.role, name: user.name }
    next()
  } catch (error) {
    if (error.name === 'JsonWebTokenError') {
      return res.status(401).json({ message: 'Invalid token' })
    }
    if (error.name === 'TokenExpiredError') {
      return res.status(401).json({ message: 'Token expired' })
    }
    res.status(500).json({ message: 'Authentication failed' })
  }
}

export const authorize = (...roles) => {
  return (req, res, next) => {
    if (!req.user || !roles.includes(req.user.role)) {
      return res.status(403).json({ message: 'Insufficient permissions' })
    }
    next()
  }
}

export const isManager = (user) => user?.role === 'admin' || user?.role === 'fleet_manager'
