// DeliStars Service Worker — cache app shell para funcionar offline
const CACHE = 'delistars-v2'

self.addEventListener('install', e => {
  // self.registration.scope = e.g. 'https://delistars.com/domicilios/'
  const scope = self.registration.scope
  const shell = [scope, scope + 'index.html']
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(shell).catch(() => {})))
  self.skipWaiting()
})

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))
    ).then(() => clients.claim())
  )
})

self.addEventListener('fetch', e => {
  if (e.request.method !== 'GET') return
  const url = e.request.url
  // No cachear requests de Firebase / Firestore / Google APIs
  if (
    url.includes('firestore.googleapis.com') ||
    url.includes('firebase') ||
    url.includes('googleapis.com') ||
    url.includes('fonts.gstatic.com') ||
    url.includes('fonts.googleapis.com')
  ) return

  e.respondWith(
    fetch(e.request)
      .then(res => {
        // Guardar en caché respuestas exitosas de assets propios
        if (res.ok && (url.includes('/assets/') || url === self.registration.scope)) {
          const clone = res.clone()
          caches.open(CACHE).then(c => c.put(e.request, clone)).catch(() => {})
        }
        return res
      })
      .catch(() => caches.match(e.request))
  )
})
