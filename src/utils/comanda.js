// Comanda de cocina (especificación §19, Fase 7). Módulo puro, copiado igual
// en el servidor (back/src/shared/comanda.js).
//
// La caja pide imprimir; el trabajo queda en impresiones/{id} y el puente (un
// Chrome en el computador de la impresora) lo toma y lo imprime:
//
//   pendiente → enviando → enviada          (Enviada no certifica que salió papel)
//                        → error            (la caja confirma reintento)
//   pendiente que espera más de 10 min → pendiente_reintento (no sale sola)
//   enviando sin respuesta 2 min → la caja revisa el papel: salió o reintentar
//   cualquiera sin terminar → descartada (la caja la quita de la cola)
//
// El pedido guarda un resumen en `comanda` { version, estado, impresionId, tipo, at }
// y si el pedido cambió después de imprimir, la comanda queda «desactualizada».

export const ESTADOS_IMPRESION = {
  pendiente: 'En cola de impresión',
  enviando: 'Imprimiendo…',
  enviada: 'Enviada a impresión',
  error: 'Error de impresión',
  pendiente_reintento: 'Pendiente de reintento',
  descartada: 'Descartada',
}
/** Trabajos que todavía pueden salir por la impresora. */
export const EN_COLA = ['pendiente', 'enviando', 'pendiente_reintento']
/** Un trabajo que esperó más que esto no se imprime solo: la caja lo confirma. */
export const ANTIGUA_MS = 10 * 60 * 1000
/** Tomado por el puente y sin resultado en este tiempo: la caja revisa el papel. */
export const AMBIGUO_MS = 2 * 60 * 1000

/** Estado de la comanda de un pedido para mostrar en la caja. */
export function estadoComanda(o) {
  const c = o?.comanda
  if (!c?.estado || c.estado === 'descartada') return 'sin_imprimir'
  if (c.estado === 'enviada' && (Number(o.version) || 1) > (Number(c.version) || 1)) return 'desactualizada'
  return c.estado
}
export const TEXTO_ESTADO_COMANDA = {
  sin_imprimir: 'Sin imprimir',
  desactualizada: 'Comanda desactualizada: el pedido cambió',
  ...ESTADOS_IMPRESION,
}

/** ¿Este trabajo «enviando» lleva demasiado sin respuesta del puente? */
export const ambiguo = (j, ahora = Date.now()) =>
  j?.estado === 'enviando' && ahora - Number(j.tomadaAt || 0) > AMBIGUO_MS

/** Productos sin el precio de cada línea (la cocina no lo necesita). */
export function lineasProductos(items) {
  return String(items || '')
    .split('\n')
    .map((l) => l.replace(/\s*\(= \$[\d.,]+\)\s*$/, '').trimEnd())
    .filter((l) => l.trim())
}

const pesos = (n) => `$${(Number(n) || 0).toLocaleString('es-CO')}`
const horaCol = (ms) => {
  if (!ms) return ''
  const d = new Date(Number(ms) - 5 * 3600 * 1000)
  return `${String(d.getUTCHours()).padStart(2, '0')}:${String(d.getUTCMinutes()).padStart(2, '0')}`
}
const msDe = (t) => (t?.toMillis ? t.toMillis() : t?._seconds ? t._seconds * 1000 : Number(t) || 0)

/**
 * Contenido de la comanda (§19.1): número, hora, modalidad, productos con
 * opciones y notas, subtotal, domicilio, premios y total. Sin dirección,
 * teléfono ni datos de cobro. Devuelve líneas { t, e } con e = 'titulo' |
 * 'grande' | 'negrita' | 'linea' | undefined (normal).
 *
 * @param {Record<string, any>} o pedido
 * @param {{ tipo?: string, motivo?: string | null, prueba?: boolean, ahora?: number }} [opciones]
 * @returns {{ t: string, e?: string }[]}
 */
export function contenidoComanda(o, { tipo = 'original', motivo = null, prueba = false, ahora = Date.now() } = {}) {
  const L = []
  const add = (t, e) => L.push(e ? { t, e } : { t })
  if (prueba) add('*** PRUEBA — NO PREPARAR ***', 'negrita')
  if (tipo === 'copia') add(`COPIA${motivo ? ` — ${motivo}` : ''}`, 'negrita')
  if (tipo === 'actualizada') add(`ACTUALIZADA — versión ${Number(o.version) || 1}: reemplaza la anterior`, 'negrita')
  if (tipo === 'prueba') {
    add('DeliStars', 'titulo')
    add('Página de prueba de la impresora', 'negrita')
    add(`Impresa a las ${horaCol(ahora)}`)
    add('', 'linea')
    add('Si lees esto, el puente de impresión funciona.')
    return L
  }
  add(`#${o.orderNumber || '—'}`, 'titulo')
  add(o.deliveryMode === 'pickup' ? 'RECOGE EN SEDE' : 'DOMICILIO', 'grande')
  const creado = horaCol(msDe(o.createdAt))
  add(`${creado ? `Pedido ${creado} · ` : ''}Impresa ${horaCol(ahora)}`)
  if (o.name || o.clientName) add(`Cliente: ${o.name || o.clientName}`)
  add('', 'linea')
  for (const l of lineasProductos(o.items)) add(l, l.startsWith(' ') ? undefined : 'negrita')
  if (o.notes) { add('', 'linea'); add(`Nota: ${o.notes}`, 'negrita') }
  add('', 'linea')
  const sub = Number(o.quotedPrice) || 0
  add(`Subtotal  ${pesos(sub)}`)
  if (o.deliveryMode !== 'pickup' && o.deliveryPrice != null) add(`Domicilio  ${pesos(o.deliveryPrice)}`)
  const premios = Number(o.loyaltyRedemption?.count) || 0
  if (premios) add(`Premios  ${premios} gratis (no cobrar)`)
  const total = Number(o.totalPrice) || sub + (Number(o.deliveryPrice) || 0)
  add(`TOTAL  ${pesos(total)}`, 'grande')
  return L
}

/** Las mismas líneas como texto plano (para guardar y para pruebas). */
export const textoComanda = (lineas) =>
  lineas.map((l) => (l.e === 'linea' ? '-'.repeat(32) : l.t)).join('\n')
