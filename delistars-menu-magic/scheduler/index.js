// Tareas de fondo de DeliStars: estadísticas, avisos push, revisión de precios,
// audiencia y campañas de Mercadeo, y la bandera vieja de apertura (los
// horarios reales por sede viven en config/horarios). Escribe con una cuenta de
// Firebase dedicada con permisos MUY limitados (ver isAutoOpenBot en
// firestore.rules) y lee con una cuenta de servicio de solo lectura.
const { initializeApp } = require('firebase/app')
const { getAuth, signInWithEmailAndPassword } = require('firebase/auth')
const { getFirestore, doc, getDoc, setDoc, updateDoc, serverTimestamp, arrayUnion } = require('firebase/firestore')
const cron = require('node-cron')
const { revisarPrecio, mensajeDescuadre } = require('./verificarDomicilio')
const { calcularAudiencia, destinatarios } = require('./audiencia')
const { armarCorreo } = require('./correoCampana')
const nodemailer = require('nodemailer')
const MailComposer = require('nodemailer/lib/mail-composer')
const { ImapFlow } = require('imapflow')
const { ADMIN_EMAILS, hoyColombia, mensajeDelDia } = require('./mercadeoAviso')
const { calcularDias } = require('./indicadores')
// Solo para LEER pedidos al calcular tiempos de entrega (SA de solo lectura,
// la misma del backup). La escritura de estadísticas va por el bot (reglas).
const { initializeApp: initAdminApp, applicationDefault } = require('firebase-admin/app')
const { getFirestore: getAdminFirestore, FieldValue } = require('firebase-admin/firestore')
const { getMessaging } = require('firebase-admin/messaging')
let adminDb = null // se inicializa en main() si hay credenciales

const TIMEZONE = 'America/Bogota'

const firebaseConfig = {
  apiKey:            process.env.VITE_FIREBASE_API_KEY,
  authDomain:        process.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId:         process.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket:     process.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId:             process.env.VITE_FIREBASE_APP_ID,
}

const BOT_EMAIL    = process.env.AUTO_OPEN_BOT_EMAIL
const BOT_PASSWORD = process.env.AUTO_OPEN_BOT_PASSWORD

if (!BOT_EMAIL || !BOT_PASSWORD) {
  console.error('[scheduler] Faltan AUTO_OPEN_BOT_EMAIL / AUTO_OPEN_BOT_PASSWORD en el entorno.')
  process.exit(1)
}

const app  = initializeApp(firebaseConfig)
const auth = getAuth(app)
const db   = getFirestore(app)

// Horarios por sede (config/horarios, los define administración; ver
// horarios.mjs). La web y la app calculan solas si cada sede está abierta. Esta
// bandera vieja config/client_platform.active (= alguna sede abierta) solo se
// mantiene para celulares que aún tengan la versión anterior en caché.
let banderaVieja = null
async function sincronizarBanderaVieja() {
  try {
    const { algunaAbierta } = await import('./horarios.mjs')
    const snap = await getDoc(doc(db, 'config', 'horarios'))
    const abierta = algunaAbierta(snap.exists() ? snap.data() : null)
    if (abierta !== banderaVieja) {
      await setPlatformActive(abierta)
      banderaVieja = abierta
    }
  } catch (err) {
    console.error('[scheduler] Error al revisar los horarios:', err?.code || err?.message || err)
  }
}

async function setPlatformActive(active) {
  try {
    await setDoc(doc(db, 'config', 'client_platform'), {
      active,
      updatedBy: BOT_EMAIL,
      updatedAt: serverTimestamp(),
    }, { merge: true })
    console.log(`[scheduler] ${new Date().toISOString()} — bandera vieja: ${active ? 'alguna sede abierta' : 'ambas sedes cerradas'}`)
  } catch (err) {
    console.error('[scheduler] Error al actualizar config/client_platform:', err?.code || err)
  }
}

async function signIn() {
  await signInWithEmailAndPassword(auth, BOT_EMAIL, BOT_PASSWORD)
  console.log(`[scheduler] Sesión iniciada como ${BOT_EMAIL}`)
}

// ── Tiempo típico de entrega por sede ────────────────────────────────────────
// Cada 30 min (en horario de servicio) calcula la MEDIANA de minutos entre
// crear el pedido y entregarlo (últimos 200 entregados, descartando atípicos)
// y la publica en config/eta_stats para que el cliente vea "suele llegar en
// ~X min" en su rastreo. Lee con la SA de solo lectura; escribe con el bot.
async function updateEtaStats() {
  try {
    const snap = await adminDb
      .collection('orders')
      .orderBy('deliveredAt', 'desc')
      .limit(200)
      .get()
    const bySede = {}
    // Creado → en camino: lo que tarda la sede en despacharlo. El checkout le
    // suma el recorrido por calle hasta la casa del cliente.
    const salidaBySede = {}
    snap.forEach((d) => {
      const o = d.data()
      if (!o.deliveredAt?.toMillis || !o.createdAt?.toMillis || !o.sedeId) return
      const min = (o.deliveredAt.toMillis() - o.createdAt.toMillis()) / 60000
      if (min < 10 || min > 180) return // atípicos: pruebas, pedidos olvidados
      ;(bySede[o.sedeId] = bySede[o.sedeId] || []).push(min)
      if (o.deliveryMode !== 'pickup' && o.inTransitAt?.toMillis) {
        const salida = (o.inTransitAt.toMillis() - o.createdAt.toMillis()) / 60000
        if (salida >= 3 && salida <= 150) (salidaBySede[o.sedeId] = salidaBySede[o.sedeId] || []).push(salida)
      }
    })
    const mediana = (arr) => { arr.sort((a, b) => a - b); return Math.round(arr[Math.floor(arr.length / 2)]) }
    const stats = {}
    for (const [sede, arr] of Object.entries(bySede)) {
      stats[sede] = { medianMin: mediana(arr), sample: arr.length }
      const salidas = salidaBySede[sede] || []
      if (salidas.length >= 10) stats[sede].salidaMedianMin = mediana(salidas)
    }
    if (Object.keys(stats).length === 0) { console.log('[scheduler] eta_stats: sin datos suficientes'); return }
    await setDoc(doc(db, 'config', 'eta_stats'), {
      ...stats,
      updatedBy: BOT_EMAIL,
      updatedAt: serverTimestamp(),
    })
    console.log('[scheduler] eta_stats actualizado:', JSON.stringify(stats))
  } catch (err) {
    console.error('[scheduler] Error al actualizar eta_stats:', err?.code || err?.message || err)
  }
}

