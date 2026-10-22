// On-device storage for the driver app (IndexedDB): an outbox of updates made without
// signal, and the driver's last-loaded routes so the app opens offline. Cached routes
// are cleared on sign-out; the outbox is kept until it has been sent.
const DB_NAME = 'hopr-offline'
const VERSION = 1

let opening = null
function openDb() {
  if (typeof indexedDB === 'undefined') return Promise.reject(new Error('Offline storage is not available'))
  opening ??= new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, VERSION)
    req.onupgradeneeded = () => {
      const db = req.result
      db.createObjectStore('outbox', { keyPath: 'id', autoIncrement: true }).createIndex('user', 'userId')
      db.createObjectStore('routes', { keyPath: 'userId' })
    }
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => {
      opening = null
      reject(req.error)
    }
  })
  return opening
}

async function run(storeName, mode, action) {
  const db = await openDb()
  return new Promise((resolve, reject) => {
    const tx = db.transaction(storeName, mode)
    const request = action(tx.objectStore(storeName))
    tx.oncomplete = () => resolve(request?.result)
    tx.onerror = () => reject(tx.error)
    tx.onabort = () => reject(tx.error)
  })
}

export const outboxAdd = item => run('outbox', 'readwrite', store => store.add(item))
export const outboxRemove = id => run('outbox', 'readwrite', store => store.delete(id))
export async function outboxList(userId) {
  const items = await run('outbox', 'readonly', store => store.index('user').getAll(userId))
  return (items || []).sort((a, b) => a.id - b.id)
}

export const saveRoutes = (userId, routes) => run('routes', 'readwrite', store => store.put({ userId, routes, savedAt: Date.now() }))
export const loadRoutes = userId => run('routes', 'readonly', store => store.get(userId))
export const forgetRoutes = () => run('routes', 'readwrite', store => store.clear())
