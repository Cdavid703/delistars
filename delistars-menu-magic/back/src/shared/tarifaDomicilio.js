// Tarifa del domicilio según la distancia a la sede.
//
// Desde 2026-10-09 se cobra por RECORRIDO: la distancia que se maneja por
// calle según Google Maps (Routes API, consultada por el backend). La línea
// recta se quedaba corta, sobre todo en Santa Teresita: en la loma de San
// Javier la caja corregía a mano el 28% de los domicilios, siempre hacia
// arriba. Por calle se recorre en promedio 1,4 veces la línea recta.
//
// La tabla en línea recta (definida por Andrés el 2026-09-04) queda como
// RESPALDO: se usa solo si Google no responde o no hay llave configurada, para
// que el cliente siga viendo un precio en vez de quedar esperando a la caja.
//
// El domicilio NUNCA es gratis: aunque el cliente esté a 50 metros, paga la
// primera banda. No existe una banda en cero.
// Módulo puro (sin React) para poder probarlo con node --test.

export const RECORRIDO = 'recorrido'
export const LINEA_RECTA = 'linea_recta'

/** Bandas por recorrido real. `hasta` es inclusivo: 1 km paga $4.000. */
export const TARIFAS_RECORRIDO = [
  { hasta: 1, precio: 4000 },
  { hasta: 2, precio: 5000 },
  { hasta: 3, precio: 6000 },
  { hasta: 4, precio: 7000 },
  { hasta: 5, precio: 8000 },
  { hasta: 6, precio: 9000 },
  { hasta: 7, precio: 10000 },
]

/** Bandas en línea recta (respaldo). `hasta` es inclusivo: 0.8 km paga $4.000. */
export const TARIFAS_LINEA_RECTA = [
  { hasta: 0.8, precio: 4000 },
  { hasta: 2, precio: 5000 },
  { hasta: 3, precio: 6000 },
  { hasta: 4, precio: 7000 },
  { hasta: 5, precio: 8000 },
]

const TABLAS = { [RECORRIDO]: TARIFAS_RECORRIDO, [LINEA_RECTA]: TARIFAS_LINEA_RECTA }

/**
 * Más allá de esto no se hace domicilio: se le ofrece recoger en sede.
 * 7 km por calle equivalen a los 5 km en línea recta de antes.
 */
export const maxKm = (medida = LINEA_RECTA) => TABLAS[medida].at(-1).hasta

/** @deprecated usar maxKm(medida). Tope en línea recta. */
export const MAX_KM = maxKm(LINEA_RECTA)
/** @deprecated usar TARIFAS_LINEA_RECTA. */
export const TARIFAS = TARIFAS_LINEA_RECTA

/**
 * Precio del domicilio para una distancia dada, medida por recorrido o en
 * línea recta (por defecto línea recta, para no cambiarle el precio a quien
 * llame sin decir cómo midió).
 *
 * Devuelve uno de tres estados, y el que llama decide qué mostrar:
 *   'ok'            → hay precio; se le puede cobrar al cliente sin cotizar.
 *   'fuera_de_rango'→ pasa del tope de la tabla; se le ofrece recoger en sede.
 *   'desconocido'   → no se pudo medir la distancia; lo cotiza la caja.
 *
 * Nunca inventa un precio: si no sabe la distancia, lo dice.
 */
export function precioDomicilio(km, medida = LINEA_RECTA) {
  if (km === null || km === undefined || !Number.isFinite(km) || km < 0) {
    return { estado: 'desconocido', precio: null }
  }
  const banda = TABLAS[medida].find(t => km <= t.hasta)
  if (!banda) {
    return { estado: 'fuera_de_rango', precio: null, maxKm: maxKm(medida) }
  }
  return { estado: 'ok', precio: banda.precio, hasta: banda.hasta, medida }
}

/** Texto corto para mostrarle al cliente por qué paga lo que paga. */
export function explicarTarifa(resultado, km) {
  if (!resultado) return ''
  const porCalle = resultado.medida === RECORRIDO ? ' por calle' : ''
  if (resultado.estado === 'ok') {
    return `${km.toFixed(1)} km${porCalle} desde la sede`
  }
  if (resultado.estado === 'fuera_de_rango') {
    return `Estás a ${km.toFixed(1)} km — solo llegamos hasta ${resultado.maxKm} km`
  }
  return 'No pudimos ubicar tu dirección en el mapa'
}

/** La tabla completa, para mostrarla en el panel o en ayuda. */
export const tablaTarifas = (medida = LINEA_RECTA) =>
  TABLAS[medida].map((t, i, tabla) => ({
    desde: i === 0 ? 0 : tabla[i - 1].hasta,
    hasta: t.hasta,
    precio: t.precio,
  }))

/** Distancia en línea recta (haversine) entre dos puntos {lat, lng}, en km. */
export function kmLineaRecta(a, b) {
  const R = 6371
  const rad = x => x * Math.PI / 180
  const dLat = rad(b.lat - a.lat)
  const dLng = rad(b.lng - a.lng)
  const h = Math.sin(dLat / 2) ** 2 +
    Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLng / 2) ** 2
  return R * 2 * Math.asin(Math.sqrt(h))
}

/**
 * Elige con qué distancia se cobra: el recorrido si se pudo medir, y si no la
 * línea recta como respaldo. Devuelve { km, medida } o null sin distancia.
 */
export function distanciaParaCobrar({ kmRecorrido, kmLinea }) {
  if (Number.isFinite(kmRecorrido) && kmRecorrido >= 0) return { km: kmRecorrido, medida: RECORRIDO }
  if (Number.isFinite(kmLinea) && kmLinea >= 0) return { km: kmLinea, medida: LINEA_RECTA }
  return null
}
