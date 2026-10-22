import { ROUTE_COLORS, ROUTE_GREEN } from '../config'
import { initials } from './format'
import { relativeTime } from './time'
import { stopVariant, isStale } from './routeView'

// Map layers for routes on the road (Live monitor and the dashboard). The focused
// route, or a lone route, is volt; the others use muted hues so one stands out.
export function buildFleetMap(routes, focus = null, { focusOnly = true } = {}) {
  const shown = focus && focusOnly ? routes.filter(r => r._id === focus) : routes
  const highlighted = r => focus === r._id || (!focus && shown.length === 1)
  return {
    lines: shown.map(r => ({
      id: r._id,
      coordinates: r.geometry?.coordinates || [],
      color: highlighted(r) ? ROUTE_GREEN : ROUTE_COLORS[routes.indexOf(r) % ROUTE_COLORS.length],
      width: focus === r._id ? 4.5 : 3.5
    })),
    points: [
      // One marker per distinct depot
      ...[...new Map(shown.filter(r => r.depot?.coordinates?.length === 2).map(r => [r.depot.coordinates.join(), r.depot])).values()]
        .map(d => ({ id: `depot-${d.coordinates.join()}`, coordinates: d.coordinates, label: 'H', variant: 'depot', title: d.name })),
      ...shown.flatMap(r => {
        const current = r.stops.findIndex(s => s.status === 'pending' || s.status === 'in_progress')
        const dim = focus && !focusOnly && focus !== r._id
        return r.stops.map((s, i) => ({
          id: `${r._id}-${s._id}`,
          coordinates: s.coordinates,
          label: s.sequence,
          variant: dim ? 'muted' : stopVariant(s, i === current),
          title: `${r.name}: stop ${s.sequence}, ${s.address}`
        }))
      })
    ],
    drivers: shown.filter(r => r.driverLocation?.coordinates?.length === 2).map(r => ({
      id: r._id,
      coordinates: r.driverLocation.coordinates,
      initials: initials(r.driver?.name),
      stale: isStale(r.driverLocation.updatedAt),
      title: `${r.driver?.name}, ${r.name}, GPS ${relativeTime(r.driverLocation.updatedAt)}`
    }))
  }
}

// Before anyone is on the road: the day's planned routes, one hue each, and the hubs
// the fleet is based at
export function buildPlanMap(routes, hubs = []) {
  const depots = [...hubs, ...routes.map(r => r.depot).filter(d => d?.coordinates?.length === 2)]
  return {
    lines: routes.map((r, i) => ({ id: r._id, coordinates: r.geometry?.coordinates || [], color: ROUTE_COLORS[i % ROUTE_COLORS.length], width: 3 })),
    points: [...new Map(depots.map(d => [d.coordinates.join(), d])).values()]
      .map(d => ({ id: `hub-${d.coordinates.join()}`, coordinates: d.coordinates, label: 'H', variant: 'depot', title: d.name || d.address })),
    drivers: []
  }
}
