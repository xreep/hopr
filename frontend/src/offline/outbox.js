import api from '../utils/api'
import { outboxAdd, outboxList, outboxRemove } from './store'

// Driver updates (start, delivered, couldn't deliver, report) are sent straight away when
// there is signal, and queued on the phone when there isn't. Queued updates carry the time
// they happened (`at`) and are sent in order once the connection is back.

const listeners = new Set()
export function subscribeOutbox(fn) {
  listeners.add(fn)
  return () => listeners.delete(fn)
}
const changed = () => listeners.forEach(fn => fn())

// The request never reached the app: no response at all (no signal, timeout), or the
// hosting gateway answering for a server that is asleep or down
export const isNetworkError = error => Boolean(error) && (!error.response || [502, 503, 504].includes(error.response.status))

export function sendUpdate(item) {
  const base = `/routes/${item.routeId}`
  switch (item.kind) {
    case 'start':
      return api.patch(`${base}/start`, { at: item.at })
    case 'status':
      return api.patch(`${base}/stops/${item.stopId}/status`, { ...item.body, at: item.at })
    case 'issue':
      return api.post(`${base}/stops/${item.stopId}/issues`, item.body)
    case 'complete': {
      const form = new FormData()
      if (item.body.photo) form.append('photo', item.body.photo, 'delivery.jpg')
      if (item.body.signature) form.append('signature', item.body.signature, 'signature.png')
      if (item.body.note) form.append('note', item.body.note)
      form.append('at', item.at)
      return api.post(`${base}/stops/${item.stopId}/complete`, form, { headers: { 'Content-Type': 'multipart/form-data' } })
    }
    default:
      return Promise.reject(new Error(`Unknown update ${item.kind}`))
  }
}

export async function queueUpdate(userId, item) {
  await outboxAdd({ ...item, userId })
  changed()
}

// Worth trying again later: no signal, signed out, rate limited or a server error.
// Anything else (already delivered, route reassigned, invalid) will never succeed.
const retryLater = error => {
  const status = error.response?.status
  return !status || status === 401 || status === 408 || status === 429 || status >= 500
}

// Updates still unsent after a week are stale (the manager has long since dealt with the
// stop) and only keep customer details on the phone: they are dropped
const MAX_AGE_MS = 7 * 86400000

let flushing = null
export function flushOutbox(userId) {
  flushing ??= (async () => {
    const result = { sent: 0, dropped: 0, remaining: 0 }
    try {
      const items = await outboxList(userId)
      for (let i = 0; i < items.length; i++) {
        try {
          if (Date.now() - new Date(items[i].at).getTime() > MAX_AGE_MS) {
            result.dropped++
            await outboxRemove(items[i].id)
            changed()
            continue
          }
          await sendUpdate(items[i])
          result.sent++
        } catch (error) {
          if (retryLater(error)) {
            result.remaining = items.length - i
            break
          }
          result.dropped++
        }
        await outboxRemove(items[i].id)
        changed()
      }
    } finally {
      flushing = null
    }
    return result
  })()
  return flushing
}

export { outboxList }
