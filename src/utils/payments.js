// Efectivo real cobrado por un pedido. En pago Mixto solo la porción
// `mixtoEfectivo` se cobró en efectivo (el resto fue transferencia); si no se
// registró el desglose se usa el total como respaldo conservador (mejor
// sobrestimar el efectivo a cuadrar que perderlo). Para Efectivo/contraentrega
// es el total; para pagos digitales (Transferencia/Nequi) el llamador filtra
// antes, así que aquí solo importan los pedidos en efectivo/mixto.
export const cashAmount = o =>
  (o.payment === 'Mixto' && o.mixtoEfectivo != null && o.mixtoEfectivo !== '')
    ? (Number(o.mixtoEfectivo) || 0)
    : (o.totalPrice || 0)

// Campos del cambio recalculados para un total nuevo. Cuando la caja corrige
// el precio después de que el cliente dijo con qué billete paga, el cambio
// guardado quedaba calculado sobre el total viejo y el domiciliario salía con
// el cambio equivocado. Recalcula los dos registros que existen: el del
// cliente (cashBillAmount/cashChange) y el de la caja al asignar
// (payAmount/change). Si el billete ya no alcanza, se borra para que nadie
// salga con un cambio inventado. Devuelve solo lo que hay que escribir.
export function cambioParaTotal(order, nuevoTotal) {
  const aCobrar = cashAmount({ ...order, totalPrice: nuevoTotal })
  const out = {}
  if (order.cashBillAmount != null && order.cashBillAmount !== '') {
    const billete = Number(order.cashBillAmount)
    Object.assign(out, billete >= aCobrar
      ? { cashChange: billete - aCobrar }
      : { cashBillAmount: null, cashChange: null })
  }
  if (order.payExact === false && order.payAmount != null && order.payAmount !== '') {
    const billete = Number(order.payAmount)
    Object.assign(out, billete >= aCobrar
      ? { change: billete - aCobrar }
      : { payAmount: null, change: null })
  }
  return out
}
