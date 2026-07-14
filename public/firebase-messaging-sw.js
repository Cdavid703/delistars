/* Service worker de Firebase Cloud Messaging para el panel del cliente
   (delistars.com/domicilios/). Recibe las notificaciones cuando la app está
   cerrada o en segundo plano. La config pública de Firebase llega por
   query-params al registrarse (no hay secretos: son claves públicas de cliente). */
/* eslint-disable no-undef */
importScripts('https://www.gstatic.com/firebasejs/10.14.1/firebase-app-compat.js')
importScripts('https://www.gstatic.com/firebasejs/10.14.1/firebase-messaging-compat.js')

const cfg = Object.fromEntries(new URL(self.location).searchParams.entries())

if (cfg.apiKey && cfg.projectId) {
  firebase.initializeApp(cfg)
  const messaging = firebase.messaging()

  messaging.onBackgroundMessage((payload) => {
    const n = payload.notification || {}
    const data = payload.data || {}
    self.registration.showNotification(n.title || 'DeliStars', {
      body:  n.body || '',
      icon:  '/domicilios/logo_sello.png',
      badge: '/domicilios/logo_sello.png',
      tag:   data.orderId || undefined,   // agrupa por pedido: no apila duplicados
      data:  { url: data.url || 'https://delistars.com/domicilios/' },
    })
  })
}

// Al tocar la notificación, enfoca la pestaña de domicilios o la abre.
self.addEventListener('notificationclick', (event) => {
  event.notification.close()
  const url = (event.notification.data && event.notification.data.url) || 'https://delistars.com/domicilios/'
  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then((wins) => {
      for (const w of wins) {
        if (w.url.includes('/domicilios') && 'focus' in w) return w.focus()
      }
      return clients.openWindow(url)
    }),
  )
})
