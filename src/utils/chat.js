// Chats del pedido (especificación §8.3, Fase 7). Dos conversaciones separadas:
//   · 'caja':          cliente ↔ caja de la sede. Vive en orders/{id}.clientMessages
//                      (la forma de siempre: la app ya la lee).
//   · 'domiciliario':  cliente ↔ domiciliario asignado. Vive en la subcolección
//                      orders/{id}/chat_domiciliario/{mensaje}; la caja no la lee.
// Los mensajes entran por POST /api/v1/pedidos/:id/mensajes.
//
// Este archivo es compartido (misma lógica en la web y en el servidor):
//   - src/utils/chat.js                                   (web)
//   - delistars-menu-magic/back/src/shared/chat.js        (servidor)
// Si cambias uno, copia el otro: tests/etapas.test.mjs comprueba que sean iguales.
import { etapaDe } from './etapas.js'

export const CANALES = ['caja', 'domiciliario']

/** Cuánto sigue abierto el chat después de la entrega (§8.3: 3 horas). */
export const VENTANA_CHAT_MS = 3 * 60 * 60 * 1000

/** Lo más largo que puede ser un mensaje. */
export const MAX_TEXTO = 500

/** Fecha (ms) de un campo que puede ser Timestamp de Firestore, número o Date. */
function ms(v) {
  if (v == null) return null
  if (typeof v === 'number') return v
  if (v instanceof Date) return v.getTime()
  if (typeof v.toMillis === 'function') return v.toMillis()
  if (typeof v.seconds === 'number') return v.seconds * 1000
  return null
}

/** Cuándo se entregó (si ya se entregó). */
export function entregadoEn(order) {
  return ms(order?.deliveredAt) ?? ms(order?.completedAt) ?? null
}

/**
 * ¿Por qué no se puede escribir en este canal? null si sí se puede.
 *   'canal'            → el canal no existe
 *   'rechazado'        → el pedido fue rechazado o cancelado (no hay con quién hablar)
 *   'vencido'          → se entregó hace más de 3 horas
 *   'sin_domiciliario' → el canal del domiciliario solo existe cuando hay uno asignado
 */
export function motivoCerrado(order, canal, ahora = Date.now()) {
  if (!CANALES.includes(canal)) return 'canal'
  const { etapa, excepcion } = etapaDe(order)
  if (excepcion === 'rechazado' || excepcion === 'cancelado') return 'rechazado'
  if (etapa === 'entregado') {
    const en = entregadoEn(order)
    // Sin fecha de entrega no hay forma de medir las 3 horas: se cierra.
    if (en == null || ahora - en > VENTANA_CHAT_MS) return 'vencido'
  }
  if (canal === 'domiciliario' && (!order?.driverEmail || order?.deliveryMode === 'pickup')) return 'sin_domiciliario'
  return null
}

export function chatAbierto(order, canal, ahora = Date.now()) {
  return motivoCerrado(order, canal, ahora) === null
}

/** Texto para la pantalla cuando el chat está cerrado. */
export function textoCerrado(motivo, canal) {
  if (motivo === 'rechazado') return 'Este pedido no siguió, así que el chat quedó cerrado.'
  if (motivo === 'vencido') return 'El chat se cierra 3 horas después de la entrega.'
  if (motivo === 'sin_domiciliario') return 'Podrás escribirle al domiciliario cuando te asignen uno.'
  return canal === 'domiciliario' ? 'El chat con el domiciliario no está disponible.' : 'El chat no está disponible.'
}

/** Limpia y valida el texto de un mensaje; devuelve el texto o el código del error. */
export function revisarTexto(texto) {
  const t = String(texto ?? '').replace(/\s+/g, ' ').trim()
  if (t.length < 1) return { error: 'texto' }
  if (t.length > MAX_TEXTO) return { error: 'largo' }
  return { texto: t }
}
