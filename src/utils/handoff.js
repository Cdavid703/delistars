// Parseo del "handoff" — el paquete que el menú (delistars.com) le entrega a
// la app de domicilios con el carrito del cliente. Módulo puro y sin
// dependencias para poder probarlo con node --test.
//
// Reglas de negocio (nacidas de bugs reales):
// - Un handoff viejo trae precios que ya no son confiables → se descarta
//   (antes no caducaba nunca y precargaba totales de días atrás en la caja).
// - El total se RECALCULA de los ítems; el total guardado es solo respaldo
//   (nunca se confía a ciegas en un número pre-agregado).
// - Cada línea lleva su precio "(= $X)" para que la caja verifique la suma.

export const HANDOFF_TTL_MS = 6 * 60 * 60 * 1000 // 6 horas

// Convierte un ítem del handoff en la línea de texto que ve la caja.
export function handoffItemLine(it) {
  let line = `${it.quantity}x ${it.name}`
  if (it.addons?.length) line += ` (${it.addons.join(', ')})`
  if (it.salsas?.length) line += ` | Salsas: ${it.salsas.join(', ')}`
  if (it.cebollas?.length) line += ` | Cebolla: ${it.cebollas.join(', ')}`
  if (it.notes) line += ` — "${it.notes}"`
  const lineTotal = (Number(it.unitPrice) || 0) * (it.quantity || 1)
  if (lineTotal > 0) line += ` (= $${lineTotal.toLocaleString('es-CO')})`
  return line
}

// Parsea el handoff crudo (string de localStorage). Devuelve:
//   { lines, itemsText, total }  si es válido y vigente
//   { stale: true }              si existe pero ya caducó (el llamador lo borra)
//   null                         si no hay handoff usable (ausente/corrupto/vacío)
export function parseHandoff(raw, now = Date.now()) {
  if (!raw) return null
  let data
  try { data = JSON.parse(raw) } catch { return null }
  const { items, total, savedAt } = data || {}
  if (!Array.isArray(items) || items.length === 0) return null
  if (!savedAt || now - savedAt > HANDOFF_TTL_MS) return { stale: true }

  const lines = items.map(handoffItemLine)
  const computed = items.reduce(
    (s, it) => s + (Number(it.unitPrice) || 0) * (it.quantity || 1), 0,
  )
  return {
    lines,
    itemsText: lines.join('\n'),
    total: computed > 0 ? computed : (Number(total) || 0),
  }
}
