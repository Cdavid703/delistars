// Detecta si la página se abrió DENTRO de otra app (WhatsApp, Instagram,
// Facebook…) en vez de en un navegador de verdad.
//
// El problema real, reportado en producción: un empleado abre el enlace de
// turnos desde WhatsApp, toca "Entrar con Google" y se estrella con
// "Unable to process request due to missing initial state".
//
// La cadena que lo produce:
//   1. El navegador interno de WhatsApp BLOQUEA las ventanas emergentes, así
//      que signInWithPopup falla.
//   2. El código caía entonces a signInWithRedirect, que sale a
//      delistars-domicilios.firebaseapp.com — otro dominio.
//   3. iOS y Safari aíslan el almacenamiento entre dominios distintos, así que
//      al volver no encuentra el dato que guardó antes de salir.
//
// No se puede arreglar desde adentro de esa ventana: hay que abrir el enlace en
// un navegador real. Esto sirve para DECÍRSELO al empleado en vez de dejarlo
// chocar con un error técnico en inglés.
// Módulo puro (sin React) para poder probarlo con node --test.

/** Apps cuyo navegador interno rompe el inicio de sesión con Google. */
const APPS = [
  { nombre: 'WhatsApp',  re: /WhatsApp/i },
  { nombre: 'Instagram', re: /Instagram/i },
  { nombre: 'Facebook',  re: /\bFBAN\b|\bFBAV\b|FB_IAB|FB4A/i },
  { nombre: 'Messenger', re: /Messenger/i },
  { nombre: 'TikTok',    re: /BytedanceWebview|TikTok|musical_ly/i },
  { nombre: 'Telegram',  re: /Telegram/i },
  { nombre: 'LinkedIn',  re: /LinkedInApp/i },
  { nombre: 'Snapchat',  re: /Snapchat/i },
]

/**
 * Devuelve el nombre de la app contenedora, 'el navegador de otra app' si se
 * reconoce como ventana embebida sin saber cuál, o null si es un navegador
 * normal (Chrome, Safari, Firefox…).
 */
export function navegadorEmbebido(ua) {
  const s = String(ua || '')
  if (!s) return null

  for (const app of APPS) {
    if (app.re.test(s)) return app.nombre
  }

  // iOS: una ventana embebida (WKWebView) no lleva "Safari" en su UA, mientras
  // que el Safari de verdad sí. Es la señal genérica cuando la app no se
  // identifica. Chrome y Firefox en iOS sí se anuncian (CriOS / FxiOS).
  const esIOS = /iPhone|iPad|iPod/i.test(s)
  const esSafariReal = /Safari/i.test(s)
  const esOtroNavegadorIOS = /CriOS|FxiOS|EdgiOS|OPiOS/i.test(s)
  if (esIOS && !esSafariReal && !esOtroNavegadorIOS) return 'el navegador de otra app'

  // Android: wv marca un WebView embebido.
  if (/Android/i.test(s) && /\bwv\b/i.test(s)) return 'el navegador de otra app'

  return null
}

/** ¿Conviene evitar el inicio de sesión con Google en este navegador? */
export const bloqueaLogin = (ua) => navegadorEmbebido(ua) !== null

export const esAndroid = (ua) => /Android/i.test(String(ua || ''))

/**
 * Enlace que abre la página en Chrome desde un WebView de Android.
 * En iOS no existe equivalente: al usuario le toca usar el menú de la app.
 */
export function enlaceChromeAndroid(url) {
  const limpia = String(url || '').replace(/^https?:\/\//, '')
  return `intent://${limpia}#Intent;scheme=https;package=com.android.chrome;end`
}