// ─── Audiencia de Mercadeo ────────────────────────────────────────────────────
// Conteos por segmento para la pestaña Mercadeo del panel (ver audiencia.js).
// Lee con la SA de solo lectura y publica con el bot en config/mercadeo_audiencia.
async function updateAudiencia() {
  try {
    const desde = new Date(Date.now() - 365 * 24 * 60 * 60 * 1000)
    const [cs, ps] = await Promise.all([
      adminDb.collection('customers').select('email', 'promociones', 'loyalty').get(),
      adminDb.collection('orders').where('createdAt', '>=', desde).select('clientUid', 'status', 'sedeId', 'createdAt').get(),
    ])
    const clientes = cs.docs.map((d) => ({ uid: d.id, ...d.data() }))
    const pedidos = ps.docs.map((d) => {
      const o = d.data()
      return { clientUid: o.clientUid, status: o.status, sedeId: o.sedeId, createdAtMs: o.createdAt?.toMillis?.() || 0 }
    })
    const aud = calcularAudiencia(clientes, pedidos, Date.now(), await bajasMercadeo())
    await setDoc(doc(db, 'config', 'mercadeo_audiencia'), { ...aud, actualizado: serverTimestamp() })
    console.log(`[scheduler] audiencia mercadeo: ${aud.conCorreo} con correo, ${aud.aceptan} aceptan`)
  } catch (err) {
    console.error('[scheduler] Error al actualizar la audiencia:', err?.code || err?.message || err)
  }
}

// ─── Envío de campañas de correo (pestaña Mercadeo) ─────────────────────────
// Mercadeo oprime "Enviarme una prueba" o "Enviar" y el panel escribe en la
// campaña envio.estado = 'prueba_solicitada' | 'solicitado'. Aquí se ve ese
// cambio y se envía desde marketing@delistars.com (SMTP de Hostinger), uno
// por uno, solo a quienes aceptaron promociones y no se dieron de baja.
// El avance queda en la campaña (envio.*) para que el panel lo muestre.
const SMTP_LISTO = !!(process.env.SMTP_USER && process.env.SMTP_PASS)
const PAUSA_MS = Number(process.env.MERCADEO_PAUSA_MS || 2500)
const MAX_ENVIO = Number(process.env.MERCADEO_MAX_ENVIO || 400)
let transporte = null
const smtp = () => transporte || (transporte = nodemailer.createTransport({
  host: process.env.SMTP_HOST || 'smtp.hostinger.com',
  port: Number(process.env.SMTP_PORT || 465),
  secure: Number(process.env.SMTP_PORT || 465) === 465,
  auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS },
}))

/** uids que se dieron de baja (los guarda el backend al hacer clic en el correo). */
async function bajasMercadeo() {
  try {
    const res = await fetch(`${BACKEND_URL}/api/v1/mercadeo/bajas`, {
      headers: { 'x-mercadeo-secret': process.env.MERCADEO_SECRET || '' },
      signal: AbortSignal.timeout(8000),
    })
    if (!res.ok) throw new Error(`bajas ${res.status}`)
    return new Set((await res.json()).uids || [])
  } catch (err) {
    console.error('[scheduler] no se pudieron leer las bajas:', err?.message || err)
    return null // sin la lista de bajas NO se envía (ver enviarCampana)
  }
}

/**
 * Guarda UNA copia del correo enviado en la carpeta Enviados del buzón (el
 * SMTP no lo hace solo): así queda registro en el correo de Andrés. Una por
 * envío, no una por cliente, para no llenar el buzón. Si falla, solo se avisa.
 */
async function guardarEnEnviados(c, enviados, clave) {
  const imap = new ImapFlow({
    host: process.env.IMAP_HOST || 'imap.hostinger.com', port: 993, secure: true,
    auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS }, logger: false,
  })
  try {
    const copia = armarCorreo(c, { uid: 'copia', email: 'marketing@delistars.com', name: '' }, clave)
    copia.to = `"${enviados} cliente${enviados !== 1 ? 's' : ''} · campaña ${String(c.nombre || '').replace(/"/g, '')}" <marketing@delistars.com>`
    copia.headers = { ...copia.headers, 'X-DeliStars-Campana': String(c.nombre || '') }
    const crudo = await new MailComposer(copia).compile().build()
    await imap.connect()
    const carpetas = await imap.list()
    const enviadosDir = carpetas.find((m) => m.specialUse === '\\Sent')?.path || 'INBOX.Sent'
    await imap.append(enviadosDir, crudo, ['\\Seen'])
    console.log(`[scheduler] copia guardada en ${enviadosDir}`)
  } catch (err) {
    console.error('[scheduler] no se pudo guardar la copia en Enviados:', err?.message || err)
  } finally {
    await imap.logout().catch(() => {})
  }
}

