import jwt from 'jsonwebtoken'
import User from '../models/User.js'

export const authenticate = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ message: 'No token provided' })
    }

    const token = authHeader.split(' ')[1]
    const decoded = jwt.verify(token, process.env.JWT_SECRET || 'hopr-secret-key')

    const user = await User.findById(decoded.id)
    if (!user || !user.isActive) {
      return res.status(401).json({ message: 'User not found or inactive' })
    }

    // H11: Check token version
    if (decoded.tokenVersion !== user.tokenVersion) {
      return res.status(401).json({ message: 'Token invalidated. Please log in again.' })
    }

    req.user = { id: user._id, role: user.role }
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
    if (!roles.includes(req.user.role)) {
      return res.status(403).json({ message: 'Insufficient permissions' })
    }
    next()
  }
}