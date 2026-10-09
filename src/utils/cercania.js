// Cercanía del domiciliario a los pedidos que lleva. Módulo puro (sin React)
// para probarlo con node --test.
//
// Cuando el domiciliario pasa cerca de un pedido que tiene en sus manos, se le
// avisa: así no se pasa de largo una entrega que le quedaba de camino.

import { kmLineaRecta } from './tarifaDomicilio.js'

/** A cuántos metros se avisa. */
export const RADIO_AVISO_M = 250

/** Estados en los que el pedido ya va con el domiciliario. */
export const EN_MANOS = ['in_transit']

/**
 * Punto del pedido para el mapa: el pin exacto si el cliente lo marcó, y si
 * no, lo que haya encontrado el buscador por el texto (geoCache).
 */
export function geoDelPedido(order, geoCache = {}) {
  const lat = Number(order?.addrLat)
  const lng = Number(order?.addrLng)
  if (order?.addrLat != null && order?.addrLng != null && Number.isFinite(lat) && Number.isFinite(lng)) {
    return { lat, lng, exacto: true }
  }
  const g = order?.fullAddress ? geoCache[order.fullAddress] : null
  return g ? { lat: g.lat, lng: g.lng, exacto: false } : null
}

/**
 * Pedidos en manos del domiciliario que están a menos de `radioM` de `pos` y
 * a los que todavía no se les avisó. Devuelve [{ order, metros }] del más
 * cercano al más lejano.
 */
export function pedidosCerca(pos, orders, { geoCache = {}, avisados = new Set(), radioM = RADIO_AVISO_M } = {}) {
  if (!pos || !Number.isFinite(pos.lat) || !Number.isFinite(pos.lng)) return []
  return orders
    .filter(o => EN_MANOS.includes(o.status) && !avisados.has(o.id))
    .map(o => {
      const geo = geoDelPedido(o, geoCache)
      return geo ? { order: o, metros: Math.round(kmLineaRecta(pos, geo) * 1000) } : null
    })
    .filter(x => x && x.metros <= radioM)
    .sort((a, b) => a.metros - b.metros)
}