const enProceso = new Set()
const actualizarCampana = (id, datos) => updateDoc(doc(db, 'campanas', id), datos)

async function enviarCampana(id, c) {
  const clave = process.env.MERCADEO_SECRET || ''
  const estado = c.envio?.estado
  if (!SMTP_LISTO || !clave) {
    await actualizarCampana(id, { 'envio.estado': 'error', 'envio.error': 'El correo de envío todavía no está configurado en el servidor.' })
    return
  }
  if (estado === 'prueba_solicitada') {
    const para = String(c.envio?.pruebaA || '').trim()
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(para)) {
      await actualizarCampana(id, { 'envio.estado': 'error', 'envio.error': 'Falta el correo para la prueba.' })
      return
    }
    await smtp().sendMail(armarCorreo(c, { uid: 'prueba', email: para, name: c.envio?.pruebaNombre || '' }, clave))
    await actualizarCampana(id, { 'envio.estado': 'prueba_enviada', 'envio.pruebaEnviadaAt': serverTimestamp(), 'envio.error': null })
    console.log(`[scheduler] campaña ${id}: prueba enviada`)
    return
  }

  // Envío real. Sin la lista de bajas no se envía: es preferible esperar a
  // escribirle a alguien que pidió no recibir más.
  const bajas = await bajasMercadeo()
  if (!bajas) {
    await actualizarCampana(id, { 'envio.estado': 'error', 'envio.error': 'No se pudo revisar la lista de bajas. Intenta de nuevo en un momento.' })
    return
  }
  const desde = new Date(Date.now() - 365 * 24 * 60 * 60 * 1000)
  const [cs, ps] = await Promise.all([
    adminDb.collection('customers').select('email', 'name', 'promociones', 'loyalty').get(),
    adminDb.collection('orders').where('createdAt', '>=', desde).select('clientUid', 'status', 'sedeId', 'createdAt').get(),
  ])
  const pedidos = ps.docs.map((d) => { const o = d.data(); return { clientUid: o.clientUid, status: o.status, sedeId: o.sedeId, createdAtMs: o.createdAt?.toMillis?.() || 0 } })
  const ya = new Set(c.envio?.enviadosUids || [])  // si se reinicia a mitad, no repite
  const lista = destinatarios(c.segmento || 'todos', cs.docs.map((d) => ({ uid: d.id, ...d.data() })), pedidos, Date.now(), bajas)
    .filter((x) => !ya.has(x.uid)).slice(0, MAX_ENVIO)

  await actualizarCampana(id, { 'envio.estado': 'enviando', 'envio.total': ya.size + lista.length, 'envio.error': null })
  let enviados = ya.size
  let fallidos = c.envio?.fallidos || 0
  const enviadosUids = [...ya]
  for (const cliente of lista) {
    try {
      await smtp().sendMail(armarCorreo(c, cliente, clave))
      enviados++
      enviadosUids.push(cliente.uid)
    } catch (err) {
      fallidos++
      console.error(`[scheduler] campaña ${id}: falló un envío:`, err?.code || err?.message || err)
      // Hostinger corta si se pasa del límite: se para y se avisa.
      if (/limit|quota|rate|421|450|451|452|550 5\.7/i.test(String(err?.message || err?.code || ''))) {
        await actualizarCampana(id, { 'envio.estado': 'pausada', 'envio.enviados': enviados, 'envio.fallidos': fallidos, 'envio.enviadosUids': enviadosUids,
          'envio.error': 'El servidor de correo pidió pausar (límite de envíos). Vuelve a oprimir Enviar más tarde: no se repite a quien ya le llegó.' })
        return
      }
    }
    if (enviados % 10 === 0) await actualizarCampana(id, { 'envio.enviados': enviados, 'envio.fallidos': fallidos, 'envio.enviadosUids': enviadosUids })
    await new Promise((r) => setTimeout(r, PAUSA_MS))
  }
  await actualizarCampana(id, {
    estado: 'enviada', 'envio.estado': 'enviada', 'envio.enviados': enviados, 'envio.fallidos': fallidos,
    'envio.enviadosUids': enviadosUids, 'envio.enviadaAt': serverTimestamp(),
    // Historial: una campaña se puede enviar varias veces.
    'envio.historial': arrayUnion({
      fecha: new Date().toISOString(), enviados, fallidos,
      por: c.envio?.solicitadoPor || '', ronda: c.envio?.ronda || 1,
    }),
  })
  console.log(`[scheduler] campaña ${id}: enviada a ${enviados} (${fallidos} fallidos)`)
  await guardarEnEnviados(c, enviados, clave)
}

