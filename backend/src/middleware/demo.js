import User from '../models/User.js'
import { demoMode, isDemoEmail } from '../services/demo.js'

// In demo mode the demo accounts are shared by every visitor: nobody may change their
// details, password, role or status, or delete them. `target` picks the account.
export const protectDemoAccount = (target = req => req.params.id) => async (req, res, next) => {
  if (!demoMode()) return next()
  try {
    const user = await User.findById(target(req)).select('email').lean()
    if (user && isDemoEmail(user.email)) {
      return res.status(403).json({ message: 'Demo accounts can\u2019t be changed. Create your own account to try this.' })
    }
  } catch { /* an invalid id is answered by the route itself */ }
  next()
}

// The demo endpoints only exist in demo mode
export const requireDemoMode = (req, res, next) => (demoMode() ? next() : res.status(404).json({ message: 'Not found' }))
