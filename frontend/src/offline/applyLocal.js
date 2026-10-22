// What an update does to a route, applied on the phone so the driver sees it at once
// (and keeps seeing it) while it waits in the outbox. Mirrors the server's rules.

const open = s => s.status === 'pending' || s.status === 'in_progress'

function advance(route, at) {
  const ordered = [...route.stops].sort((a, b) => a.sequence - b.sequence)
  if (!ordered.some(s => s.status === 'in_progress')) {
    const next = ordered.find(s => s.status === 'pending')
    if (next) next.status = 'in_progress'
  }
  if (ordered.length && ordered.every(s => !open(s))) {
    route.status = 'completed'
    route.completedAt = at
  }
}

export function applyLocal(route, item) {
  if (!route || route._id !== item.routeId) return route
  const next = { ...route, stops: route.stops.map(s => ({ ...s })) }
  const stop = next.stops.find(s => s._id === item.stopId)
  const startIfPlanned = () => {
    if (next.status === 'planned') {
      next.status = 'active'
      next.startedAt = item.at
    }
  }

  if (item.kind === 'start') {
    if (next.status !== 'planned') return route
    startIfPlanned()
    advance(next, item.at)
  } else if (item.kind === 'status' || item.kind === 'complete') {
    if (!stop || !open(stop)) return route
    startIfPlanned()
    if (item.kind === 'complete') {
      stop.status = 'completed'
      stop.completedAt = item.at
      stop.proof = { note: item.body.note, completedAt: item.at }
    } else {
      stop.status = item.body.status
      if (item.body.status === 'failed') {
        stop.failedAt = item.at
        stop.failureReason = item.body.reason
      }
    }
    stop.pendingSync = true
    advance(next, item.at)
  } else if (item.kind === 'issue') {
    if (!stop) return route
    stop.pendingSync = true
    if (item.body.type === 'delay') {
      for (const s of next.stops) {
        if (open(s) && s.estimatedArrival) s.estimatedArrival = new Date(new Date(s.estimatedArrival).getTime() + item.body.delayMinutes * 60000).toISOString()
      }
    }
  }
  return next
}

// Server routes with the updates still waiting in the outbox laid over them
export const applyPending = (routes, items) => routes.map(route => items.reduce(applyLocal, route))
