// Permiso para enviar promociones por correo (Ley 1581 de 2012): el cliente
// lo da de forma expresa y queda registrado con la fecha y desde dónde.
// Se guarda en customers/{uid}.promociones = { acepta, fecha, fuente, email }.
// Módulo puro (sin React) para probarlo con node --test.

/** Si dijo que no, se le vuelve a ofrecer pasado este tiempo. */
export const REOFRECER_TRAS_DIAS = 90

const ms = f => (typeof f?.toMillis === 'function' ? f.toMillis() : Number.isFinite(f) ? f : null)

/**
 * ¿Hay que ofrecerle al cliente recibir promociones?
 *   · nunca respondió                → sí
 *   · ya aceptó                      → no
 *   · dijo que no hace más de 90 días → sí (una vez más)
 */
export function debeOfrecerPromos(promociones, ahora = Date.now()) {
  if (!promociones) return true
  if (promociones.acepta === true) return false
  const cuando = ms(promociones.fecha)
  if (cuando === null) return false // dijo que no hace instantes (fecha aún sin confirmar)
  return ahora - cuando > REOFRECER_TRAS_DIAS * 24 * 60 * 60 * 1000
}
