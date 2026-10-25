// Cuadres de efectivo entre domiciliario y caja (especificación §13.2 y §13.3,
// Fase 7). Un movimiento de plata es un documento en cuadres/{id}:
//
//   tipo 'entrega'  el domiciliario le entrega efectivo a la caja (parcial o
//                   final); la caja confirma cuánto recibió de verdad.
//   tipo 'fondo'    la caja le da plata al domiciliario para dar cambio; el
//                   domiciliario confirma cuánto recibió.
//
//   { tipo, sedeId, driverEmail, driverName, monto, montoRecibido, estado,
//     pedidos: [orderId], diferencia, motivo, creadoPor, creadoAt,
//     confirmadoPor, confirmadoAt, correcciones: [{ monto, por, at }],
//     resolucion: { por, at, nota } | null }
//
//   estados: propuesto → confirmado | con_diferencia → resuelto (admin)
//            propuesto → rechazado (fondo que no cuadra) → propuesto (corregido)
//
// Saldo físico que debería tener el domiciliario (§13.3):
//   fondos confirmados + efectivo cobrado − entregas confirmadas (lo recibido).
//
// Este archivo es compartido (misma lógica en la web y en el servidor):
//   - src/utils/cuadres.js                                 (web)
//   - delistars-menu-magic/back/src/shared/cuadres.js      (servidor)
// Si cambias uno, copia el otro: tests/etapas.test.mjs comprueba que sean iguales.

export const TIPOS = { entrega: 'Entrega de efectivo a la caja', fondo: 'Fondo para cambio' }
export const ESTADOS = {
  propuesto:      { texto: 'Por confirmar',  final: false },
  confirmado:     { texto: 'Confirmado',     final: true },
  rechazado:      { texto: 'No cuadra',      final: false },
  con_diferencia: { texto: 'Con diferencia', final: false },
  resuelto:       { texto: 'Resuelto',       final: true },
}
export const PENDIENTES = Object.keys(ESTADOS).filter((e) => !ESTADOS[e].final)

/** Efectivo real cobrado en un pedido (en Mixto solo la parte en efectivo). */
export function efectivoCobrado(o) {
  if (!o) return 0
  const esEfectivo = o.cashOnDelivery || o.payment === 'Efectivo' || o.payment === 'Mixto'
  if (!esEfectivo) return 0
  if (o.payment === 'Mixto' && o.mixtoEfectivo != null && o.mixtoEfectivo !== '') return Number(o.mixtoEfectivo) || 0
  return Number(o.totalPrice) || 0
}

/** ¿Este pedido entregado todavía no se ha cuadrado con la caja? */
export const porCuadrar = (o) => o?.status === 'pending_cuadre'

/** Lo recibido de verdad en un movimiento confirmado (si no se registró, el monto). */
export function montoEfectivo(m) {
  if (!m) return 0
  if (m.estado === 'confirmado' || m.estado === 'con_diferencia' || m.estado === 'resuelto') {
    return Number(m.montoRecibido ?? m.monto) || 0
  }
  return 0
}

/**
 * Cuentas del efectivo de un domiciliario en el turno:
 *   cobrado     efectivo que recibió de los clientes (pedidos en efectivo entregados)
 *   fondos      plata para cambio que la caja le dio y él confirmó
 *   entregado   lo que ya le entregó a la caja y la caja confirmó
 *   enMano      lo que debería tener encima = fondos + cobrado − entregado
 *   porCuadrar  efectivo de pedidos que aún no se han cuadrado
 *   propuesto   entregas que él propuso y la caja no ha confirmado
 *   parciales   entregas parciales (sin pedidos) ya recibidas que ninguna
 *               entrega de cierre ha usado todavía; parcialesIds sus ids
 *   faltaPorCuadrar  porCuadrar − parciales (lo que cierra los pedidos)
 *
 * Una entrega PARCIAL no lleva pedidos. La entrega que completa lo cobrado
 * lleva los pedidos y los ids de las parciales que cuenta (`parciales`), para
 * que la caja cierre los pedidos solo cuando llegó toda la plata.
 */
export function cuentasDelTurno(pedidos, movimientos) {
  const cobrado = (pedidos || []).reduce((s, o) => s + efectivoCobrado(o), 0)
  const porCuadrarMonto = (pedidos || []).filter(porCuadrar).reduce((s, o) => s + efectivoCobrado(o), 0)
  const fondos = (movimientos || []).filter((m) => m.tipo === 'fondo').reduce((s, m) => s + montoEfectivo(m), 0)
  const entregado = (movimientos || []).filter((m) => m.tipo === 'entrega').reduce((s, m) => s + montoEfectivo(m), 0)
  const propuesto = (movimientos || []).filter((m) => m.tipo === 'entrega' && m.estado === 'propuesto').reduce((s, m) => s + (Number(m.monto) || 0), 0)
  const entregas = (movimientos || []).filter((m) => m.tipo === 'entrega')
  const usadas = new Set(entregas.flatMap((m) => (m.estado === 'rechazado' ? [] : m.parciales || [])))
  const abiertas = entregas.filter((m) => !(m.pedidos || []).length && montoEfectivo(m) > 0 && !usadas.has(m.id))
  const parciales = abiertas.reduce((s, m) => s + montoEfectivo(m), 0)
  return {
    cobrado, fondos, entregado, enMano: fondos + cobrado - entregado, porCuadrar: porCuadrarMonto, propuesto,
    parciales, parcialesIds: abiertas.map((m) => m.id).filter(Boolean), faltaPorCuadrar: Math.max(0, porCuadrarMonto - parciales),
  }
}

/** Diferencia entre lo que se esperaba y lo que llegó: >0 sobró, <0 faltó. */
export const diferenciaDe = (monto, recibido) => (Number(recibido) || 0) - (Number(monto) || 0)

export function textoDiferencia(d) {
  if (!d) return 'Cuadra exacto'
  const v = `$${Math.abs(d).toLocaleString('es-CO')}`
  return d > 0 ? `Sobraron ${v}` : `Faltaron ${v}`
}

/** Valida un monto en pesos escrito por una persona. */
export function montoValido(v) {
  const n = typeof v === 'string' ? Number(v.replace(/[^\d]/g, '')) : Number(v)
  return Number.isInteger(n) && n > 0 && n <= 20_000_000 ? n : null
}

/** Entrega a domicilio pagada en digital: no se entrega sin que la caja haya confirmado la plata (§13.1). */
export function transferenciaPendiente(p) {
  if (!p || p.deliveryMode === 'pickup') return false
  if (!['Transferencia', 'Nequi', 'Mixto'].includes(p.payment)) return false
  return !p.transferValidated
}
