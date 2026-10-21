import Route from '../models/Route.js'
import { legIncidentEffect } from './traffic.js'
import { currentPosition } from './routePlanning.js'

// Marks planned/active routes whose remaining path crosses the incident zone so
// the fleet manager (and driver) are prompted to recalculate.
export async function flagAffectedRoutes(incident) {
  const routes = await Route.find({ status: { $in: ['planned', 'active'] } })
  const affected = []
  for (const route of routes) {
    const remaining = route.stops.filter(s => s.status === 'pending' || s.status === 'in_progress')
    if (!remaining.length) continue
    const path = [currentPosition(route), ...remaining.map(s => s.coordinates)]
    const hit = path.slice(1).some((point, i) => legIncidentEffect(path[i], point, [incident]).incidents.length > 0)
    if (hit) {
      route.needsRecalculation = true
      await route.save()
      affected.push(route._id.toString())
    }
  }
  return affected
}