function watchCampanas() {
  adminDb.collection('campanas').where('envio.estado', 'in', ['prueba_solicitada', 'solicitado'])
    .onSnapshot((snap) => {
      for (const d of snap.docs) {
        const clave = `${d.id}:${d.data().envio?.estado}:${d.data().envio?.solicitadoAt?.toMillis?.() || ''}`
        if (enProceso.has(clave)) continue
        enProceso.add(clave)
        enviarCampana(d.id, d.data())
          .catch(async (err) => {
            console.error(`[scheduler] campaña ${d.id}: error al enviar:`, err?.message || err)
            await actualizarCampana(d.id, { 'envio.estado': 'error', 'envio.error': `No se pudo enviar: ${err?.message || err}` }).catch(() => {})
          })
          .finally(() => enProceso.delete(clave))
      }
    }, (err) => console.error('[scheduler] watch campañas error:', err?.message || err))
  console.log(`[scheduler] envío de campañas activo (${SMTP_LISTO ? 'SMTP listo' : 'SMTP pendiente de SMTP_USER/SMTP_PASS'})`)
}

// ─── Indicadores agregados para Mercadeo ─────────────────────────────────────
// Mercadeo ve solo números (decisión C3): se calculan aquí con la cuenta de
// servicio y se publican por día en mercadeo/indicadores/dias/{fecha}.
async function updateIndicadores(diasAtras = 2) {
  try {
    const desde = new Date(Date.now() - diasAtras * 24 * 60 * 60 * 1000)
    const [ps, fs] = await Promise.all([
      adminDb.collection('orders').where('createdAt', '>=', desde)
        .select('createdAt', 'status', 'sedeId', 'totalPrice', 'deliveryMode', 'items', 'cashierId').get(),
      adminDb.collection('metrics_funnel').where('at', '>=', desde).select('at').get(),
    ])
    const pedidos = ps.docs.map((d) => { const o = d.data(); return { ...o, createdAtMs: o.createdAt?.toMillis?.() || 0 } })
    const checkouts = fs.docs.map((d) => ({ atMs: d.data().at?.toMillis?.() || 0 }))
    const dias = calcularDias(pedidos, checkouts)
    for (const [fecha, datos] of Object.entries(dias)) {
      await setDoc(doc(db, 'mercadeo', 'indicadores', 'dias', fecha), { ...datos, fecha, actualizado: serverTimestamp() })
    }
    console.log(`[scheduler] indicadores de mercadeo: ${Object.keys(dias).length} días actualizados`)
  } catch (err) {
    console.error('[scheduler] Error al actualizar indicadores:', err?.code || err?.message || err)
  }
}

// ─── Aviso diario de Mercadeo a administración ───────────────────────────────
// Qué tiene Mercadeo programado hoy en su calendario (ver mercadeoAviso.js).
// Llega al celular de cada admin que tenga activadas las notificaciones en la
// app de domicilios (staff_push). En el panel, Resumen muestra lo mismo.
async function avisarMercadeoDelDia() {
  try {
    const snap = await adminDb.collection('mercadeo').doc('calendario').collection('actividades').get()
    const msg = mensajeDelDia(snap.docs.map((d) => d.data()), hoyColombia())
    if (!msg) { console.log('[scheduler] mercadeo: nada programado hoy'); return }
    for (const email of ADMIN_EMAILS) {
      await sendPushForStaff('mercadeo', {}, { ...msg, soloA: email })
    }
  } catch (err) {
    console.error('[scheduler] Error en el aviso de mercadeo:', err?.message || err)
  }
}

// ─── WhatsApp del negocio (CallMeBot) ─────────────────────────────────────────
// Envía avisos al WhatsApp del dueño: resumen diario y pedidos sin cotizar.
// CallMeBot es gratuito y solo puede escribirle al número que se registró con
// él (una activación única desde ese mismo WhatsApp genera el apikey).
const WA_PHONE  = process.env.WHATSAPP_ALERT_PHONE || '573122275039'
const WA_APIKEY = process.env.CALLMEBOT_APIKEY || ''

async function sendWhatsApp(text) {
  if (!WA_APIKEY) { console.log('[scheduler] WhatsApp omitido (falta CALLMEBOT_APIKEY):', text.slice(0, 60)); return }
  try {
    const url = `https://api.callmebot.com/whatsapp.php?phone=${WA_PHONE}&apikey=${encodeURIComponent(WA_APIKEY)}&text=${encodeURIComponent(text)}`
    const res = await fetch(url)
    console.log(`[scheduler] WhatsApp → ${WA_PHONE}: HTTP ${res.status}`)
  } catch (err) {
    console.error('[scheduler] WhatsApp error:', err?.message || err)
  }
}

const fmtCOP = (n) => `$${Math.round(n || 0).toLocaleString('es-CO')}`
// Efectivo real cobrado (misma regla que src/utils/payments.js del panel).
const cashAmount = (o) =>
  (o.payment === 'Mixto' && o.mixtoEfectivo != null && o.mixtoEfectivo !== '')
    ? (Number(o.mixtoEfectivo) || 0)
    : (o.totalPrice || 0)

// Medianoche de HOY en hora Colombia (UTC-5 fijo, sin horario de verano).
function bogotaDayStart() {
  const ymd = new Intl.DateTimeFormat('en-CA', { timeZone: TIMEZONE }).format(new Date())
  return new Date(`${ymd}T00:00:00-05:00`)
}

// ─── Resumen diario del negocio (11:45 PM) ────────────────────────────────────
const DELIVERED = ['delivered_paid', 'delivered_cash', 'pending_cuadre', 'completed']

