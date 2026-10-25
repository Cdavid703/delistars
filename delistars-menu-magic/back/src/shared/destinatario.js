// Pedido para otra persona (especificación §7.3).
//
// El comprador conserva su nombre y teléfono; quien recibe tiene los suyos en
// `order.destinatario = { nombre, telefono, paga, token }`:
//   · paga 'comprador':    lo paga quien pidió, ahora, por Transferencia o Nequi.
//   · paga 'destinatario': lo paga quien recibe, en efectivo, al recibirlo.
// Solo para domicilio. Quien recibe tiene un enlace propio (?recibe=<token>)
// con menos permisos que el del comprador: estado, mapa de llegada y lo que
// tiene que pagar (o «No tienes que pagar»). Sin chats, datos de cuenta, medio
// de pago del comprador ni desglose de precios. Vence 3 horas después de que
// el pedido termina.
//
// Este archivo es compartido (misma lógica en la web y en el servidor):
//   - src/utils/destinatario.js                              (web)
//   - delistars-menu-magic/back/src/shared/destinatario.js   (servidor)
// Si cambias uno, copia el otro: tests/etapas.test.mjs comprueba que sean iguales.
import { etapaDe, terminado } from './etapas.js'

export const PAGA = ['comprador', 'destinatario']

/** Cuánto sirve el enlace de quien recibe después de que el pedido termina. */
export const VIGENCIA_ENLACE_MS = 3 * 60 * 60 * 1000

/** Medios de pago según quién paga (null = sin restricción: no es para otra persona). */
export const METODOS_POR_QUIEN_PAGA = {
  comprador:    ['Transferencia', 'Nequi'],
  destinatario: ['Efectivo'],
}

const texto = (v, max) => (typeof v === 'string' ? v.trim().replace(/\s+/g, ' ').slice(0, max) : '')
const diezDigitos = (v) => {
  const d = String(v ?? '').replace(/\D/g, '')
  return d.length >= 10 ? d.slice(-10) : ''
}

function ms(v) {
  if (v == null) return null
  if (typeof v === 'number') return v
  if (v instanceof Date) return v.getTime()
  if (typeof v.toMillis === 'function') return v.toMillis()
  if (typeof v.seconds === 'number') return v.seconds * 1000
  return null
}

/**
 * Revisa los datos de quien recibe. Sin `d` (o `d` vacío) el pedido es para
 * quien lo pide: { ok: true, destinatario: null }.
 * Si algo falta: { ok: false, campo, error } con el texto para mostrar.
 */
export function revisarDestinatario(d, { deliveryMode } = {}) {
  if (!d) return { ok: true, destinatario: null }
  if (deliveryMode !== 'delivery') {
    return { ok: false, campo: 'modo', error: 'Que lo reciba otra persona es solo para domicilio' }
  }
  const nombre = texto(d.nombre, 80)
  if (nombre.length < 2) return { ok: false, campo: 'nombre', error: 'Escribe el nombre de quien recibe' }
  const telefono = diezDigitos(d.telefono)
  if (!telefono) return { ok: false, campo: 'telefono', error: 'El teléfono de quien recibe debe tener 10 dígitos' }
  if (!PAGA.includes(d.paga)) return { ok: false, campo: 'paga', error: 'Elige quién paga el pedido' }
  return { ok: true, destinatario: { nombre, telefono, paga: d.paga } }
}

/** ¿El pedido lo recibe otra persona? */
export const esParaOtro = (order) => !!order?.destinatario?.nombre

/** ¿Lo paga quien recibe, al recibirlo? */
export const pagaQuienRecibe = (order) => esParaOtro(order) && order.destinatario.paga === 'destinatario'

/** Medios de pago que se pueden elegir para este pedido (null = todos). */
export function metodosPermitidos(order) {
  if (!esParaOtro(order)) return null
  return METODOS_POR_QUIEN_PAGA[order.destinatario.paga] ?? null
}

/** Primer nombre, para mostrar sin exponer el nombre completo. */
export const primerNombre = (n) => (typeof n === 'string' ? n.trim().split(/\s+/)[0] || '' : '')

/** ¿Todavía sirve el enlace de quien recibe? En curso, o terminado hace menos de 3 h. */
export function enlaceVigente(order, ahora = Date.now()) {
  if (!esParaOtro(order)) return false
  if (!terminado(order)) return true
  const fin = ms(order.deliveredAt) ?? ms(order.completedAt) ?? ms(order.cancelledAt) ?? ms(order.updatedAt)
  return fin == null || ahora - fin < VIGENCIA_ENLACE_MS
}

/**
 * Lo que ve quien recibe con su enlace. Plata: si paga, solo lo que tiene que
 * pagar, con qué billete y el cambio; si no paga, `noPaga: true`.
 * El mapa (ubicación del domiciliario) solo mientras va en camino.
 */
export function vistaDestinatario(id, order, ahora = Date.now()) {
  const p = order || {}
  const { etapa, excepcion, motivo } = etapaDe(p)
  const paga = pagaQuienRecibe(p)
  const enCamino = etapa === 'en_camino' && !excepcion
  const total = p.totalPrice != null ? Number(p.totalPrice)
    : (p.deliveryPriceAuto && p.deliveryPrice != null && Number(p.quotedPrice) > 0
      ? Number(p.quotedPrice) + Number(p.deliveryPrice) : null)
  return {
    id,
    orderNumber: p.orderNumber ?? null,
    sedeName: p.sedeName ?? null,
    deliveryMode: 'delivery',
    etapa,
    excepcion,
    excepcionMotivo: motivo ?? null,
    status: p.status ?? null,
    recibe: primerNombre(p.destinatario?.nombre),
    envia: primerNombre(p.name),
    direccion: p.fullAddress ?? '',
    domiciliario: primerNombre(p.driverName) || null,
    ubicacion: enCamino && p.driverLat != null && p.driverLng != null
      ? { lat: Number(p.driverLat), lng: Number(p.driverLng), at: ms(p.driverUpdatedAt) }
      : null,
    destino: enCamino && p.addrLat != null && p.addrLng != null
      ? { lat: Number(p.addrLat), lng: Number(p.addrLng) } : null,
    noPaga: !paga,
    aPagar: paga ? total : null,
    billete: paga && p.cashBillAmount != null ? Number(p.cashBillAmount) : null,
    cambio: paga && p.cashChange != null ? Number(p.cashChange) : null,
    venceAt: terminado(p)
      ? (ms(p.deliveredAt) ?? ms(p.completedAt) ?? ms(p.cancelledAt) ?? ahora) + VIGENCIA_ENLACE_MS
      : null,
  }
}

/** Enlace de quien recibe (?recibe=<token>) en el sitio de domicilios. */
export const enlaceDestinatario = (origen, token) => `${origen}/domicilios/?recibe=${encodeURIComponent(token)}`

/** Mensaje que el comprador le manda por WhatsApp a quien recibe. */
export function mensajeParaQuienRecibe(order, url) {
  const quien = primerNombre(order?.name)
  const sede = order?.sedeName ? ` de DeliStars ${order.sedeName}` : ' de DeliStars'
  const pago = pagaQuienRecibe(order)
    ? 'Lo pagas tú en efectivo cuando te llegue.'
    : 'Ya está pago: no tienes que pagar nada.'
  return `Hola ${primerNombre(order?.destinatario?.nombre)}, ${quien ? `${quien} te mandó` : 'te mandaron'} un pedido${sede}. ${pago} Aquí ves cuándo llega: ${url}`
}
