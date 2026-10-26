// Centro de avisos (Fase 6, especificación §18). Lógica pura del scheduler.
//
// Cada aviso se guarda en avisos/{destino}/items/{evento}:
//   destino = uid del cliente, correo del equipo o caja_<sede> (compartido por
//   la caja de esa sede). El id es el EVENTO: si el scheduler reintenta o se
//   reinicia, el mismo evento no crea un segundo aviso ni un segundo push.

const URL_WEB = 'https://delistars.com'

/** Enlace universal del pedido (abre la app si está instalada; si no, la web). */
const enlacePedido = (id) => `${URL_WEB}/p/${id}`

const destinoCaja = (sedeId) => (sedeId ? `caja_${sedeId}` : null)

/** Id del documento: solo letras, números, - y _ (y no muy largo). */
function idEvento(...partes) {
  return partes.filter((p) => p !== undefined && p !== null && p !== '')
    .map((p) => String(p).toLowerCase().replace(/[^a-z0-9_-]+/g, '-'))
    .join('_').slice(0, 300)
}

/**
 * Mensaje nuevo en el chat del pedido (clientMessages): quién lo escribió.
 * Devuelve { de: 'cliente' | 'caja', n, texto } o null.
 */
function mensajeNuevo(antes, o) {
  const msgs = Array.isArray(o?.clientMessages) ? o.clientMessages : []
  if (antes == null || msgs.length <= antes) return null
  const ultimo = msgs[msgs.length - 1] || {}
  const de = ultimo.role === 'client' ? 'cliente' : ultimo.role === 'cashier' ? 'caja' : null
  if (!de) return null
  // Un mensaje puede ser solo una foto (§8.3).
  const base = String(ultimo.text || '').trim()
  const texto = ultimo.foto ? (base ? `📷 ${base}` : '📷 Foto') : base
  return { de, n: msgs.length, texto: texto.length > 120 ? `${texto.slice(0, 117)}…` : texto }
}

/** ¿Un domicilio confirmado lleva más de `esperaMin` sin domiciliario? (aviso al admin) */
function sinDomiciliarioDemasiado(o, ahora = Date.now(), esperaMin = 10) {
  if (!o || o.deliveryMode === 'pickup' || o.driverEmail || o.status !== 'quoted' || !o.sinDomiciliario) return false
  const desde = o.quotedAt?.toMillis?.() ?? (typeof o.quotedAt === 'number' ? o.quotedAt : null)
  return desde != null && ahora - desde >= esperaMin * 60000
}

/** ¿Un cambio propuesto lleva más de `esperaMin` sin respuesta del cliente? (aviso a la caja, §9.2) */
function sinRespuestaDemasiado(o, ahora = Date.now(), esperaMin = 10) {
  if (!o || o.excepcion !== 'cambio_pendiente' || o.cambioPropuesto?.estado !== 'pendiente') return false
  const desde = o.cambioPropuesto.propuestoAt?.toMillis?.() ?? (typeof o.cambioPropuesto.propuestoAt === 'number' ? o.cambioPropuesto.propuestoAt : null)
  return desde != null && ahora - desde >= esperaMin * 60000
}

/** Mensajes para el servicio de push de Expo (la app). */
// Categoría de notificación por tipo de aviso (W-8). La app (y el Apple Watch)
// registran estas categorías para mostrar su propia notificación con acceso al
// pedido; si una no está registrada, el aviso sale normal.
const CATEGORIA_EXPO = {
  cambio: 'cambio_pedido',
  reclamo: 'reclamo',
  mensaje: 'mensaje_pedido',
  pedido: 'estado_pedido',
  // CarPlay (CP-2): la instrucción de la caja se puede mostrar en el carro.
  instruccion: 'instruccion_caja',
}

/**
 * Mensajes para Expo. `datos` (W-8): { orderId, tipo, reclamoId, propuestaId, instruccion } van en
 * `data` junto al enlace, y el tipo elige la categoría (categoryId).
 */
function mensajesExpo(tokens, msg, url, datos = {}) {
  const tipo = datos.tipo || msg.tipo || 'pedido'
  const data = { url, tipo }
  if (datos.orderId) data.orderId = String(datos.orderId)
  if (datos.reclamoId) data.reclamoId = String(datos.reclamoId)
  if (datos.propuestaId) data.propuestaId = String(datos.propuestaId)
  if (datos.instruccion) data.instruccion = String(datos.instruccion)
  const categoryId = CATEGORIA_EXPO[tipo]
  return tokens.map((to) => ({ to, title: msg.title, body: msg.body, sound: 'default', data, ...(categoryId ? { categoryId } : {}) }))
}

/** Tokens de Expo que Expo dice que ya no existen (desinstalaron la app). */
function expoMuertos(tokens, respuesta) {
  const datos = Array.isArray(respuesta?.data) ? respuesta.data : []
  return tokens.filter((_, i) => datos[i]?.status === 'error' && datos[i]?.details?.error === 'DeviceNotRegistered')
}

module.exports = { URL_WEB, enlacePedido, destinoCaja, idEvento, mensajeNuevo, sinDomiciliarioDemasiado, sinRespuestaDemasiado, mensajesExpo, expoMuertos, CATEGORIA_EXPO }