async function sendDailySummary() {
  try {
    const start = bogotaDayStart()
    const snap = await adminDb.collection('orders')
      .where('createdAt', '>=', start).get()
    const orders = snap.docs.map((d) => d.data())

    const delivered = orders.filter((o) => DELIVERED.includes(o.status))
    const ventas    = delivered.reduce((s, o) => s + (o.totalPrice || 0), 0)
    const domis     = delivered.reduce((s, o) => s + (o.deliveryPrice || 0), 0)
    const ticket    = delivered.length ? ventas / delivered.length : 0

    const porSede = {}
    delivered.forEach((o) => {
      const k = o.sedeName || 'Sin sede'
      porSede[k] = porSede[k] || { total: 0, count: 0 }
      porSede[k].total += o.totalPrice || 0
      porSede[k].count++
    })

    const cuadre = orders
      .filter((o) => o.status === 'pending_cuadre')
      .reduce((s, o) => s + cashAmount(o), 0)
    const cancelados = orders.filter((o) => ['rejected', 'cancelled'].includes(o.status)).length

    const funnelSnap = await adminDb.collection('metrics_funnel').where('at', '>=', start).get()
    const checkouts    = funnelSnap.size
    const clientOrders = orders.filter((o) => !o.cashierId).length
    const abandono = checkouts > 0 ? Math.round(Math.max(0, checkouts - clientOrders) / checkouts * 100) : null

    const rated  = orders.filter((o) => Number(o.rating) > 0)
    const rating = rated.length ? (rated.reduce((s, o) => s + Number(o.rating), 0) / rated.length).toFixed(1) : null

    const fecha = new Intl.DateTimeFormat('es-CO', { timeZone: TIMEZONE, day: '2-digit', month: 'short' }).format(new Date())
    const lines = [
      `🌟 DeliStars — Resumen del ${fecha}`,
      `💰 Ventas: ${fmtCOP(ventas)} (${delivered.length} pedidos · ticket ${fmtCOP(ticket)})`,
      ...Object.entries(porSede).map(([s, v]) => `   • ${s}: ${fmtCOP(v.total)} (${v.count})`),
      `🛵 Domicilios cobrados: ${fmtCOP(domis)}`,
      `💵 Efectivo pendiente de cuadre: ${fmtCOP(cuadre)}`,
      ...(abandono !== null ? [`🛒 Embudo: ${checkouts} checkouts → ${clientOrders} enviados (${abandono}% abandono)`] : []),
      ...(rating ? [`⭐ Calificación de hoy: ${rating} (${rated.length} votos)`] : []),
      ...(cancelados ? [`❌ Rechazados/cancelados: ${cancelados}`] : []),
    ]
    await sendWhatsApp(lines.join('\n'))
    console.log('[scheduler] resumen diario enviado')
  } catch (err) {
    console.error('[scheduler] Error en resumen diario:', err?.message || err)
  }
}

// ─── Alerta: pedido sin cotizar hace más de 10 minutos ───────────────────────
const STUCK_AFTER_MS = 10 * 60 * 1000
const stuckAlerted = new Set() // ids ya avisados (en memoria; tras reinicio puede repetir una vez)

async function checkStuckOrders() {
  try {
    const start = bogotaDayStart()
    const snap = await adminDb.collection('orders')
      .where('createdAt', '>=', start).get()
    const now = Date.now()
    for (const d of snap.docs) {
      const o = d.data()
      if (o.status !== 'pending' || stuckAlerted.has(d.id)) continue
      const created = o.createdAt?.toMillis ? o.createdAt.toMillis() : 0
      if (!created || now - created < STUCK_AFTER_MS) continue
      stuckAlerted.add(d.id)
      const mins = Math.round((now - created) / 60000)
      await sendWhatsApp(
        `⚠️ Pedido${o.orderNumber ? ` #${o.orderNumber}` : ''} de ${o.sedeName || 'sede ?'} lleva ${mins} min ${o.pagoAdelantado ? 'SIN ACEPTAR (ya viene con pago)' : 'SIN COTIZAR'}.\nCliente: ${o.name || o.clientName || '—'}. Revisa la caja.`,
      )
      console.log(`[scheduler] alerta pedido atascado ${d.id} (${mins} min)`)
    }
  } catch (err) {
    console.error('[scheduler] Error en chequeo de atascados:', err?.message || err)
  }
}

// ─── Prospectos corporativos (página /empresas) → WhatsApp del negocio ───────
function watchCorporateLeads() {
  let baseline = true
  adminDb.collection('corporate_leads').orderBy('createdAt', 'desc').limit(30)
    .onSnapshot((snap) => {
      snap.docChanges().forEach((chg) => {
        if (chg.type !== 'added' || baseline) return
        const l = chg.doc.data()
        const lines = [
          '🏢 NUEVA COTIZACIÓN EMPRESA',
          `Empresa: ${l.empresa || '—'}`,
          `Contacto: ${l.nombre || '—'}${l.cargo ? ' (' + l.cargo + ')' : ''}`,
          `Tel: ${l.telefono || '—'}${l.correo ? ' · ' + l.correo : ''}`,
          `Tipo: ${l.tipo || '—'}${l.personas ? ' · ' + l.personas + ' pers.' : ''}${l.fecha ? ' · ' + l.fecha : ''}`,
          ...(l.mensaje ? [`Mensaje: ${l.mensaje}`] : []),
        ]
        sendWhatsApp(lines.join('\n')).catch((e) => console.error('[scheduler] lead WA error:', e?.message || e))
      })
      baseline = false
    }, (err) => console.error('[scheduler] watch corporate_leads error:', err?.message || err))
  console.log('[scheduler] prospectos corporativos activos (aviso por WhatsApp)')
}

