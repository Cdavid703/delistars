// Lo que el panel del domiciliario muestra de cada pedido (rediseño aprobado
// el 25 oct 2026): en qué orden van las paradas, en qué paso va cada una y
// qué cobrar. Sin React ni Firebase, para probarlo con node --test.

import { etapaDe } from './etapas.js'
import { cashAmount } from './payments.js'
import { transferenciaPendiente } from './cuadres.js'

export const EN_RUTA = ['accepted', 'preparing', 'in_transit', 'arrived']
export const ENTREGADOS = ['delivered_paid', 'delivered_cash', 'pending_cuadre', 'completed']

export const esEfectivo = (o) => !!(o?.cashOnDelivery || o?.payment === 'Efectivo' || o?.payment === 'Mixto')

/** 0 por recoger · 1 en camino · 2 en el destino · 3 entregado. */
export function pasoReparto(o) {
  if (ENTREGADOS.includes(o?.status)) return 3
  if (o?.status === 'arrived') return 2
  if (o?.status === 'in_transit') return 1
  return 0
}

/**
 * Orden de las paradas: primero lo que ya está en la calle (en el destino, en
 * camino), después el orden que el domiciliario puso («Poner primero», CP-7)
 * y al final por hora de llegada del pedido.
 */
export function ordenarRuta(pedidos, ordenRuta = []) {
  const lugar = (o) => { const i = ordenRuta.indexOf(o.id); return i < 0 ? Infinity : i }
  const calle = (o) => (o.status === 'arrived' ? 0 : o.status === 'in_transit' ? 1 : 2)
  const hora = (o) => o.createdAt?.seconds ?? (o.createdAt?.toMillis ? o.createdAt.toMillis() / 1000 : 0)
  return [...pedidos].sort((a, b) => calle(a) - calle(b) || lugar(a) - lugar(b) || hora(a) - hora(b))
}

/** Etiqueta corta de la etapa, con su tono: 'ok' | 'espera' | 'calle' | 'alerta'. */
export function etiquetaReparto(o) {
  const { etapa, excepcion } = etapaDe(o)
  if (excepcion === 'no_entregado') return { texto: 'No se pudo entregar', tono: 'alerta' }
  if (excepcion === 'regreso_declarado') return { texto: 'Regresando a la sede', tono: 'espera' }
  if (o?.status === 'assigned') return { texto: 'Por aceptar', tono: 'alerta' }
  switch (etapa) {
    case 'en_preparacion': return { texto: 'En cocina', tono: 'espera' }
    case 'listo':          return { texto: 'Listo para recoger', tono: 'ok' }
    case 'en_camino':      return { texto: 'En camino', tono: 'calle' }
    case 'llego':          return { texto: 'En el destino', tono: 'calle' }
    case 'entregado':      return { texto: 'Entregado', tono: 'ok' }
    default:               return { texto: 'Confirmado', tono: 'espera' }
  }
}

/**
 * Qué cobrar al entregar. En efectivo: el monto, el billete con que paga y el
 * cambio (manda lo que registró la caja; si no, lo que dijo el cliente).
 */
export function cobroDe(o) {
  // Sin forma de pago elegida todavía: se cuenta el total, por si acaso.
  if (!o?.payment && !o?.cashOnDelivery) {
    return { efectivo: false, porDefinir: true, monto: Number(o?.totalPrice) || 0, pendiente: false, texto: 'Por definir' }
  }
  if (!esEfectivo(o)) {
    return { efectivo: false, pendiente: transferenciaPendiente(o), texto: transferenciaPendiente(o) ? 'Transferencia por verificar' : 'Ya pagó' }
  }
  const billete = o.payAmount ?? o.cashBillAmount ?? null
  const cambio = o.change ?? o.cashChange ?? null
  const exacto = o.payExact === true || (billete == null && cambio == null)
  return {
    efectivo: true, monto: cashAmount(o), exacto, pendiente: transferenciaPendiente(o),
    billete: exacto ? null : Number(billete) || null,
    cambio: exacto ? null : Number(cambio) || 0,
    mixto: o.payment === 'Mixto',
    texto: o.payment === 'Mixto' ? 'Efectivo (mixto)' : 'Efectivo',
  }
}

export const fmt = v => (v !== undefined && v !== null && v !== '') ? `$${Number(v).toLocaleString('es-CO')}` : '—'

/** A quién se le entrega: si es para otra persona, a ella. */
export const nombreDe = (o) => o?.destinatario?.nombre || o?.name || o?.clientName || 'Cliente'

/** Último mensaje de la caja en las notas del pedido (ms, 0 si no hay). */
export const ultimoDeCaja = (o) => (o?.comments || []).filter((c) => c.role === 'cashier').reduce((m, c) => Math.max(m, c.ts || 0), 0)

/** ¿Puede reportar «No puedo entregar»? Solo en el destino y sin otra excepción. */
export function puedeReportar(o) {
  const { etapa, excepcion } = etapaDe(o)
  return o?.deliveryMode !== 'pickup' && etapa === 'llego' && !excepcion
}

/** Enlace de Maps o Waze hacia el pedido: pin exacto o resuelto; si no, el texto. */
export function urlNavegacion(app, coords, texto = '') {
  if (app === 'waze') {
    return coords ? `https://waze.com/ul?ll=${coords.lat},${coords.lng}&navigate=yes` : `https://waze.com/ul?q=${encodeURIComponent(texto)}&navigate=yes`
  }
  return coords ? `https://www.google.com/maps/dir/?api=1&destination=${coords.lat},${coords.lng}`
    : `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(`${texto}, Medellín, Colombia`)}`
}

// ── Diseño elegido en la app (26 oct 2026): «Por recoger» y «En reparto» ──

/** Cuántos pedidos puede llevar a la vez (§11.3). */
export const MAX_EN_REPARTO = 5

/** 'reparto' si ya salió (en camino o en el destino); si no, 'recoger'. */
export const grupoReparto = (o) => (['in_transit', 'arrived'].includes(o?.status) ? 'reparto' : 'recoger')

/** Cómo va en la cocina, para la lista de «Por recoger». */
export function estadoCocina(o) {
  if (o?.status === 'assigned') return { texto: 'Por aceptar', listo: false }
  const { etapa } = etapaDe(o)
  if (etapa === 'listo') return { texto: 'Listo para llevar', listo: true }
  if (etapa === 'en_preparacion') return { texto: 'En cocina', listo: false }
  if (etapa === 'confirmado') return { texto: 'En cola en la cocina', listo: false }
  return { texto: 'Por confirmar en la sede', listo: false }
}

/** Lo que hay por cobrar entre varios pedidos (los de pago por definir cuentan su total). */
export const porCobrarTotal = (pedidos) => pedidos.reduce((s, o) => {
  const c = cobroDe(o)
  return s + (c.efectivo || c.porDefinir ? c.monto : 0)
}, 0)

/** «1,2 km» si el pedido trae la distancia; si no, null. */
export function kmDe(o) {
  const n = Number(o?.deliveryKm)
  return Number.isFinite(n) && n > 0 ? `${n.toLocaleString('es-CO', { maximumFractionDigits: 1 })} km` : null
}

/** Minutos para llegar, con la misma hora que ve el cliente (etaLlegadaAt). null si no hay. */
export function minutosParaLlegar(o, ahora = Date.now()) {
  if (o?.status !== 'in_transit') return null
  const t = Number(o?.etaLlegadaAt)
  if (o?.etaLlegadaAt == null || !Number.isFinite(t)) return null
  return Math.max(0, Math.round((t - ahora) / 60000))
}
