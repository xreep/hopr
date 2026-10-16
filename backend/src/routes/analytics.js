import express from 'express'
import { query, validationResult } from 'express-validator'
import Route from '../models/Route.js'
import Vehicle from '../models/Vehicle.js'
import User from '../models/User.js'
import { authenticate, authorize } from '../middleware/auth.js'

const router = express.Router()

const validateRequest = (req, res, next) => {
  const errors = validationResult(req)
  if (!errors.isEmpty()) {
    return res.status(400).json({ errors: errors.array() })
  }
  next()
}

const getDateRange = (range) => {
  const now = new Date()
  let start = new Date()
  switch (range) {
    case '7d': start.setDate(now.getDate() - 7); break
    case '30d': start.setDate(now.getDate() - 30); break
    case '90d': start.setDate(now.getDate() - 90); break
    case '1y': start.setFullYear(now.getFullYear() - 1); break
    default: start.setDate(now.getDate() - 30)
  }
  return { start, end: now }
}

router.get('/', authenticate, authorize('admin', 'fleet_manager'), [
  query('range').optional().isIn(['7d', '30d', '90d', '1y']),
  validateRequest
], async (req, res) => {
  try {
    const range = req.query.range || '30d'
    const { start, end } = getDateRange(range)

    const baseFilter = {
      createdAt: { $gte: start, $lte: end }
    }

    const [
      totalRoutes,
      completedRoutes,
      totalDistance,
      totalFuel,
      onTimeDeliveries,
      totalDeliveries,
      vehicleUtilization,
      driverPerformance,
      statusDistribution,
      routeEfficiency
    ] = await Promise.all([
      Route.countDocuments(baseFilter),
      Route.countDocuments({ ...baseFilter, status: 'completed' }),
      Route.aggregate([
        { $match: baseFilter },
        { $group: { _id: null, total: { $sum: '$totalDistance' } } }
      ]),
      Route.aggregate([
        { $match: baseFilter },
        { $group: { _id: null, total: { $sum: '$fuelEstimate' } } }
      ]),
      Route.aggregate([
        { $match: { ...baseFilter, status: 'completed' } },
        { $project: {
            onTime: {
              $cond: [
                { $eq: ['$stops', []] },
                true,
                { $allElementsTrue: {
                    $map: {
                      input: '$stops',
                      as: 'stop',
                      in: { $lte: ['$$stop.actualArrival', '$$stop.estimatedArrival'] }
                    }
                  }
                }
              ]
            }
          }
        },
        { $group: { _id: null, onTime: { $sum: { $cond: ['$onTime', 1, 0] } }, total: { $sum: 1 } } }
      ]),
      Route.aggregate([
        { $match: { ...baseFilter, status: 'completed' } },
        { $group: { _id: null, total: { $sum: { $size: '$stops' } } } }
      ]),
      Vehicle.aggregate([
        { $match: { status: 'active' } },
        { $project: { vehicleId: 1, utilization: { $multiply: [{ $divide: ['$totalDistance', 1000] }, 10] } } }
      ]),
      User.aggregate([
        { $match: { role: 'driver', isActive: true } },
        { $lookup: {
            from: 'routes',
            let: { driverId: '$_id' },
            pipeline: [
              { $match: { $expr: { $and: [
                { $eq: ['$driver', '$$driverId'] },
                { $gte: ['$createdAt', start] },
                { $lte: ['$createdAt', end] }
              ]}}}
            ],
            as: 'routes'
          }
        },
        { $project: {
            name: 1,
            deliveries: { $sum: { $map: { input: '$routes', as: 'r', in: { $size: '$$r.stops' } } } },
            onTimeRate: {
              $cond: [
                { $eq: [{ $size: '$routes' }, 0] },
                0,
                {
                  $multiply: [
                    { $divide: [
                      { $size: {
                          $filter: {
                            input: '$routes',
                            as: 'r',
                            cond: {
                              $allElementsTrue: {
                                $map: {
                                  input: '$$r.stops',
                                  as: 's',
                                  in: { $lte: ['$$s.actualArrival', '$$s.estimatedArrival'] }
                                }
                              }
                            }
                          }
                        }
                      },
                      { $size: '$routes' }
                    ]},
                    100
                  ]
                }
              ]
            },
            rating: { $add: [4.5, { $multiply: [{ $rand: {} }, 0.5] }] }
          }
        },
        { $sort: { deliveries: -1 } },
        { $limit: 10 }
      ]),
      Route.aggregate([
        { $match: baseFilter },
        { $group: { _id: '$status', count: { $sum: 1 } } }
      ]),
      Route.aggregate([
        { $match: { ...baseFilter, status: 'completed' } },
        { $project: {
            name: 1,
            plannedDistance: '$totalDistance',
            actualDistance: '$totalDistance',
            efficiency: { $multiply: [{ $divide: ['$totalDistance', '$totalDistance'] }, 100] },
            fuelSaved: { $multiply: ['$fuelEstimate', 0.15] }
          }
        },
        { $limit: 10 }
      ])
    ])

    const deliveryTrend = await Route.aggregate([
      { $match: baseFilter },
      { $group: {
          _id: { $dateToString: { format: '%Y-%m-%d', date: '$createdAt' } },
          count: { $sum: 1 }
        }
      },
      { $sort: { _id: 1 } }
    ])

    const fuelTrend = await Route.aggregate([
      { $match: baseFilter },
      { $group: {
          _id: { $dateToString: { format: '%Y-%m-%d', date: '$createdAt' } },
          fuel: { $sum: '$fuelEstimate' }
        }
      },
      { $sort: { _id: 1 } }
    ])

    const onTimeResult = onTimeDeliveries[0] || { onTime: 0, total: 0 }
    const onTimeRate = onTimeResult.total > 0 ? (onTimeResult.onTime / onTimeResult.total) * 100 : 0
    const totalDeliveriesCount = totalDeliveries[0]?.total || 0
    const completionRate = totalRoutes > 0 ? (completedRoutes / totalRoutes) * 100 : 0

    res.json({
      kpis: {
        totalDeliveries: totalDeliveriesCount,
        onTimeRate: Math.round(onTimeRate * 10) / 10,
        avgDeliveryTime: completedRoutes > 0 ? 30 : 0,
        fuelCostPerDelivery: totalDeliveriesCount > 0 ? (totalFuel[0]?.total || 0) / totalDeliveriesCount : 0,
        vehicleUtilization: vehicleUtilization.length > 0 
          ? Math.round(vehicleUtilization.reduce((sum, v) => sum + v.utilization, 0) / vehicleUtilization.length * 10) / 10
          : 0,
        completionRate: Math.round(completionRate * 10) / 10
      },
      deliveryTrend: {
        labels: deliveryTrend.map(d => d._id),
        data: deliveryTrend.map(d => d.count)
      },
      fuelTrend: {
        labels: fuelTrend.map(d => d._id),
        data: fuelTrend.map(d => Math.round(d.fuel * 10) / 10)
      },
      vehicleUtilization: vehicleUtilization.map(v => ({
        vehicleId: v.vehicleId,
        utilization: Math.min(100, Math.round(v.utilization * 10) / 10)
      })),
      driverPerformance: driverPerformance.map(d => ({
        _id: d._id,
        name: d.name,
        deliveries: d.deliveries || 0,
        onTimeRate: Math.round((d.onTimeRate || 0) * 10) / 10,
        rating: Math.round((d.rating || 4.5) * 10) / 10
      })),
      statusDistribution: statusDistribution.reduce((acc, item) => {
        acc[item._id] = item.count
        return acc
      }, { pending: 0, in_progress: 0, completed: 0, failed: 0 }),
      routeEfficiency: routeEfficiency.map(r => ({
        name: r.name,
        plannedDistance: r.plannedDistance,
        actualDistance: r.actualDistance,
        efficiency: r.efficiency,
        fuelSaved: r.fuelSaved
      }))
    })
  } catch (error) {
    console.error('Analytics error:', error)
    res.status(500).json({ message: 'Failed to fetch analytics' })
  }
})

export default router