// ─── Notificaciones push al cliente (FCM) ─────────────────────────────────────
// Mensaje según el nuevo estado del pedido. Devuelve null si ese estado no
// amerita notificación.
function notifyFor(o) {
  const n = o.orderNumber ? ` #${o.orderNumber}` : ''
  switch (o.status) {
    case 'quoted':
      // Con pago adelantado no hubo cotización: la caja aceptó el pedido.
      return o.pagoAdelantado
        ? { title: '✅ ¡Aceptamos tu pedido!', body: `Tu pedido${n} está confirmado y pasa a preparación.` }
        : { title: '💰 ¡Ya cotizamos tu pedido!', body: `Tu pedido${n} está cotizado. Entra para elegir cómo pagar.` }
    case 'in_transit':
      return { title: '🛵 Tu pedido va en camino', body: `El domiciliario salió con tu pedido${n}. ¡Ya casi!` }
    case 'arrived':
      return { title: '📍 El domiciliario llegó', body: `Tu pedido${n} está en tu puerta.` }
    case 'delivered_paid':
    case 'delivered_cash':
    case 'pending_cuadre':
    case 'completed':
      return { title: '✅ ¡Pedido entregado!', body: `Tu pedido${n} fue entregado. ¡Gracias por pedir en DeliStars! 🎉` }
    case 'rejected':
      return { title: 'Tu pedido no se pudo tomar', body: `Lo sentimos, tu pedido${n} fue rechazado. Escríbenos si tienes dudas.` }
    default:
      return null
  }
}

async function sendPushForOrder(orderId, o) {
  if (!o.clientUid) return
  const msg = notifyFor(o)
  if (!msg) return
  const cust = await adminDb.doc(`customers/${o.clientUid}`).get()
  const tokens = cust.exists ? (cust.data().fcmTokens || []) : []
  if (!tokens.length) return
  const res = await getMessaging().sendEachForMulticast({
    tokens,
    notification: { title: msg.title, body: msg.body },
    data:    { orderId: String(orderId), url: 'https://delistars.com/domicilios/' },
    webpush: { fcmOptions: { link: 'https://delistars.com/domicilios/' } },
  })
  // Limpia tokens que ya no sirven (dispositivo desinstaló, permiso revocado…).
  const bad = []
  res.responses.forEach((r, i) => {
    const code = r.error?.code || ''
    if (!r.success && (code.includes('registration-token-not-registered') || code.includes('invalid-argument'))) {
      bad.push(tokens[i])
    }
  })
  if (bad.length) {
    await adminDb.doc(`customers/${o.clientUid}`)
      .update({ fcmTokens: FieldValue.arrayRemove(...bad) }).catch(() => {})
  }
  console.log(`[scheduler] push enviado (${o.status}) pedido ${orderId} → ${res.successCount}/${tokens.length}`)
}

// ─── Notificaciones push al EQUIPO (caja y domiciliarios) ────────────────────
// El sonido de los paneles solo existe con la aplicación abierta. Esto es lo
// otro: que le llegue al celular con la app cerrada — a la caja cuando entra un
// pedido, y al domiciliario cuando le asignan uno estando en la calle.
//
// Los tokens los guarda cada quien desde su panel en staff_push/{correo}.
function notifyStaffFor(o) {
  const n = o.orderNumber ? ` #${o.orderNumber}` : ''
  switch (o.status) {
    case 'pending':
      return o.pagoAdelantado
        ? { rol: 'cashier', title: '🔔 Entró un pedido completo', body: `Pedido${n} con pago (${o.payment}). Ábrelo para aceptarlo.` }
        : { rol: 'cashier', title: '🔔 Entró un pedido', body: `Pedido${n} sin cotizar. Ábrelo para cotizarlo.` }
    case 'assigned':
      return { rol: 'driver', soloA: o.driverEmail, title: '🛵 Te asignaron un domicilio', body: `Pedido${n}${o.barrio ? ' — ' + o.barrio : ''}. Ábrelo para aceptarlo.` }
    case 'accepted':
      return { rol: 'cashier', title: '✅ El domiciliario aceptó', body: `${o.driverName || 'El domiciliario'} tomó el pedido${n}.` }
    case 'rejected':
      return { rol: 'cashier', title: '⚠️ Rechazaron un pedido', body: `El pedido${n} fue rechazado. Hay que reasignarlo.` }
    case 'cancelled':
      return { rol: 'cashier', title: '🚫 El cliente canceló', body: `Canceló el pedido${n}.` }
    case 'delivered_paid':
    case 'delivered_cash':
    case 'pending_cuadre':
      return { rol: 'cashier', title: '📦 Pedido entregado', body: `El pedido${n} quedó entregado.` }
    default:
      return null
  }
}

