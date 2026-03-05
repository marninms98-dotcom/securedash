// ════════════════════════════════════════════════════════════
// SecureWorks Trade — Service Worker
//
// Caches the app shell so the login screen + UI loads instantly.
// API calls always go to network (no stale data for job lists).
// ════════════════════════════════════════════════════════════

const CACHE_NAME = 'sw-trade-v4'

// App shell — these files are cached for instant load
const SHELL_FILES = [
  '/dashboard/trade.html',
  '/tools/shared/brand.js',
  '/tools/shared/cloud.js',
  'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2',
]

// Install — cache app shell
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(SHELL_FILES)
    })
  )
  // Activate immediately (don't wait for tabs to close)
  self.skipWaiting()
})

// Activate — clean old caches
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => {
      return Promise.all(
        keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k))
      )
    })
  )
  // Take control of all open tabs immediately
  self.clients.claim()
})

// Fetch — network-first for API, cache-first for shell
self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url)

  // API calls and auth — always network, never cache
  if (
    url.pathname.includes('/functions/') ||
    url.pathname.includes('/auth/') ||
    url.hostname.includes('supabase.co')
  ) {
    return // Let browser handle normally (network only)
  }

  // App shell files — cache-first with network fallback
  event.respondWith(
    caches.match(event.request).then((cached) => {
      if (cached) {
        // Return cache immediately, update in background
        const fetchPromise = fetch(event.request).then((response) => {
          if (response.ok) {
            const clone = response.clone()
            caches.open(CACHE_NAME).then((cache) => cache.put(event.request, clone))
          }
          return response
        }).catch(() => cached)

        return cached
      }

      // Not cached — fetch from network
      return fetch(event.request)
    })
  )
})
