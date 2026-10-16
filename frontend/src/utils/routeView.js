// Map marker variant for a stop
export function stopVariant(stop, isCurrent) {
  if (stop.status === 'completed') return 'done'
  if (stop.status === 'failed') return 'failed'
  if (isCurrent) return 'current'
  if (stop.lateByMin > 0) return 'late'
  return 'stop'
}

export const isStale = (updatedAt, seconds = 60, now = Date.now()) =>
  !updatedAt || now - new Date(updatedAt).getTime() > seconds * 1000