// Documentos de staff_push que deben recibir este aviso. Se filtra por sede
// para no despertar a la caja de Santa Lucía por un pedido de Teresita; quien
// trabaja en "ambas sedes" (o no tiene sede guardada) recibe todo.
async function destinatariosEquipo(msg, sedeId) {
  if (msg.soloA) {
    const d = await adminDb.doc(`staff_push/${String(msg.soloA).toLowerCase()}`).get()
    return d.exists ? [d] : []
  }
  const snap = await adminDb.collection('staff_push').where('rol', '==', msg.rol).get()
  return snap.docs.filter((d) => {
    const s = d.data().sedeId
    return !sedeId || !s || s === 'all' || s === sedeId
  })
}

async function sendPushForStaff(orderId, o, msgFijo = null) {
  const msg = msgFijo || notifyStaffFor(o)
  if (!msg) return
  const docs = await destinatariosEquipo(msg, o.sedeId)
  if (!docs.length) return

  for (const d of docs) {
    const tokens = d.data().fcmTokens || []
    if (!tokens.length) continue
    const res = await getMessaging().sendEachForMulticast({
      tokens,
      notification: { title: msg.title, body: msg.body },
      data:    { orderId: String(orderId), url: msg.url || 'https://delistars.com/domicilios/' },
      webpush: { fcmOptions: { link: msg.url || 'https://delistars.com/domicilios/' } },
    })
    // Limpia tokens muertos (desinstalaron la app, revocaron el permiso…).
    const bad = []
    res.responses.forEach((r, i) => {
      const code = r.error?.code || ''
      if (code.includes('registration-token-not-registered') || code.includes('invalid-argument')) bad.push(tokens[i])
    })
    if (bad.length) {
      await d.ref.update({ fcmTokens: FieldValue.arrayRemove(...bad) }).catch(() => {})
    }
    console.log(`[scheduler] push equipo (${msgFijo ? (msgFijo.tipo || 'devolución') : o.status}) pedido ${orderId} → ${d.id}: ${res.successCount}/${tokens.length}`)
  }
}

// ─── Revisión del precio del domicilio ───────────────────────────────────────
// Ver verificarDomicilio.js. Se mide por calle con el backend (misma red
// Docker), que guarda la llave de Google y aplica los topes.
const BACKEND_URL = process.env.BACKEND_INTERNAL_URL || 'http://backend:3000'
const revisados = new Set()

async function medirPorCalle(origen, destino) {
  try {
    const res = await fetch(`${BACKEND_URL}/api/v1/rutas/recorrido`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ origen, destino }),
      signal: AbortSignal.timeout(8000),
    })
    return res.ok ? await res.json() : null
  } catch { return null }
}

async function revisarDomicilioNuevo(id, o) {
  if (revisados.has(id)) return
  revisados.add(id)
  const r = await revisarPrecio(o, medirPorCalle)
  if (!r) return
  if (r.cuadra) {
    console.log(`[scheduler] domicilio OK pedido ${id}: ${r.km} km → ${r.precioCorrecto}`)
    return
  }
  console.warn(`[scheduler] domicilio NO CUADRA pedido ${id}: trae ${r.precioPedido}, ${r.km} km → ${r.precioCorrecto}`)
  await sendPushForStaff(id, o, mensajeDescuadre(o, r))
}

// Vigila los pedidos recientes y notifica al cliente cuando su pedido cambia a
// un estado relevante (cotizado / en camino / llegó / entregado / rechazado).
function watchOrdersForPush() {
  const seen = new Map() // orderId -> último estado visto
  let baseline = true    // en la primera carga NO se notifica (solo se toma foto)
  adminDb.collection('orders').orderBy('createdAt', 'desc').limit(150)
    .onSnapshot((snap) => {
      for (const chg of snap.docChanges()) {
        if (chg.type === 'removed') { seen.delete(chg.doc.id); continue }
        const id = chg.doc.id
        const o  = chg.doc.data()
        const prev = seen.get(id)
        seen.set(id, o.status)
        if (!baseline && chg.type === 'added') {
          revisarDomicilioNuevo(id, o).catch((e) => console.error('[scheduler] revisión domicilio error:', e?.message || e))
        }
        if (baseline || prev === o.status) continue
        sendPushForOrder(id, o).catch((e) => console.error('[scheduler] push error:', e?.message || e))
        sendPushForStaff(id, o).catch((e) => console.error('[scheduler] push equipo error:', e?.message || e))
      }
      baseline = false
    }, (err) => console.error('[scheduler] watch pedidos error:', err?.message || err))
  console.log('[scheduler] push FCM activo (vigilando cambios de estado de pedidos)')
}

// ─── Devoluciones: aviso al celular de la caja ──────────────────────────────
// Elegir la devolución no cambia el estado del pedido (sigue rechazado o
// cancelado), así que watchOrdersForPush no lo ve. Además ese vigía solo mira
// los últimos 150 pedidos y la devolución puede ser de un pedido de días atrás.
// Por eso va aparte, consultando directo los pedidos con devolución pendiente.
function mensajeDevolucion(o, tipo) {
  const n = o.orderNumber ? ` #${o.orderNumber}` : ''
  const monto = `$${Number(o.devolucion?.monto || o.saldoAplicado?.usado || 0).toLocaleString('es-CO')}`
  if (tipo === 'transferencia_solicitada') {
    return { rol: 'cashier', title: '💸 Devolución por transferencia', body: `${o.name || 'El cliente'} (pedido${n}) pidió que le transfieran ${monto}. Ábrelo para ver sus datos.` }
  }
  if (tipo === 'saldo_solicitado') {
    return { rol: 'cashier', title: '💚 Devolución como saldo a favor', body: `${o.name || 'El cliente'} (pedido${n}) pidió ${monto} como saldo. Ábrelo para acreditarlo.` }
  }
  return { rol: 'cashier', title: '💚 Devolver saldo a favor', body: `El pedido${n} no siguió y el cliente había usado saldo. Ábrelo para devolvérselo.` }
}

