// «Mis sesiones» del equipo (especificación §6.3). Cada aparato del equipo
// registra su sesión en el servidor (/api/v1/equipo/sesiones) con un id que
// crea él mismo, y manda ese id en cada llamada (X-Sesion-Equipo): si la
// cierran desde otro aparato, el servidor ya no le acepta nada y este aparato
// sale. La `clave` que devuelve el registro queda solo aquí: con ella este
// aparato cierra su propia sesión aunque ya no tenga token (cambio de empleado).

const llave = (uid) => `ds_sesion_equipo_${uid}`

/** { id, clave } guardados para esta cuenta en este aparato, o null. */
export function sesionGuardada(uid) {
  if (!uid) return null
  try { return JSON.parse(localStorage.getItem(llave(uid)) || 'null') } catch { return null }
}

export function guardarSesion(uid, datos) {
  try { localStorage.setItem(llave(uid), JSON.stringify(datos)) } catch { /* sin almacenamiento */ }
}

export function olvidarSesion(uid) {
  try { localStorage.removeItem(llave(uid)) } catch { /* sin almacenamiento */ }
}

/** Id nuevo de sesión: 24 letras y números. */
export function idNuevo() {
  const abc = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789'
  const r = new Uint8Array(24)
  crypto.getRandomValues(r)
  return [...r].map((n) => abc[n % abc.length]).join('')
}

/** Qué aparato y navegador es (para reconocerlo en la lista). */
export function infoAparato() {
  const ua = navigator.userAgent
  const aparato = /iPad/.test(ua) || (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1) ? 'iPad'
    : /iPhone/.test(ua) ? 'iPhone'
      : /Android/.test(ua) ? (/Mobile/.test(ua) ? 'Celular Android' : 'Tablet Android')
        : /Windows/.test(ua) ? 'Computador Windows' : /Macintosh/.test(ua) ? 'Mac' : 'Computador'
  const navegador = /Edg\//.test(ua) ? 'Edge' : /OPR\//.test(ua) ? 'Opera' : /Firefox\//.test(ua) ? 'Firefox'
    : /CriOS|Chrome\//.test(ua) ? 'Chrome' : /Safari\//.test(ua) ? 'Safari' : 'Navegador'
  return { aparato, navegador }
}

/** Este aparato cierra su sesión con su clave (sin token). No espera la respuesta. */
export function salirDeSesion(uid) {
  const s = sesionGuardada(uid)
  olvidarSesion(uid)
  if (!s?.id || !s?.clave) return
  try {
    fetch(`/api/v1/equipo/sesiones/${s.id}/salir`, {
      method: 'POST', keepalive: true, headers: { 'content-type': 'application/json' }, body: JSON.stringify({ clave: s.clave }),
    }).catch(() => {})
  } catch { /* sin red: queda abierta y se puede cerrar desde «Mis sesiones» */ }
}
