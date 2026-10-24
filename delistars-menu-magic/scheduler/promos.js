// Campañas de Mercadeo por notificación (especificación §17, Fase 7).
// Reglas puras; el scheduler lee y escribe (ver procesarPromos en index.js).
//
//  - Una campaña con canal «notificación» necesita inicio y fin; solo se
//    envía entre esas fechas y si no está pausada.
//  - Máximo UNA promoción cada 24 h por cuenta, sumando campañas, sedes y
//    canales con cupo (notificación y correo). La franja del menú no gasta cupo.
//  - Si el cliente no tiene cupo, la promoción espera en la cola mientras siga
//    vigente. Con varias esperando: primero la que vence antes; si empatan, la
//    que más lleva en la cola.
//  - Antes de enviar se revisa otra vez: vigencia, pausa y consentimiento.

const H24 = 24 * 60 * 60 * 1000
const SITIO = 'https://delistars.com'

const ms = (t) => {
  if (t == null) return 0
  if (typeof t === 'number') return t
  if (typeof t.toMillis === 'function') return t.toMillis()
  if (typeof t._seconds === 'number') return t._seconds * 1000
  return Number(t) || 0
}

/** ¿La campaña está para enviarse por notificación ahora? */
function pushActiva(c, ahora = Date.now()) {
  if (!c || !c.canales?.push || c.pausada || !c.programada) return false
  const ini = ms(c.vigencia?.inicio), fin = ms(c.vigencia?.fin)
  return !!ini && !!fin && ini <= ahora && ahora < fin
}

/** ¿Va en la franja del menú ahora (para esa sede)? */
function franjaActiva(c, sedeId, ahora = Date.now()) {
  if (!c || !c.canales?.franja || c.pausada || !c.programada) return false
  const ini = ms(c.vigencia?.inicio), fin = ms(c.vigencia?.fin)
  if (!ini || !fin || ahora < ini || ahora >= fin) return false
  return !c.sedeId || !sedeId || c.sedeId === sedeId
}

/** ¿Ya pasó la vigencia? (lo que esté en cola se da por vencido) */
const vencida = (c, ahora = Date.now()) => !c || (ms(c.vigencia?.fin) > 0 && ahora >= ms(c.vigencia.fin))

/** ¿Tiene cupo? (una promoción cada 24 h por cuenta) */
const cupoLibre = (ultimaAt, ahora = Date.now()) => !ultimaAt || ahora - ms(ultimaAt) >= H24
/** Cuándo vuelve a tener cupo. */
const cupoDesde = (ultimaAt) => (ultimaAt ? ms(ultimaAt) + H24 : 0)

/**
 * De lo que un cliente tiene en cola, cuál se envía primero (o null):
 * solo campañas que se pueden enviar ya; vence antes primero; empate → la
 * que lleva más tiempo en cola.
 */
function siguiente(items, campanas, ahora = Date.now()) {
  return items
    .filter((it) => pushActiva(campanas[it.campanaId], ahora))
    .sort((a, b) => ms(campanas[a.campanaId].vigencia.fin) - ms(campanas[b.campanaId].vigencia.fin) || ms(a.creadoAt) - ms(b.creadoAt))[0] || null
}

/** Enlace del destino (abre el menú en el lugar que eligió Mercadeo). */
function enlaceDestino(c, id) {
  const p = new URLSearchParams({ campana: id })
  const d = c.destino || {}
  const sede = d.sedeId || c.sedeId
  if (sede) p.set('sede', sede)
  if (d.tipo === 'producto' && d.id) p.set('producto', String(d.id))
  if (d.tipo === 'categoria' && d.id) p.set('categoria', String(d.id))
  if (d.tipo === 'premios') return `${SITIO}/domicilios/?${p.toString()}&premios=1`
  return `${SITIO}/?${p.toString()}`
}

/** Qué le falta a una campaña para poder programarse por notificación o franja. */
function faltantesProgramar(c) {
  const f = []
  if (!c.canales?.push && !c.canales?.franja) f.push('elegir notificación o franja')
  const ini = ms(c.vigencia?.inicio), fin = ms(c.vigencia?.fin)
  if (!ini || !fin) f.push('la fecha y hora de inicio y de fin')
  else if (fin <= ini) f.push('un fin después del inicio')
  if (c.canales?.push) {
    if (!String(c.push?.titulo || '').trim()) f.push('el título de la notificación')
    if (!String(c.push?.texto || '').trim()) f.push('el texto de la notificación')
  }
  if (c.canales?.franja && !String(c.franja?.texto || '').trim()) f.push('el texto de la franja')
  const d = c.destino || {}
  if (['producto', 'categoria'].includes(d.tipo) && !d.id) f.push(d.tipo === 'producto' ? 'el producto del destino' : 'la categoría del destino')
  return f
}

module.exports = { H24, ms, pushActiva, franjaActiva, vencida, cupoLibre, cupoDesde, siguiente, enlaceDestino, faltantesProgramar }
