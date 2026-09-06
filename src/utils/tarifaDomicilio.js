// Tarifa del domicilio según la distancia a la sede.
//
// Definida por Andrés el 2026-09-04. La distancia es en LÍNEA RECTA desde la
// sede hasta el punto del cliente (la misma que ya calcula la caja), no el
// recorrido real: manejando siempre es más, por las lomas y los sentidos únicos.
//
// Medido contra 303 pedidos reales de Santa Lucía con pin exacto: coincide con
// lo que la caja cobró en el 67% de los casos y factura 4% menos que hoy. La
// primera banda se acortó de 1 km a 0,8 km justamente para achicar esa brecha:
// con 1 km eran 6% menos.
//
// El domicilio NUNCA es gratis: aunque el cliente esté a 50 metros, paga la
// primera banda. No existe una banda en cero.
// Módulo puro (sin React) para poder probarlo con node --test.

/** Más allá de esto no se hace domicilio: se le ofrece recoger en sede. */
export const MAX_KM = 5

/** Bandas por distancia. `hasta` es inclusivo: 0.8 km paga $4.000. */
export const TARIFAS = [
  { hasta: 0.8, precio: 4000 },
  { hasta: 2, precio: 5000 },
  { hasta: 3, precio: 6000 },
  { hasta: 4, precio: 7000 },
  { hasta: 5, precio: 8000 },
]

/**
 * Precio del domicilio para una distancia dada.
 *
 * Devuelve uno de tres estados, y el que llama decide qué mostrar:
 *   'ok'            → hay precio; se le puede cobrar al cliente sin cotizar.
 *   'fuera_de_rango'→ pasa de MAX_KM; se le ofrece recoger en sede.
 *   'desconocido'   → no se pudo medir la distancia; lo cotiza la caja.
 *
 * Nunca inventa un precio: si no sabe la distancia, lo dice.
 */
export function precioDomicilio(km) {
  if (km === null || km === undefined || !Number.isFinite(km) || km < 0) {
    return { estado: 'desconocido', precio: null }
  }
  const banda = TARIFAS.find(t => km <= t.hasta)
  if (!banda) {
    return { estado: 'fuera_de_rango', precio: null, maxKm: MAX_KM }
  }
  return { estado: 'ok', precio: banda.precio, hasta: banda.hasta }
}

/** Texto corto para mostrarle al cliente por qué paga lo que paga. */
export function explicarTarifa(resultado, km) {
  if (!resultado) return ''
  if (resultado.estado === 'ok') {
    return `${km.toFixed(1)} km desde la sede`
  }
  if (resultado.estado === 'fuera_de_rango') {
    return `Estás a ${km.toFixed(1)} km — solo llegamos hasta ${MAX_KM} km`
  }
  return 'No pudimos ubicar tu dirección en el mapa'
}

/** La tabla completa, para mostrarla en el panel o en ayuda. */
export const tablaTarifas = () =>
  TARIFAS.map((t, i) => ({
    desde: i === 0 ? 0 : TARIFAS[i - 1].hasta,
    hasta: t.hasta,
    precio: t.precio,
  }))
