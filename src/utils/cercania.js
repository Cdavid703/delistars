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

// ─── Pedidos que van para el mismo lado (para la caja al asignar) ────────────

/** Estados en los que un pedido todavía puede salir con el mismo domiciliario. */
export const SIN_SALIR = ['quoted', 'assigned', 'accepted', 'preparing']

/** Distancia (km) del punto P al segmento A→B, en un plano local (sirve en una ciudad). */
function kmAlSegmento(p, a, b) {
  const kx = 111.32 * Math.cos(a.lat * Math.PI / 180) // km por grado de longitud
  const ky = 110.57                                   // km por grado de latitud
  const px = (p.lng - a.lng) * kx, py = (p.lat - a.lat) * ky
  const bx = (b.lng - a.lng) * kx, by = (b.lat - a.lat) * ky
  const largo2 = bx * bx + by * by
  const t = largo2 ? Math.max(0, Math.min(1, (px * bx + py * by) / largo2)) : 0
  return Math.hypot(px - t * bx, py - t * by)
}

/**
 * Otros pedidos de la misma sede, aún sin salir, que convienen llevar con
 * `order`: su destino está cerca (≤ radioKm) o queda de camino (a ≤ desvioKm
 * del trayecto sede → destino, en cualquiera de los dos sentidos). Solo con
 * pin exacto. Devuelve [{ order, metros, deCamino }] del más cercano al más lejano.
 */
export function pedidosMismoLado(order, otros, sedeCoords, { radioKm = 0.6, desvioKm = 0.3 } = {}) {
  const a = geoDelPedido(order)
  if (!a?.exacto) return []
  return otros
    .filter(o => o.id !== order.id && o.sedeId === order.sedeId && o.deliveryMode !== 'pickup' && SIN_SALIR.includes(o.status))
    .map(o => {
      const b = geoDelPedido(o)
      if (!b?.exacto) return null
      const km = kmLineaRecta(a, b)
      const deCamino = !!sedeCoords && (kmAlSegmento(b, sedeCoords, a) <= desvioKm || kmAlSegmento(a, sedeCoords, b) <= desvioKm)
      return km <= radioKm || deCamino ? { order: o, metros: Math.round(km * 1000), deCamino: km > radioKm } : null
    })
    .filter(Boolean)
    .sort((x, y) => x.metros - y.metros)
}
