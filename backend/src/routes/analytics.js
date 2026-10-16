import express from 'express'
import { query } from 'express-validator'
import Route from '../models/Route.js'
import Vehicle from '../models/Vehicle.js'
import { authenticate, authorize } from '../middleware/auth.js'
import { validateRequest } from '../middleware/validate.js'
import { RANGES, rangeWindow, buildAnalytics, routesToCsv, istKey } from '../services/analytics.js'

const router = express.Router()

const rangeQuery = [query('range').optional().isIn(Object.keys(RANGES)), validateRequest]

// Routes whose service day (planned start, else creation) falls in [from, to)
function routesBetween(from, to) {
  return Route.find({
    $or: [
      { plannedStart: { $gte: from, $lt: to } },
      { plannedStart: null, createdAt: { $gte: from, $lt: to } }
    ]
  })
    .select('-geometry -alternatives -stops.trackingToken -stops.issues')
    .populate('driver', 'name')
    .populate('vehicle', 'vehicleId name type')
    .lean()
}

router.get('/', authenticate, authorize('admin', 'fleet_manager'), rangeQuery, async (req, res) => {
  try {
    const range = req.query.range || '30d'
    const { start, end, prevStart } = rangeWindow(range)
    const [routes, previousRoutes, vehicles] = await Promise.all([
      routesBetween(start, end),
      routesBetween(prevStart, start),
      Vehicle.find().select('vehicleId name type status').lean()
    ])
    res.json(buildAnalytics({ routes, previousRoutes, vehicles, range, now: end }))
  } catch (error) {
    console.error('Analytics error:', error)
    res.status(500).json({ message: 'Failed to fetch analytics' })
  }
})

router.get('/report.csv', authenticate, authorize('admin', 'fleet_manager'), rangeQuery, async (req, res) => {
  try {
    const range = req.query.range || '30d'
    const { start, end } = rangeWindow(range)
    const routes = await routesBetween(start, end)
    routes.sort((a, b) => new Date(a.plannedStart || a.createdAt) - new Date(b.plannedStart || b.createdAt))
    res.setHeader('Content-Type', 'text/csv; charset=utf-8')
    res.setHeader('Content-Disposition', `attachment; filename="hopr-report-${range}-${istKey(end)}.csv"`)
    res.send(routesToCsv(routes))
  } catch (error) {
    res.status(500).json({ message: 'Failed to generate report' })
  }
})

export default router
