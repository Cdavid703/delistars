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
