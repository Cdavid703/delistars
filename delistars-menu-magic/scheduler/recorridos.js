// Recorridos de las entregas (especificación §12.1). Lógica pura del scheduler.
//
// Se guarda SOLO el recorrido de cada entrega (en camino y llegó), no todo el
// turno del domiciliario: recorridos/{orderId} con los puntos { lat, lng, t }.
// Lo ve solo administración. Se borra 7 días después de terminada la entrega;
// si el pedido tiene un reclamo abierto, se conserva hasta que se resuelva (y
// si para entonces ya pasaron los 7 días, se borra en la siguiente revisión).

const DIA_MS = 24 * 3600 * 1000
const RETENCION_MS = 7 * DIA_MS
/** Entre dos puntos guardados: al menos 10 s y 10 m (o 60 s aunque esté quieto). */
const MIN_MS = 10 * 1000
const MIN_METROS = 10
const MAX_QUIETO_MS = 60 * 1000
/** Tope de puntos por recorrido (cada 10 s son casi 3 h): no crece sin límite. */
const MAX_PUNTOS = 1000

const ETAPAS_REPARTO = ['en_camino', 'llego']
const RECLAMO_ABIERTO = ['recibido', 'en_revision', 'propuesta']

const ms = (t) => (t?.toMillis ? t.toMillis() : typeof t === 'number' ? t : null)

/** Distancia en metros entre dos puntos (haversine). */
function metros(a, b) {
  const R = 6371000
  const rad = (x) => (x * Math.PI) / 180
  const dLat = rad(b.lat - a.lat)
  const dLng = rad(b.lng - a.lng)
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLng / 2) ** 2
  return 2 * R * Math.asin(Math.sqrt(h))
}

/** ¿El pedido está en reparto (se graba su recorrido)? */
const enReparto = (o) => !!o && o.deliveryMode !== 'pickup' && ETAPAS_REPARTO.includes(o.etapa) &&
  !['cancelado', 'rechazado', 'devuelto'].includes(o.excepcion)

/**
 * Punto nuevo a guardar para este pedido, o null. `ultimo` = el último punto
 * guardado { lat, lng, t } (o null).
 */
function puntoNuevo(o, ultimo, ahora = Date.now()) {
  if (!enReparto(o) || o.driverLat == null || o.driverLng == null) return null
  const lat = Number(o.driverLat), lng = Number(o.driverLng)
  if (!Number.isFinite(lat) || !Number.isFinite(lng) || (lat === 0 && lng === 0)) return null
  const t = ms(o.driverUpdatedAt) ?? ahora
  const p = { lat: Math.round(lat * 1e6) / 1e6, lng: Math.round(lng * 1e6) / 1e6, t }
  if (!ultimo) return p
  if (t - ultimo.t < MIN_MS) return null
  if (metros(ultimo, p) < MIN_METROS && t - ultimo.t < MAX_QUIETO_MS) return null
  return p
}

/** ¿Terminó la entrega? (desde ahí corren los 7 días). Devuelve el ms del fin o null. */
function finDeEntrega(o) {
  if (!o) return null
  if (o.etapa === 'entregado') return ms(o.deliveredAt) ?? ms(o.completedAt) ?? ms(o.updatedAt)
  if (['cancelado', 'rechazado', 'devuelto'].includes(o.excepcion)) return ms(o.devueltoAt) ?? ms(o.cancelledAt) ?? ms(o.updatedAt)
  return null
}

/**
 * ¿Se borra ya este recorrido? `rec` = el documento del recorrido, `pedido` =
 * el pedido (o null si ya no existe). Devuelve 'borrar', 'retener' (reclamo
 * abierto) o 'esperar'.
 */
function decisionRetencion(rec, pedido, ahora = Date.now()) {
  const fin = ms(rec?.terminadoAt) ?? finDeEntrega(pedido)
  // Sin fin conocido: si lleva más de 7 días sin moverse, también se borra.
  const desde = fin ?? ms(rec?.actualizadoAt)
  if (desde == null || ahora - desde < RETENCION_MS) return 'esperar'
  if (pedido && RECLAMO_ABIERTO.includes(pedido.reclamoEstado)) return 'retener'
  return 'borrar'
}

/** Resumen del recorrido para mostrarlo: km recorridos y minutos. */
function resumen(puntos) {
  const p = Array.isArray(puntos) ? puntos : []
  let m = 0
  for (let i = 1; i < p.length; i++) m += metros(p[i - 1], p[i])
  const minutos = p.length > 1 ? Math.round((p[p.length - 1].t - p[0].t) / 60000) : 0
  return { km: Math.round(m / 100) / 10, minutos, puntos: p.length }
}

module.exports = { RETENCION_MS, MAX_PUNTOS, metros, enReparto, puntoNuevo, finDeEntrega, decisionRetencion, resumen }
