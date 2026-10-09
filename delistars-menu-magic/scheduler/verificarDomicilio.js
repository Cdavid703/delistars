// Revisión del precio del domicilio en el servidor.
//
// El precio automático lo calcula el celular del cliente. Si falló la medición
// por calle (y cobró en línea recta), si la app estaba vieja, o si alguien
// manipuló el pedido, el precio puede no cuadrar. El scheduler lo recalcula
// con la ruta por calle (vía backend → Google) y, si no cuadra, le avisa al
// celular de la caja de esa sede antes de que lo acepte.
//
// ESPEJO de src/utils/tarifaDomicilio.js (TARIFAS_RECORRIDO) y de las
// coordenadas de src/services/roles.js (SEDES): mantener sincronizados.

const TARIFAS_RECORRIDO = [
  { hasta: 1, precio: 4000 },
  { hasta: 2, precio: 5000 },
  { hasta: 3, precio: 6000 },
  { hasta: 4, precio: 7000 },
  { hasta: 5, precio: 8000 },
  { hasta: 6, precio: 9000 },
  { hasta: 7, precio: 10000 },
]

const SEDES = {
  santa_lucia:    { name: 'Santa Lucía',    coords: { lat: 6.260435, lng: -75.604912 } },
  santa_teresita: { name: 'Santa Teresita', coords: { lat: 6.244691, lng: -75.613159 } },
}

const precioPorCalle = (km) => {
  const banda = TARIFAS_RECORRIDO.find((t) => km <= t.hasta)
  return banda ? banda.precio : null // null = fuera de cobertura
}

/** ¿Este pedido se debe revisar? Solo domicilios con precio automático y pin. */
function debeRevisarse(o) {
  return !!o && o.deliveryMode === 'delivery' && o.deliveryPriceAuto === true &&
    o.addrLat != null && o.addrLng != null && !!SEDES[o.sedeId]
}

/**
 * Recalcula y compara. `medir(origen, destino)` devuelve { km } o null.
 * Devuelve null si no se pudo revisar, o { cuadra, km, precioCorrecto,
 * precioPedido }.
 */
async function revisarPrecio(o, medir) {
  if (!debeRevisarse(o)) return null
  const ruta = await medir(SEDES[o.sedeId].coords, { lat: Number(o.addrLat), lng: Number(o.addrLng) })
  if (!ruta || !Number.isFinite(ruta.km)) return null
  const precioCorrecto = precioPorCalle(ruta.km)
  const precioPedido = Number(o.deliveryPrice) || 0
  return { cuadra: precioCorrecto === precioPedido, km: ruta.km, precioCorrecto, precioPedido }
}

const fmt = (n) => `$${Math.round(n || 0).toLocaleString('es-CO')}`

/** Aviso para la caja cuando no cuadra. */
function mensajeDescuadre(o, r) {
  const n = o.orderNumber ? ` #${o.orderNumber}` : ''
  const quien = o.name ? ` de ${String(o.name).split(' ')[0]}` : ''
  const correcto = r.precioCorrecto === null
    ? `queda a ${r.km.toFixed(1)} km por calle: fuera de cobertura`
    : `por ${r.km.toFixed(1)} km por calle corresponde ${fmt(r.precioCorrecto)}`
  return {
    rol: 'cashier',
    tipo: 'domicilio',
    title: '⚠️ Revisa el domicilio de un pedido',
    body: `Pedido${n}${quien}: trae domicilio de ${fmt(r.precioPedido)}, pero ${correcto}.`,
  }
}

module.exports = { revisarPrecio, mensajeDescuadre, debeRevisarse, precioPorCalle, TARIFAS_RECORRIDO, SEDES }
