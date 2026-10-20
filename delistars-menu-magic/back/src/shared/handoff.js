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
  // Combos de promoción: cada hamburguesa/perro en su propia línea, debajo.
  if (Array.isArray(it.unidades)) {
    for (const u of it.unidades) if (u) line += `\n   ↳ ${u}`
  }
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

// El carrito del menú (localStorage 'ds_cart_items') guarda el objeto completo
// del producto; el handoff guarda solo lo que la caja necesita. Esta función
// traduce de uno a otro para poder RESCATAR el pedido cuando el handoff falta
// o caducó pero el carrito del menú sigue vivo — el caso del cliente que arma
// su carrito antes de que abra la plataforma y vuelve horas después.
export const CART_TTL_MS = 12 * 60 * 60 * 1000 // igual que el menú

function cartItemToHandoffItem(it) {
  const p = it.product || {}
  let name = p.nombre_producto || ''
  if (it.presentation) {
    const { sabor, tamano, base } = it.presentation
    name = `${name} (${sabor}, ${tamano}${base ? `, ${base}` : ''})`
  } else if (it.selectedDrink) {
    name = `${name} + ${it.selectedDrink}`
  } else if (it.selectedOption) {
    name = `${name} (${it.selectedOption})`
  }
  return {
    name,
    quantity:  it.quantity || 1,
    unitPrice: Number(it.unitPrice) || 0,
    addons:    (it.addons   || []).map(a => `Adición + ${a.name}`),
    salsas:    (it.salsas   || []).map(s => s.name),
    cebollas:  (it.cebollas || []).map(c => c.name),
    notes:     it.notes || '',
    unidades:  Array.isArray(it.unidadesTexto) ? it.unidadesTexto : undefined,
  }
}

// Parsea el carrito del menú con el mismo formato de salida que parseHandoff.
export function parseMenuCart(raw, now = Date.now()) {
  if (!raw) return null
  let data
  try { data = JSON.parse(raw) } catch { return null }
  const items = data?.items
  if (!Array.isArray(items) || items.length === 0) return null
  if (now - (data.savedAt || 0) > CART_TTL_MS) return null

  const conv = items.map(cartItemToHandoffItem).filter(i => i.name)
  if (conv.length === 0) return null
  const lines = conv.map(handoffItemLine)
  return {
    lines,
    itemsText: lines.join('\n'),
    total: conv.reduce((s, it) => s + it.unitPrice * it.quantity, 0),
    recovered: true, // vino del carrito del menú, no del handoff
  }
}

// ── Productos para la API de pedidos (Fase 4) ─────────────────────────────
// El servidor arma y cobra el pedido con los ids del catálogo (nunca con los
// precios ni los textos del navegador). Salen del carrito del menú
// ('ds_cart_items'), que guarda el producto completo con sus ids.
const contarAdiciones = (addons = []) => {
  const porId = new Map()
  for (const a of addons) if (a?.id != null) porId.set(a.id, (porId.get(a.id) || 0) + 1)
  return [...porId].map(([id_producto, cantidad]) => ({ id_producto, cantidad }))
}

/** Un ítem del carrito del menú → ítem de POST /api/v1/pedidos (o null si falta información). */
export function itemParaApi(it) {
  const id = it?.product?.id_producto
  if (!Number.isInteger(id)) return null
  const item = { id_producto: id, cantidad: it.quantity || 1 }
  if (it.presentation?.id_presentacion != null) item.id_presentacion = it.presentation.id_presentacion
  const adiciones = contarAdiciones(it.addons)
  if (adiciones.length) item.adiciones = adiciones
  if (it.salsas?.length) item.salsas = it.salsas.map(s => s.id)
  if (it.cebollas?.length) item.cebollas = it.cebollas.map(c => c.id)
  if (it.selectedOption) item.opcion = it.selectedOption
  if (it.selectedDrink) item.bebida = it.selectedDrink
  if (it.notes?.trim()) item.nota = it.notes.trim()
  // Combo de promoción: cada unidad con los ids de sus salsas y cebolla. Los
  // carritos armados antes de este cambio solo traen el texto: hay que rearmarlos.
  if (Array.isArray(it.unidades)) {
    if (!Array.isArray(it.unidadesIds) || it.unidadesIds.length !== it.unidades.length) return null
    item.unidades = it.unidadesIds.map(u => ({ salsas: u.salsas || [], cebollas: u.cebollas || [], bebida: u.bebida }))
  }
  return item
}

/**
 * El carrito del menú listo para la API:
 *   { items, rearmar: [nombres] }  — `rearmar` = productos que hay que volver a armar en el menú
 *   null                           — no hay carrito vigente
 */
export function carritoParaApi(raw, now = Date.now()) {
  if (!raw) return null
  let data
  try { data = JSON.parse(raw) } catch { return null }
  const lista = data?.items
  if (!Array.isArray(lista) || lista.length === 0) return null
  if (now - (data.savedAt || 0) > CART_TTL_MS) return null
  const items = []
  const rearmar = []
  for (const it of lista) {
    const item = itemParaApi(it)
    if (item) items.push(item)
    else rearmar.push(it?.product?.nombre_producto || 'Un producto')
  }
  return { items, rearmar }
}
