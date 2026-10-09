// Ayudas del checkout que salen de la ruta por calle (Google). Módulo puro
// (sin React) para probarlo con node --test.

import { precioDomicilio, RECORRIDO } from './tarifaDomicilio.js'

/** Cuánto más cerca tiene que quedar la otra sede para sugerirla. */
export const MARGEN_OTRA_SEDE_KM = 0.5

/**
 * ¿Le conviene al cliente la otra sede? Solo si queda al menos 500 m más cerca
 * por calle y se le puede despachar desde ahí. Devuelve { km, min, precio,
 * ahorro } o null.
 */
export function sugerirOtraSede({ kmPropia, precioPropio }, otra) {
  if (!otra || !Number.isFinite(otra.km) || !Number.isFinite(kmPropia)) return null
  if (otra.km + MARGEN_OTRA_SEDE_KM > kmPropia) return null
  const t = precioDomicilio(otra.km, RECORRIDO)
  if (t.estado !== 'ok') return null
  return { km: otra.km, min: otra.min ?? null, precio: t.precio, ahorro: Math.max(0, (precioPropio ?? 0) - t.precio) }
}

/**
 * Minutos que tarda en llegar un pedido nuevo: lo que la sede suele tardar en
 * despacharlo (mediana de creado → en camino) más el recorrido por calle.
 * Sin esa mediana se usa la mediana total de la sede (creado → entregado).
 * Devuelve minutos redondeados a 5, o null si no hay con qué estimar.
 */
export function minutosHastaLlegar(statsSede, minRuta) {
  const salida = statsSede?.salidaMedianMin
  let min = null
  if (Number.isFinite(salida) && salida > 0 && Number.isFinite(minRuta)) min = salida + minRuta
  else if (Number.isFinite(statsSede?.medianMin) && statsSede.medianMin > 0) min = statsSede.medianMin
  return min === null ? null : Math.max(10, Math.round(min / 5) * 5)
}
