import api from './api'

// Uploads never change once stored, so each one is fetched once per session and kept
// as an object URL. The oldest are released past MAX_CACHED; sign-out clears them all.
const MAX_CACHED = 60
const cache = new Map() // id -> Promise<objectURL>

export function loadImage(id) {
  if (cache.has(id)) {
    const hit = cache.get(id)
    cache.delete(id) // re-insert as most recently used
    cache.set(id, hit)
    return hit
  }
  const pending = api.get(`/uploads/${id}`, { responseType: 'blob' }).then(res => URL.createObjectURL(res.data))
  pending.catch(() => cache.delete(id))
  cache.set(id, pending)
  while (cache.size > MAX_CACHED) {
    const [oldest, url] = cache.entries().next().value
    cache.delete(oldest)
    url.then(u => URL.revokeObjectURL(u)).catch(() => {})
  }
  return pending
}

export function clearImageCache() {
  for (const url of cache.values()) url.then(u => URL.revokeObjectURL(u)).catch(() => {})
  cache.clear()
}
