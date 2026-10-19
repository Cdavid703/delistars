// Cliente de la API de pedidos del servidor (Fase 3, /api/v1/pedidos).
//
// La caja y los domiciliarios cambian los pedidos por aquí: el servidor valida
// quién puede hacer qué, lleva la versión y el historial y escribe también el
// status viejo para que las pantallas actuales no noten diferencia.
//
// RESPALDO: si el servidor no responde (sin red, caído, 5xx o API apagada),
// se usa el camino de antes (escritura directa) para que la operación nunca se
// frene. Los errores de negocio (4xx: "ya no se puede", "otro lo cambió") sí se
// muestran: ahí el respaldo haría justamente lo que el servidor rechazó.
import { auth } from './firebase'

export class ErrorApi extends Error {
  constructor(mensaje, codigo, status) { super(mensaje); this.codigo = codigo; this.status = status }
}

const nuevaClave = () =>
  (globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(36).slice(2)}`).replace(/[^A-Za-z0-9_-]/g, '')

/** POST a /api/v1/pedidos/<ruta>. Lanza ErrorApi con el texto para mostrar. */
export async function llamarPedidos(ruta, cuerpo = {}, clave = nuevaClave()) {
  const token = await auth.currentUser?.getIdToken()
  if (!token) throw new ErrorApi('Tu sesión venció. Vuelve a entrar.', 'sin_sesion', 401)
  const res = await fetch(`/api/v1/pedidos/${ruta}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: `Bearer ${token}`, 'Idempotency-Key': clave },
    body: JSON.stringify(cuerpo),
  })
  let datos = {}
  try { datos = await res.json() } catch { /* respuesta sin cuerpo */ }
  if (!res.ok) throw new ErrorApi(datos.error || `Error ${res.status}`, datos.codigo || 'http', res.status)
  return datos
}

/** ¿Este error justifica usar el camino viejo? (servidor caído, no "regla de negocio"). */
export const usarRespaldo = (err) =>
  !(err instanceof ErrorApi) || err.status >= 500 || err.codigo === 'inactiva' || err.status === 401

/**
 * Intenta por la API y, si el servidor no está, por el camino viejo.
 * `directo` es la función de siempre (updateDoc / actualizarPedido).
 */
export async function conApi(ruta, cuerpo, directo) {
  try {
    return await llamarPedidos(ruta, cuerpo)
  } catch (err) {
    if (!usarRespaldo(err)) throw err
    console.warn(`[pedidosApi] ${ruta} sin servidor, uso el camino directo:`, err?.message || err)
    return directo()
  }
}