function watchDevoluciones() {
  const vigilar = (consulta, tipoDe) => {
    const avisados = new Set()
    let baseline = true // al arrancar no se re-avisa lo que ya estaba pendiente
    consulta.onSnapshot((snap) => {
      for (const d of snap.docs) {
        const o = d.data()
        const tipo = tipoDe(o)
        const clave = `${d.id}:${tipo}`
        if (avisados.has(clave)) continue
        avisados.add(clave)
        if (baseline) continue
        sendPushForStaff(d.id, o, mensajeDevolucion(o, tipo))
          .catch((e) => console.error('[scheduler] push devolución error:', e?.message || e))
      }
      baseline = false
    }, (err) => console.error('[scheduler] watch devoluciones error:', err?.message || err))
  }
  vigilar(
    adminDb.collection('orders').where('devolucion.estado', 'in', ['transferencia_solicitada', 'saldo_solicitado']),
    (o) => o.devolucion.estado,
  )
  vigilar(
    adminDb.collection('orders').where('saldoAplicado.porDevolver', '==', true),
    () => 'saldo_por_devolver',
  )
  console.log('[scheduler] avisos de devoluciones a la caja activos')
}

async function main() {
  // Reintenta el login inicial — si el contenedor arranca antes de que la
  // red esté lista, no debe morir, solo seguir intentando.
  for (;;) {
    try { await signIn(); break }
    catch (err) {
      console.error('[scheduler] No se pudo iniciar sesión, reintentando en 30s:', err?.code || err)
      await new Promise((r) => setTimeout(r, 30000))
    }
  }

  // Ya no hay horario fijo (antes abría 5:30 p. m. y cerraba 11:30 p. m.): manda
  // config/horarios. Cada 5 minutos se refleja en la bandera vieja.
  cron.schedule('*/5 * * * *', sincronizarBanderaVieja, { timezone: TIMEZONE })
  sincronizarBanderaVieja()

  // Estadísticas de tiempo de entrega: requieren la llave de la SA de solo
  // lectura montada en el contenedor. Si no está, esta parte simplemente se
  // omite (el abre/cierra de plataforma no depende de ella).
  if (process.env.GOOGLE_APPLICATION_CREDENTIALS) {
    try {
      const adminApp = initAdminApp({ credential: applicationDefault(), projectId: firebaseConfig.projectId })
      adminDb = getAdminFirestore(adminApp)
      cron.schedule('*/30 17-23 * * *', updateEtaStats, { timezone: TIMEZONE })
      updateEtaStats() // una vez al arrancar
      console.log('[scheduler] eta_stats activo (cada 30 min en horario de servicio)')
      // Notificaciones push al cliente (usa la misma SA; requiere permiso FCM).
      try { watchOrdersForPush() }
      catch (err) { console.error('[scheduler] push FCM deshabilitado:', err?.message || err) }
      try { watchDevoluciones() }
      catch (err) { console.error('[scheduler] avisos de devoluciones deshabilitados:', err?.message || err) }
      // Resumen del día al WhatsApp del dueño (11:45 PM, antes del cierre).
      cron.schedule('45 23 * * *', sendDailySummary, { timezone: TIMEZONE })
      // Vigía de pedidos sin cotizar: cada 3 min durante el servicio.
      cron.schedule('*/3 17-23 * * *', checkStuckOrders, { timezone: TIMEZONE })
      // Lo que tiene Mercadeo hoy → celular de administración, 10:00 a. m.
      cron.schedule('0 10 * * *', avisarMercadeoDelDia, { timezone: TIMEZONE })
      // Campañas de correo: envía cuando Mercadeo lo pide desde el panel.
      try { watchCampanas() } catch (err) { console.error('[scheduler] envío de campañas deshabilitado:', err?.message || err) }
      // Indicadores de Mercadeo: 120 días al arrancar, luego hoy y ayer cada 30 min.
      cron.schedule('*/30 * * * *', () => updateIndicadores(2), { timezone: TIMEZONE })
      updateIndicadores(120)
      // Audiencia de Mercadeo: cada hora y una vez al arrancar.
      cron.schedule('5 * * * *', updateAudiencia, { timezone: TIMEZONE })
      updateAudiencia()
      // Prospectos de la página /empresas → aviso inmediato por WhatsApp.
      try { watchCorporateLeads() } catch (err) { console.error('[scheduler] leads corp deshabilitado:', err?.message || err) }
      console.log(`[scheduler] WhatsApp ${WA_APIKEY ? 'ACTIVO' : 'pendiente de CALLMEBOT_APIKEY'} → ${WA_PHONE} (resumen 11:45pm + alertas de pedidos atascados)`)
    } catch (err) {
      console.error('[scheduler] eta_stats deshabilitado:', err?.message || err)
    }
  } else {
    console.log('[scheduler] eta_stats omitido: sin GOOGLE_APPLICATION_CREDENTIALS')
  }

  console.log(`[scheduler] Listo. Horarios por sede en config/horarios (${TIMEZONE}); solo administración los cambia.`)
}

main()
