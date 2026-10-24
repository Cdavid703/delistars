// Reclamos, devoluciones y saldo a favor (especificación §14, Fase 7).
//
// Un reclamo es una ficha ligada a un pedido entregado: el cliente cuenta qué
// pasó, el equipo lo revisa y propone una solución, y el cliente la acepta o
// dice que el problema sigue. Si hay plata de por medio, la caja la solicita y
// administración la autoriza antes de que el cliente la vea (§14.2).
//
//   reclamos/{id}: { orderId, orderNumber, sedeId, sedeName, clientUid, clientEmail,
//     clientNombre, categoria, motivo, descripcion, estado, atiende,
//     propuesta: { texto, por, at } | null,
//     reembolso: { monto, estado, solicitadoPor, autorizadoPor, eleccion, datos, … } | null,
//     mensajes: [{ role, name, text, ts }], cierre: { motivo, por, at } | null,
//     creadoAt, actualizadoAt, resueltoAt }
//
// Este archivo es compartido (misma lógica en la web y en el servidor):
//   - src/utils/reclamos.js                                (web)
//   - delistars-menu-magic/back/src/shared/reclamos.js     (servidor)
// Si cambias uno, copia el otro: tests/etapas.test.mjs comprueba que sean iguales.
import { etapaDe } from './etapas.js'
import { entregadoEn } from './chat.js'

/** Hasta cuándo se puede reportar un problema de un pedido entregado (decisión 24 oct 2026). */
export const PLAZO_RECLAMO_MS = 24 * 60 * 60 * 1000

export const MAX_DESCRIPCION = 800

// Quién atiende cada categoría (§14.1): la caja lo de la comida; administración
// lo del domiciliario, que además ve todos los reclamos.
export const CATEGORIAS = {
  producto: {
    texto: 'La comida o el pedido',
    atiende: 'caja',
    motivos: ['Faltó un producto', 'Llegó frío o en mal estado', 'No era lo que pedí', 'Mal preparado o incompleto', 'Me cobraron de más', 'Otro'],
  },
  entrega: {
    texto: 'La entrega o el domiciliario',
    atiende: 'admin',
    motivos: ['Se demoró demasiado', 'El trato del domiciliario', 'No me entregaron el cambio completo', 'Problemas con la ubicación o el chat', 'Otro'],
  },
}

export const ESTADOS = {
  recibido:              { texto: 'Recibido',                    final: false },
  en_revision:           { texto: 'En revisión',                 final: false },
  propuesta:             { texto: 'Solución propuesta',          final: false },
  resuelto:              { texto: 'Resuelto',                    final: true },
  cierre_administrativo: { texto: 'Cerrado por administración',  final: true },
}
export const ABIERTOS = Object.keys(ESTADOS).filter((e) => !ESTADOS[e].final)

// Reembolso (§14.2): solicitado por la caja → autorizado (o rechazado) por
// administración → el cliente elige saldo o transferencia → ejecutado.
export const REEMBOLSO = {
  solicitado: 'Pendiente de autorización',
  autorizado: 'Autorizado',
  rechazado:  'No autorizado',
  elegido:    'Por transferir',
  ejecutado:  'Devuelto',
}

/**
 * ¿Por qué este cliente no puede reportar un problema del pedido? null si sí puede.
 *   'sin_cuenta'   → el pedido no tiene cuenta (lo tomó la caja): primero hay que vincularlo
 *   'no_entregado' → solo se reclama lo entregado
 *   'vencido'      → pasaron más de 24 horas desde la entrega
 */
export function motivoNoReclamable(order, ahora = Date.now()) {
  if (!order?.clientUid) return 'sin_cuenta'
  const { etapa } = etapaDe(order)
  if (etapa !== 'entregado') return 'no_entregado'
  const en = entregadoEn(order)
  if (en == null || ahora - en > PLAZO_RECLAMO_MS) return 'vencido'
  return null
}

export const puedeReclamar = (order, ahora = Date.now()) => motivoNoReclamable(order, ahora) === null

export function textoNoReclamable(motivo) {
  if (motivo === 'sin_cuenta') return 'Para reportar un problema primero vincula el pedido a tu cuenta.'
  if (motivo === 'no_entregado') return 'Podrás reportar un problema cuando el pedido esté entregado.'
  if (motivo === 'vencido') return 'Los problemas se reportan hasta 24 horas después de la entrega. Escríbenos por WhatsApp.'
  return ''
}

/** Limpia y valida lo que escribe el cliente; devuelve los campos o el código del error. */
export function revisarReclamo({ categoria, motivo, descripcion } = {}) {
  if (!CATEGORIAS[categoria]) return { error: 'categoria' }
  const m = String(motivo ?? '').trim()
  if (!CATEGORIAS[categoria].motivos.includes(m)) return { error: 'motivo' }
  const d = String(descripcion ?? '').replace(/\s+/g, ' ').trim()
  if (d.length < 10) return { error: 'descripcion' }
  if (d.length > MAX_DESCRIPCION) return { error: 'largo' }
  return { categoria, motivo: m, descripcion: d, atiende: CATEGORIAS[categoria].atiende }
}

/** Lo que el cliente ve de un reclamo: el equipo trabaja; él espera, decide o ya terminó. */
export function textoParaCliente(r) {
  if (!r) return ''
  if (r.estado === 'recibido') return 'Recibimos tu reporte. Lo estamos revisando.'
  if (r.estado === 'en_revision') return 'Estamos revisando tu caso. Te avisamos apenas tengamos una solución.'
  if (r.estado === 'propuesta') return 'Te propusimos una solución. Dinos si te sirve.'
  if (r.estado === 'resuelto') return 'Caso resuelto. Gracias por contarnos.'
  if (r.estado === 'cierre_administrativo') return 'Administración cerró el caso.'
  return ''
}
