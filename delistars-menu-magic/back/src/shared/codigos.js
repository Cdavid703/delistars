// Códigos promocionales del checkout. Módulo puro (sin React) para probarlo
// con node --test.
//
// STAR (campañas Combo Quincena y Combo Parche, octubre 2026): una adición
// de tocineta gratis por pedido, una sola vez por cuenta, y solo si el pedido
// lleva alguno de esos combos.

export const CODIGOS = {
  STAR: {
    descripcion: 'Adición de tocineta gratis',
    linea: '1x Adición Tocineta — código STAR (gratis)',
    combos: ['combo quincena', 'combo parche'],
    // Último día de los combos (Combo Parche, 25 de octubre), hora de Colombia.
    hasta: '2026-10-25',
  },
}

const sinTildes = s => (s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')

/**
 * ¿Se puede usar este código en este pedido?
 * Devuelve { ok: true, codigo } o { ok: false, motivo } (motivo para el cliente).
 */
export function validarCodigo(texto, { items = '', tieneCuenta = false, yaLoUso = false, ahora = Date.now() } = {}) {
  const codigo = (texto || '').trim().toUpperCase()
  const c = CODIGOS[codigo]
  if (!c) return { ok: false, motivo: 'Ese código no existe.' }
  if (ahora >= new Date(`${c.hasta}T00:00:00-05:00`).getTime() + 24 * 60 * 60 * 1000) {
    return { ok: false, motivo: 'Ese código ya venció.' }
  }
  if (!tieneCuenta) return { ok: false, motivo: 'Inicia sesión con tu cuenta para usar el código (es una vez por cuenta).' }
  if (yaLoUso) return { ok: false, motivo: 'Ya usaste este código: es una sola vez por cuenta.' }
  const pedido = sinTildes(items)
  if (!c.combos.some(n => pedido.includes(n))) {
    return { ok: false, motivo: 'Este código sirve solo con el Combo Quincena o el Combo Parche.' }
  }
  return { ok: true, codigo }
}
