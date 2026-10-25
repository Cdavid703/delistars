// Agotado por sede (§7.2, P-14; 25 oct 2026). La caja marca un producto
// agotado solo en su sede: agotados/{sedeId} = { ids, nombres } en Firestore.
// Módulo puro (sin React ni Firebase) para probarlo con node --test.

/** Ids del carrito (formato de la API) que están agotados: producto, adiciones, salsas y cebollas. */
export function agotadosDelCarrito(items, agotados) {
  if (!agotados?.size || !Array.isArray(items)) return []
  const ids = new Set()
  const ver = (id) => { if (agotados.has(Number(id))) ids.add(Number(id)) }
  for (const it of items) {
    ver(it?.id_producto)
    for (const a of it?.adiciones || []) ver(a?.id_producto)
    for (const id of [...(it?.salsas || []), ...(it?.cebollas || [])]) ver(id)
    for (const u of it?.unidades || []) for (const id of [...(u?.salsas || []), ...(u?.cebollas || [])]) ver(id)
  }
  return [...ids]
}

/** Nombres para mostrar ("Perro Clásico, Queso"); si falta el nombre, «un producto». */
export const nombresAgotados = (ids, nombres = {}) => ids.map((id) => nombres[String(id)] || 'un producto').join(', ')
