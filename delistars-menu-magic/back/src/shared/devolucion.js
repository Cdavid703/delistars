// Devoluciones de pedidos pagados por transferencia y saldo a favor.
//
// Si un pedido que el cliente YA pagó por transferencia (o la parte digital de
// un Mixto) se rechaza en caja o lo cancela el cliente, hay que devolverle esa
// plata. El cliente elige cómo:
//   · transferencia de vuelta (deja su cuenta o Nequi), o
//   · saldo a favor en su cuenta para un próximo pedido.
// El saldo solo lo pueden elegir clientes con cuenta de Google (un invitado lo
// perdería al cambiar de celular), vale únicamente en la sede donde pagó y no
// vence. Decisiones del dueño, 2026-09-13.
//
// Módulo puro (sin React ni Firebase) para probarlo con node --test.

const MEDIOS_DIGITALES = ['Transferencia', 'Nequi', 'Mixto']

/** Plata que se le debe devolver al cliente (0 si no pagó nada digital). */
export function montoDevolucion(order) {
  if (!order || !MEDIOS_DIGITALES.includes(order.payment)) return 0
  if (!order.transferReceiptUrl) return 0 // sin comprobante no hubo pago
  const monto = order.payment === 'Mixto'
    ? Number(order.mixtoTransferencia)
    : Number(order.totalPrice)
  return monto > 0 ? monto : 0
}

/** Datos de devolución a guardar en el pedido al rechazarlo o cancelarlo. */
export function devolucionInicial(order) {
  const monto = montoDevolucion(order)
  if (!monto) return null
  return { estado: 'por_elegir', monto, sedeId: order.sedeId || '' }
}

/** ¿Puede este cliente quedarse con saldo a favor? Solo con cuenta de Google. */
export const puedeElegirSaldo = (order) => !!order?.clientEmail

// Estados de la devolución:
//   por_elegir               → el cliente todavía no decide
//   transferencia_solicitada → dejó sus datos; la caja tiene que transferir
//   saldo_solicitado         → pidió saldo; la caja lo acredita
//   transferida / acreditada → resuelta
export const DEVOLUCION_PENDIENTE_CAJA = ['transferencia_solicitada', 'saldo_solicitado']

/** Errores de los datos para la transferencia de vuelta. */
export function erroresDatosDevolucion({ medio, numero, titular }) {
  const errs = []
  if (!medio?.trim())   errs.push('Elige a dónde te transferimos (banco o Nequi)')
  if (!String(numero || '').replace(/\D/g, '')) errs.push('Escribe el número de cuenta o celular')
  if (!titular?.trim()) errs.push('Escribe el nombre del titular de la cuenta')
  return errs
}

/** Saldo disponible de un cliente en una sede. */
export function saldoDisponible(creditos, sedeId) {
  return (creditos || [])
    .filter(c => c.estado === 'disponible' && c.sedeId === sedeId)
    .reduce((s, c) => s + (Number(c.monto) || 0), 0)
}

/**
 * Aplica el saldo a un total. Si el saldo es mayor, lo que sobra vuelve a la
 * cuenta del cliente como un saldo nuevo (lo crea la caja al aceptar).
 */
export function aplicarSaldo(total, saldo) {
  const t = Math.max(0, Number(total) || 0)
  const s = Math.max(0, Number(saldo) || 0)
  const usado = Math.min(t, s)
  return { usado, aPagar: t - usado, sobrante: s - usado }
}
