// Productos de temporada: aparecen en el menú solo hasta su fecha de fin.
//
// Antes esto se manejaba a mano: alguien tenía que acordarse de entrar al panel
// y marcar el producto como no disponible. Si se olvidaba, quedaba una promo de
// septiembre pedible en noviembre. Ahora el menú los esconde solo.
//
// El producto NO se borra de la base: sigue ahí con su foto y su descripción.
// Para revivirlo el próximo año basta con mover la fecha de esta lista.
//
// ⚠️ La fecha lleva el desfase de Colombia (-05:00) a propósito. Con una fecha
// "pelada" el navegador la interpreta en UTC, y en Colombia el día UTC cambia a
// las 7:00 PM: la promoción se moriría en plena jornada de servicio.

import { normalizarNombre } from "./destacados";

/** Amor y Amistad: se celebra en septiembre, así que muere al entrar octubre. */
export const FIN_AMOR_Y_AMISTAD = new Date("2026-10-01T00:00:00-05:00");

/** Nombre del producto (como está en el menú) → hasta cuándo se muestra. */
export const TEMPORADA: Record<string, Date> = {
  "combo amor": FIN_AMOR_Y_AMISTAD,
  "combo amistad": FIN_AMOR_Y_AMISTAD,
};

/**
 * ¿Este producto se puede mostrar ahora?
 * Los que no son de temporada siempre pasan; los de temporada, solo antes de
 * su fecha de fin. `ahora` se puede pasar para probarlo.
 */
export function vigente(nombreProducto: string, ahora: number = Date.now()): boolean {
  const fin = TEMPORADA[normalizarNombre(nombreProducto)];
  return !fin || ahora < fin.getTime();
}

/** Los de temporada que están vivos ahora (para el popup). */
export const hayTemporadaActiva = (ahora: number = Date.now()) =>
  Object.values(TEMPORADA).some((fin) => ahora < fin.getTime());
