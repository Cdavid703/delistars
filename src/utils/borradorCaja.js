// Borrador del pedido que arma la caja por catálogo (especificación §21.1).
// Si se va la conexión o se recarga la página, el pedido a medio armar no se
// pierde: queda en el aparato. Al recuperarlo se revisa contra el menú actual
// y se señala lo que cambió (precio, agotado, ya no está) antes de seguir.
// Nunca se envía solo: la caja lo revisa y toca «Crear pedido».

import { precioUnidad } from './catalogoCaja.js'

export const VIGENCIA_BORRADOR_MS = 12 * 60 * 60 * 1000

/** Lo que se guarda de cada línea: el id del producto, cómo lo armó y su precio por unidad en ese momento. */
export function lineasParaGuardar(lineas, adiciones) {
  return (lineas || []).map((l) => ({
    id: l.p.id_producto, nombre: l.p.nombre_producto, sel: l.sel, unidad: precioUnidad(l.p, l.sel, adiciones),
  }))
}

/** ¿Vale la pena guardar? (algo escrito o algún producto). */
export const borradorConAlgo = (b) => !!(b && (b.lineas?.length || b.cliente?.nombre?.trim() || b.cliente?.telefono?.trim()))

/** ¿Sigue vigente este borrador? (menos de 12 h). */
export const borradorVigente = (b, ahora = Date.now()) => borradorConAlgo(b) && typeof b.at === 'number' && ahora - b.at < VIGENCIA_BORRADOR_MS

/**
 * Rearma las líneas con el menú de AHORA y dice qué cambió:
 *   { lineas: [{ key, p, sel }], cambios: ['Hamburguesa: $20.000 → $22.000', 'Ya no está en el menú: X', 'Se agotó: Y'] }
 */
export function recuperarLineas(guardadas, productos, adiciones, agotados = new Set()) {
  const pesos = (n) => `$${Math.round(Number(n) || 0).toLocaleString('es-CO')}`
  const lineas = []
  const cambios = []
  ;(guardadas || []).forEach((g, i) => {
    const p = (productos || []).find((x) => x.id_producto === g.id && x.disponible !== false)
    if (!p) { cambios.push(`Ya no está en el menú: ${g.nombre} (lo quitamos)`); return }
    lineas.push({ key: `${g.id}-${i}-recuperado`, p, sel: g.sel })
    const ahora = precioUnidad(p, g.sel, adiciones)
    if (g.unidad != null && ahora !== g.unidad) cambios.push(`${p.nombre_producto}: ${pesos(g.unidad)} → ${pesos(ahora)}`)
    if (agotados.has(p.id_producto)) cambios.push(`Se agotó: ${p.nombre_producto}`)
  })
  return { lineas, cambios }
}
