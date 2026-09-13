// Pago al enviar el pedido.
//
// Cuando el valor del pedido ya se conoce al hacer el checkout, el cliente paga
// de una vez: elige el medio, sube el comprobante o dice con qué billete paga.
// A la caja le llega el pedido COMPLETO y solo tiene que darle "Aceptar".
//
// El valor se conoce cuando:
//   · los productos vienen del menú web (precio calculado), y
//   · es "recoger en sede" (no hay domicilio), o el domicilio salió automático
//     por distancia y el cliente no pidió que la caja lo revise.
// Si falta cualquiera de las dos cosas, sigue el flujo de siempre: la caja
// cotiza y el cliente paga después.
//
// Módulo puro (sin React ni Firebase) para probarlo con node --test.

export const METODOS = ['Efectivo', 'Transferencia', 'Nequi', 'Mixto']

/** Medios que requieren comprobante de transferencia. */
export const llevaComprobante = (metodo) => ['Transferencia', 'Nequi', 'Mixto'].includes(metodo)

/** ¿El cliente puede (y debe) pagar al enviar el pedido? */
export function aplicaPagoAdelantado({ fromMenu, menuTotal, deliveryMode, domicilioAutomatico }) {
  if (!fromMenu || !(Number(menuTotal) > 0)) return false
  if (deliveryMode === 'pickup') return true
  return deliveryMode === 'delivery' && !!domicilioAutomatico
}

/** Total a pagar: productos + domicilio (0 si recoge en sede). */
export function totalAPagar({ menuTotal, deliveryMode, precioDomicilio }) {
  const productos = Number(menuTotal) || 0
  const domicilio = deliveryMode === 'pickup' ? 0 : (Number(precioDomicilio) || 0)
  return productos + domicilio
}

/**
 * Errores que impiden enviar el pedido con pago adelantado.
 * `billete`: con cuánto paga en efectivo. `comprobante`: el archivo elegido.
 */
export function erroresPago({ metodo, total, billete, mixtoEfectivo, mixtoTransferencia, comprobante }) {
  const errs = []
  if (!METODOS.includes(metodo)) {
    errs.push('Elige cómo vas a pagar')
    return errs
  }
  if (metodo === 'Efectivo') {
    const b = Number(billete)
    if (!(b > 0)) errs.push('Dinos con qué billete vas a pagar, o elige "Exacto"')
    else if (b < total) errs.push('El billete no alcanza para el total del pedido')
  }
  if (metodo === 'Mixto') {
    const ef = Number(mixtoEfectivo) || 0
    const tr = Number(mixtoTransferencia) || 0
    if (!(ef > 0) || !(tr > 0)) errs.push('Indica cuánto pagas en efectivo y cuánto por transferencia')
    else if (ef + tr !== total) {
      errs.push(`Efectivo + transferencia debe sumar el total ($${total.toLocaleString('es-CO')})`)
    }
  }
  if (llevaComprobante(metodo) && !comprobante) {
    errs.push('Sube el comprobante de la transferencia para enviar el pedido')
  }
  return errs
}

/**
 * Campos del pedido. Son los MISMOS que escribía el cliente al pagar después
 * de la cotización, para que la caja, el domiciliario, el aviso de cambio y el
 * cuadre no noten diferencia.
 */
export function camposPago({ metodo, total, precioProductos, precioDomicilio, billete, mixtoEfectivo, mixtoTransferencia }) {
  const esMixto    = metodo === 'Mixto'
  const esEfectivo = metodo === 'Efectivo'
  return {
    pagoAdelantado: true,
    payment:        metodo,
    cashOnDelivery: esEfectivo || esMixto,
    quotedPrice:    Number(precioProductos) || 0,
    deliveryPrice:  Number(precioDomicilio) || 0,
    totalPrice:     total,
    ...(esMixto
      ? { mixtoEfectivo: String(mixtoEfectivo), mixtoTransferencia: String(mixtoTransferencia) }
      : {}),
    ...(esEfectivo
      ? { cashBillAmount: Number(billete), cashChange: Number(billete) - total }
      : {}),
  }
}
