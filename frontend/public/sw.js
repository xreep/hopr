// Hopr service worker: lets the app open without signal. It keeps the app shell, its
// scripts, styles and typeface, and recently viewed map tiles. It never stores API
// responses: the driver app keeps its own routes and unsent updates in IndexedDB, per
// driver, and clears them on sign-out.
const VERSION = 'hopr-2'
const SHELL = `${VERSION}-shell`
const ASSETS = `${VERSION}-assets`
const TILES = `${VERSION}-tiles`
const MAX_TILES = 600
const TILE_HOSTS = new Set(['tiles.openfreemap.org'])

self.addEventListener('install', event => {
  event.waitUntil(caches.open(SHELL).then(cache => cache.addAll(['/', '/favicon.svg', '/manifest.webmanifest'])))
  self.skipWaiting()
})

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(key => !key.startsWith(VERSION)).map(key => caches.delete(key))))
      .then(() => self.clients.claim())
  )
})

async function trim(cacheName, max) {
  const cache = await caches.open(cacheName)
  const keys = await cache.keys()
  await Promise.all(keys.slice(0, Math.max(0, keys.length - max)).map(key => cache.delete(key)))
}

// Pages: the network first, so a deploy shows at once; the saved shell when offline
async function page(request) {
  try {
    const response = await fetch(request)
    if (response.ok && (response.headers.get('content-type') || '').includes('text/html')) {
      const copy = response.clone()
      caches.open(SHELL).then(cache => cache.put('/', copy))
    }
    return response
  } catch {
    return (await caches.match('/')) || Response.error()
  }
}

// Hashed scripts, styles and fonts (all under /assets/) never change: the cache first
async function cacheFirst(request, cacheName) {
  const cached = await caches.match(request)
  if (cached) return cached
  const response = await fetch(request)
  if (response.ok) {
    const copy = response.clone()
    caches.open(cacheName).then(cache => cache.put(request, copy))
  }
  return response
}

// Map tiles: show the saved tile at once and refresh it in the background
async function tile(request) {
  const cache = await caches.open(TILES)
  const cached = await cache.match(request)
  const refresh = fetch(request).then(response => {
    if (response.ok) cache.put(request, response.clone()).then(() => trim(TILES, MAX_TILES))
    return response
  }).catch(() => cached || Response.error())
  return cached || refresh
}

self.addEventListener('fetch', event => {
  const { request } = event
  if (request.method !== 'GET') return
  const url = new URL(request.url)

  if (url.origin === self.location.origin) {
    if (url.pathname.startsWith('/api/')) return
    if (request.mode === 'navigate') event.respondWith(page(request))
    else if (url.pathname.startsWith('/assets/')) event.respondWith(cacheFirst(request, ASSETS))
    return
  }
  if (TILE_HOSTS.has(url.hostname)) event.respondWith(tile(request))
})
