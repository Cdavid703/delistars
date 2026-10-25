// Pedido de la caja desde el catálogo (especificación §10.1; 25 oct 2026).
// La caja arma cada producto con las mismas opciones que el menú del cliente
// (las dice el servidor en producto.reglas.ficha) y el servidor lo cobra con
// los precios del menú. Aquí solo se arma y se estima el total para mostrarlo.
// Módulo puro (sin React) para probarlo con node --test.

export const CAT = { adiciones: 5, bebidas: 7, salsas: 8 }

const precio = (v) => Number(v) || 0

/** Adiciones (con precio), salsas y cebollas (adición en $0) del catálogo, sin lo agotado. */
export function opcionesCatalogo(productos, agotados = new Set()) {
  const vivos = (productos || []).filter((p) => p.disponible !== false && !agotados.has(p.id_producto))
  return {
    adiciones: vivos.filter((p) => p.id_categoria === CAT.adiciones && precio(p.precio_venta) > 0),
    salsas: vivos.filter((p) => p.id_categoria === CAT.salsas),
    cebollas: vivos.filter((p) => p.id_categoria === CAT.adiciones && precio(p.precio_venta) === 0),
  }
}

/** Lo que la caja puede vender en esta sede (lo que ve el cliente en el menú, sin opciones sueltas). */
export function vendibles(productos, sedeId) {
  return (productos || []).filter((p) => {
    if (p.disponible === false) return false
    const r = p.reglas
    if (r?.esOpcion) return false
    if (r && !r.visible) return false
    if (r?.soloSedes && !r.soloSedes.includes(sedeId)) return false
    return true
  })
}

/** Selección inicial de un producto: la primera presentación, opción y bebida. */
export function seleccionInicial(p) {
  const ficha = p?.reglas?.ficha || {}
  const promo = p?.reglas?.promo
  return {
    cantidad: 1,
    idPresentacion: p?.presentations?.length ? p.presentations[0].id_presentacion : null,
    opcion: ficha.opcion?.items?.[0] || '',
    bebida: ficha.bebidaCombo?.[0] || '',
    adiciones: {},
    salsas: [],
    cebollas: [],
    unidades: promo ? Array.from({ length: promo.unidades }, () => ({ salsas: [], cebollas: [], bebida: promo.bebidas[0] || '' })) : [],
    nota: '',
  }
}

/** Precio de una unidad (presentación o precio base, más adiciones). */
export function precioUnidad(p, sel, adicionesCat = []) {
  const pres = (p.presentations || []).find((x) => x.id_presentacion === sel.idPresentacion)
  let base = pres ? precio(pres.precio_venta) : precio(p.precio_venta)
  for (const [id, n] of Object.entries(sel.adiciones || {})) {
    const a = adicionesCat.find((x) => x.id_producto === Number(id))
    if (a && n > 0) base += precio(a.precio_venta) * n
  }
  return base
}

/** Qué falta elegir antes de agregarlo (presentación, opción, bebida del combo o de cada unidad). */
export function faltantes(p, sel) {
  const out = []
  const ficha = p?.reglas?.ficha || {}
  if (p.presentations?.length && !sel.idPresentacion) out.push('Elige sabor y tamaño')
  if (ficha.opcion && !ficha.opcion.items.includes(sel.opcion)) out.push(`Elige ${ficha.opcion.titulo || 'una opción'}`)
  if (ficha.bebidaCombo && !ficha.bebidaCombo.includes(sel.bebida)) out.push('Elige la bebida del combo')
  const promo = p?.reglas?.promo
  if (promo && sel.unidades.some((u) => !promo.bebidas.includes(u.bebida))) out.push('Elige la bebida de cada unidad')
  if ((sel.nota || '').length > 250) out.push('El comentario es muy largo')
  return out
}

/** El ítem en el formato de POST /api/v1/pedidos (y /pedidos/caja). */
export function itemApi(p, sel) {
  const item = { id_producto: p.id_producto, cantidad: sel.cantidad }
  if (sel.idPresentacion != null) item.id_presentacion = sel.idPresentacion
  const ads = Object.entries(sel.adiciones || {}).filter(([, n]) => n > 0).map(([id, n]) => ({ id_producto: Number(id), cantidad: n }))
  if (ads.length) item.adiciones = ads
  if (p?.reglas?.promo) {
    item.unidades = sel.unidades.map((u) => ({ salsas: u.salsas, cebollas: u.cebollas, bebida: u.bebida }))
  } else {
    if (sel.salsas.length) item.salsas = sel.salsas
    if (sel.cebollas.length) item.cebollas = sel.cebollas
  }
  if (p?.reglas?.ficha?.opcion) item.opcion = sel.opcion
  if (p?.reglas?.ficha?.bebidaCombo) item.bebida = sel.bebida
  if (sel.nota?.trim()) item.nota = sel.nota.trim()
  return item
}

/** Resumen corto de lo elegido, para la lista del pedido. */
export function resumenItem(p, sel, nombres = {}) {
  const pres = (p.presentations || []).find((x) => x.id_presentacion === sel.idPresentacion)
  const partes = []
  if (pres) partes.push([pres.sabor, pres.tamano].filter(Boolean).join(' '))
  if (sel.opcion && p?.reglas?.ficha?.opcion) partes.push(sel.opcion)
  if (sel.bebida && p?.reglas?.ficha?.bebidaCombo) partes.push(sel.bebida)
  for (const [id, n] of Object.entries(sel.adiciones || {})) if (n > 0) partes.push(`+${n > 1 ? `${n}× ` : ''}${nombres[id] || 'adición'}`)
  const salsas = [...sel.salsas, ...sel.cebollas].map((id) => nombres[id]).filter(Boolean)
  if (salsas.length) partes.push(salsas.join(', '))
  if (sel.unidades?.length) partes.push(sel.unidades.map((u, i) => `${i + 1}: ${u.bebida}`).join(' · '))
  if (sel.nota?.trim()) partes.push(`«${sel.nota.trim()}»`)
  return partes.join(' · ')
}
