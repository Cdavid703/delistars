// Tareas de fondo de DeliStars: estadísticas, avisos push, revisión de precios,
// audiencia y campañas de Mercadeo, y la bandera vieja de apertura (los
// horarios reales por sede viven en config/horarios). Escribe con una cuenta de
// Firebase dedicada con permisos MUY limitados (ver isAutoOpenBot en
// firestore.rules) y lee con una cuenta de servicio de solo lectura.
const { initializeApp } = require('firebase/app')
const { getAuth, signInWithEmailAndPassword } = require('firebase/auth')
const { getFirestore, doc, getDoc, setDoc, updateDoc, deleteDoc, serverTimestamp, arrayUnion } = require('firebase/firestore')
const cron = require('node-cron')
const { revisarPrecio, mensajeDescuadre } = require('./verificarDomicilio')
const { calcularAudiencia, destinatarios, destinatariosPush } = require('./audiencia')
const promos = require('./promos')
const { armarCorreo } = require('./correoCampana')
const nodemailer = require('nodemailer')
const MailComposer = require('nodemailer/lib/mail-composer')
const { ImapFlow } = require('imapflow')
const { ADMIN_EMAILS, hoyColombia, mensajeDelDia } = require('./mercadeoAviso')
const { mensajeSolicitud, claveSolicitud } = require('./solicitudAviso')
const { enlacePedido, destinoCaja, idEvento, mensajeNuevo, sinDomiciliarioDemasiado, sinRespuestaDemasiado, mensajesExpo, expoMuertos } = require('./avisos')
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
      adminDb.collection('customers').select('email', 'promociones', 'loyalty', 'fcmTokens').get(),
      adminDb.collection('orders').where('createdAt', '>=', desde).select('clientUid', 'status', 'sedeId', 'createdAt').get(),
    ])
    const clientes = cs.docs.map((d) => ({ uid: d.id, ...d.data() }))
    const pedidos = ps.docs.map((d) => {
      const o = d.data()
      return { clientUid: o.clientUid, status: o.status, sedeId: o.sedeId, createdAtMs: o.createdAt?.toMillis?.() || 0 }
    })
    const aud = calcularAudiencia(clientes, pedidos, Date.now(), await bajasMercadeo(), await aparatosDeClientes(clientes))
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
  let porCupo = 0
  const enviadosUids = [...ya]
  for (const cliente of lista) {
    // Una promoción cada 24 h por cuenta, sumando correo y notificaciones (§17.3).
    if (!(await tomarCupo(cliente.uid, id, 'correo'))) { porCupo++; continue }
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
    'envio.omitidosPorCupo': porCupo,
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

// ─── Promociones por notificación (Fase 7, especificación §17) ──────────────
// Mercadeo programa la campaña (canal notificación, vigencia, destino) y aquí:
//  1. al empezar la vigencia, la audiencia que aceptó promociones y tiene un
//     aparato queda en promo_cola/{campana}_{uid};
//  2. cada minuto se despacha: una promoción cada 24 h por cuenta (promo_cupo),
//     la que vence antes primero, revisando vigencia, pausa y consentimiento
//     justo antes de enviar. Lo vencido se marca y no se envía.
// Todo queda contado en campanas/{id}.metricas (sin datos personales).
const COLA = 'promo_cola'
const contar = (id, campos) => adminDb.doc(`campanas/${id}`).update(
  Object.fromEntries(Object.entries(campos).map(([k, v]) => [`metricas.${k}`, FieldValue.increment(v)]))).catch(() => {})

/** Cuentas con un aparato para notificaciones (app: dispositivos/{uid}/tokens; navegador: fcmTokens). */
async function aparatosDeClientes(clientes) {
  const set = new Set(clientes.filter((c) => (c.fcmTokens || []).length).map((c) => c.uid))
  const tk = await adminDb.collectionGroup('tokens').select().get().catch(() => null)
  for (const d of tk?.docs || []) {
    const destino = d.ref.parent.parent
    if (destino?.parent?.id === 'dispositivos') set.add(destino.id)
  }
  return set
}

/** Reserva el cupo de 24 h de una cuenta (transacción: dos envíos a la vez no lo duplican). */
async function tomarCupo(uid, campanaId, canal) {
  const ref = adminDb.doc(`promo_cupo/${uid}`)
  return adminDb.runTransaction(async (tx) => {
    const c = await tx.get(ref)
    if (!promos.cupoLibre(c.exists ? c.data().ultimaAt : null)) return false
    tx.set(ref, { ultimaAt: Date.now(), campanaId, canal })
    return true
  }).catch(() => false)
}

async function pushPromo(uid, c, campanaId) {
  const url = promos.enlaceDestino(c, campanaId)
  const msg = { title: String(c.push?.titulo || '').slice(0, 65), body: String(c.push?.texto || '').slice(0, 180) }
  await pushApp(uid, msg, url, { tipo: 'promo' })
  const cust = await adminDb.doc(`customers/${uid}`).get()
  const tokens = cust.exists ? (cust.data().fcmTokens || []) : []
  if (tokens.length) {
    await getMessaging().sendEachForMulticast({
      tokens, notification: msg, data: { url, campanaId }, webpush: { fcmOptions: { link: url } },
    }).catch((err) => console.error('[scheduler] push promo web:', err?.message || err))
  }
}

async function encolarCampana(id, c) {
  const bajas = await bajasMercadeo()
  if (!bajas) return // sin la lista de bajas no se encola (se reintenta en un minuto)
  const desde = new Date(Date.now() - 365 * 24 * 60 * 60 * 1000)
  const [cs, ps] = await Promise.all([
    adminDb.collection('customers').select('email', 'promociones', 'loyalty', 'fcmTokens').get(),
    adminDb.collection('orders').where('createdAt', '>=', desde).select('clientUid', 'status', 'sedeId', 'createdAt').get(),
  ])
  const clientes = cs.docs.map((d) => ({ uid: d.id, ...d.data() }))
  const pedidos = ps.docs.map((d) => { const o = d.data(); return { clientUid: o.clientUid, status: o.status, sedeId: o.sedeId, createdAtMs: o.createdAt?.toMillis?.() || 0 } })
  const lista = destinatariosPush(c.segmento || 'todos', clientes, pedidos, Date.now(), bajas, await aparatosDeClientes(clientes), c.sedeId || '')
  for (let i = 0; i < lista.length; i += 400) {
    const batch = adminDb.batch()
    for (const x of lista.slice(i, i + 400)) {
      batch.set(adminDb.doc(`${COLA}/${id}_${x.uid}`), { campanaId: id, uid: x.uid, sedeId: c.sedeId || null, finAt: promos.ms(c.vigencia?.fin), creadoAt: Date.now(), estado: 'en_cola', motivo: null })
    }
    await batch.commit()
  }
  await adminDb.doc(`campanas/${id}`).update({ 'cola.encolada': true, 'cola.encoladaAt': Date.now(), 'cola.total': lista.length, 'metricas.enCola': lista.length })
  console.log(`[scheduler] campaña ${id}: ${lista.length} en cola de notificación`)
}

let despachando = false
async function procesarPromos() {
  if (despachando || !adminDb) return
  despachando = true
  try {
    const ahora = Date.now()
    // 1) Encolar las campañas que empezaron.
    const prog = await adminDb.collection('campanas').where('programada', '==', true).get()
    const campanas = Object.fromEntries(prog.docs.map((d) => [d.id, d.data()]))
    for (const [id, c] of Object.entries(campanas)) {
      if (promos.pushActiva(c, ahora) && !c.cola?.encolada) await encolarCampana(id, c)
    }
    // 2) Despachar la cola.
    const cola = await adminDb.collection(COLA).where('estado', '==', 'en_cola').limit(3000).get()
    if (cola.empty) return
    for (const d of cola.docs) {
      const cid = d.data().campanaId
      if (!(cid in campanas)) { const x = await adminDb.doc(`campanas/${cid}`).get(); campanas[cid] = x.exists ? x.data() : null }
    }
    const bajas = await bajasMercadeo()
    if (!bajas) return
    const porCuenta = new Map()
    for (const d of cola.docs) porCuenta.set(d.data().uid, [...(porCuenta.get(d.data().uid) || []), { ref: d.ref, ...d.data() }])
    for (const [uid, items] of porCuenta) {
      // Vencidas (o campaña borrada): no se envían por estar en cola.
      for (const it of items.filter((x) => promos.vencida(campanas[x.campanaId], ahora))) {
        await it.ref.update({ estado: 'expirada', motivo: campanas[it.campanaId] ? 'vencio' : 'campana_borrada', cerradaAt: ahora })
        await contar(it.campanaId, { enCola: -1, expirados: 1 })
      }
      const vivos = items.filter((x) => !promos.vencida(campanas[x.campanaId], ahora))
      const sig = promos.siguiente(vivos, campanas, ahora)
      if (!sig) continue // pausadas o sin empezar: siguen esperando
      const cust = await adminDb.doc(`customers/${uid}`).get()
      if (cust.data()?.promociones?.acepta !== true || bajas.has(uid)) {
        for (const it of vivos) { await it.ref.update({ estado: 'omitida', motivo: 'sin_consentimiento', cerradaAt: ahora }); await contar(it.campanaId, { enCola: -1, omitidos: 1 }) }
        continue
      }
      if (!(await tomarCupo(uid, sig.campanaId, 'notificacion'))) {
        if (sig.motivo !== 'esperando_cupo') await sig.ref.update({ motivo: 'esperando_cupo' })
        continue
      }
      await pushPromo(uid, campanas[sig.campanaId], sig.campanaId)
      await sig.ref.update({ estado: 'enviada', motivo: null, enviadaAt: ahora })
      await contar(sig.campanaId, { enCola: -1, enviados: 1 })
    }
  } catch (err) {
    console.error('[scheduler] promociones:', err?.message || err)
  } finally {
    despachando = false
  }
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
      await sendPushForStaff('mercadeo', {}, { ...msg, soloA: email, clave: `mercadeo-${hoyColombia()}`, tipo: 'mercadeo', url: 'https://delistars.com/admin/' })
    }
  } catch (err) {
    console.error('[scheduler] Error en el aviso de mercadeo:', err?.message || err)
  }
}

// ─── Solicitudes de acceso al equipo → celular de administración ────────────
// Quien pide acceso de caja o domiciliario desde la app (POST /equipo/solicitudes)
// queda pendiente hasta que un admin lo apruebe en Panel → Usuarios. Esto le
// avisa al celular a cada admin que tenga notificaciones activas (staff_push).
// Al arrancar solo toma foto de las pendientes: no repite avisos viejos.
function watchSolicitudesAcceso() {
  const avisadas = new Set()
  let baseline = true
  adminDb.collection('solicitudes_acceso').where('estado', '==', 'pendiente')
    .onSnapshot((snap) => {
      for (const chg of snap.docChanges()) {
        if (chg.type === 'removed') continue
        const s = chg.doc.data()
        const clave = claveSolicitud(chg.doc.id, s)
        if (baseline || avisadas.has(clave)) { avisadas.add(clave); continue }
        avisadas.add(clave)
        const msg = mensajeSolicitud(s)
        for (const email of ADMIN_EMAILS) {
          sendPushForStaff(`solicitud-${chg.doc.id}`, {}, { ...msg, soloA: email, clave, tipo: 'solicitud', url: 'https://delistars.com/admin/' })
            .catch((e) => console.error('[scheduler] aviso de solicitud error:', e?.message || e))
        }
      }
      baseline = false
    }, (err) => console.error('[scheduler] vigía de solicitudes error:', err?.message || err))
  console.log('[scheduler] avisos de solicitudes de acceso a administración activos')
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
    // Cuánto esperar la respuesta del cliente a un cambio propuesto (§9.2, configurable).
    const esperaCambioMin = Number((await adminDb.doc('config/caja').get()).data()?.cambioEsperaMin) || 10
    for (const d of snap.docs) {
      const o = d.data()
      // Fase 7: cambio propuesto sin respuesta → la caja lo contacta (no se cancela ni se aplica solo).
      if (sinRespuestaDemasiado(o, now, esperaCambioMin)) {
        await sendPushForStaff(d.id, o, {
          rol: 'cashier', clave: `cambio-sin-respuesta-${o.cambioPropuesto?.propuestoAt?.toMillis?.() || 0}`, tipo: 'cambio',
          title: `⏳ El cliente no responde al cambio${o.orderNumber ? ` #${o.orderNumber}` : ''}`,
          body: `Lleva más de ${esperaCambioMin} min sin aceptar ni rechazar. Llámalo o escríbele por el chat.`,
        }).catch(() => {})
      }
      // Fase 6: domicilio confirmado que lleva 10 min sin domiciliario → administración.
      if (sinDomiciliarioDemasiado(o, now)) {
        for (const email of ADMIN_EMAILS) {
          await sendPushForStaff(d.id, o, {
            rol: 'admin', soloA: email, clave: 'sin-domiciliario-admin', tipo: 'sin_domiciliario',
            title: '🛵 Pedido sin domiciliario', url: 'https://delistars.com/admin/',
            body: `El pedido${o.orderNumber ? ` #${o.orderNumber}` : ''} de ${o.sedeName || 'una sede'} lleva más de 10 min confirmado y sin domiciliario.`,
          }).catch(() => {})
        }
      }
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
function notifyFor(o, soloEtapa = false) {
  const n = o.orderNumber ? ` #${o.orderNumber}` : ''
  // Etapa nueva "Listo" (Fase 2): no cambia el status viejo, solo la etapa.
  if (soloEtapa) {
    if (o.etapa !== 'listo') return null
    return o.deliveryMode === 'pickup'
      ? { title: '🛍️ Tu pedido está listo para recoger', body: `Tu pedido${n} te espera en la sede.` }
      : { title: '✅ Tu pedido está listo', body: `Tu pedido${n} ya está listo y pronto sale con el domiciliario.` }
  }
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

// ─── Centro de avisos (Fase 6) ───────────────────────────────────────────────
// Cada aviso queda en avisos/{destino}/items/{evento} (lo escribe el bot: las
// reglas solo le dejan crear). Si ya existía, el evento es un reintento: no se
// vuelve a avisar. Devuelve true si el aviso es nuevo.
async function guardarAviso(destino, evento, aviso) {
  if (!destino) return true
  try {
    await setDoc(doc(db, 'avisos', destino, 'items', evento), {
      tipo: aviso.tipo || 'pedido', titulo: aviso.title, cuerpo: aviso.body,
      pedidoId: aviso.pedidoId || null, enlace: aviso.url || null,
      leido: false, creadoAt: serverTimestamp(),
    })
    return true
  } catch (err) {
    // Ya existía (el bot no puede reescribirlo): es el mismo evento otra vez.
    if (err?.code === 'permission-denied') return false
    console.error('[scheduler] aviso no guardado:', err?.message || err)
    return true // sin poder guardarlo, mejor avisar que callar
  }
}

// Push a la app (aparatos registrados en dispositivos/{destino}/tokens):
// Expo para la app; FCM nativo si algún día se usa. No se mezclan con los
// tokens de la web.
async function pushApp(destino, msg, url, datos = {}) {
  if (!destino || !adminDb) return
  const snap = await adminDb.collection(`dispositivos/${destino}/tokens`).get().catch(() => null)
  if (!snap || snap.empty) return
  const expo = snap.docs.filter((d) => d.data().proveedor === 'expo')
  const fcm = snap.docs.filter((d) => d.data().proveedor === 'fcm')
  if (expo.length) {
    const tokens = expo.map((d) => d.data().token)
    try {
      const r = await fetch('https://exp.host/--/api/v2/push/send', {
        method: 'POST', headers: { 'content-type': 'application/json', accept: 'application/json' },
        body: JSON.stringify(mensajesExpo(tokens, msg, url, datos)),
      })
      const muertos = expoMuertos(tokens, await r.json().catch(() => null))
      for (const d of expo.filter((x) => muertos.includes(x.data().token))) await deleteDoc(doc(db, 'dispositivos', destino, 'tokens', d.id)).catch(() => {})
    } catch (err) { console.error('[scheduler] push Expo:', err?.message || err) }
  }
  if (fcm.length) {
    const res = await getMessaging().sendEachForMulticast({
      tokens: fcm.map((d) => d.data().token), notification: { title: msg.title, body: msg.body },
      data: { url, tipo: datos.tipo || msg.tipo || 'pedido', ...(datos.orderId ? { orderId: String(datos.orderId) } : {}), ...(datos.reclamoId ? { reclamoId: String(datos.reclamoId) } : {}) },
    }).catch(() => null)
    res?.responses.forEach((x, i) => {
      if (!x.success && (x.error?.code || '').includes('registration-token-not-registered')) deleteDoc(doc(db, 'dispositivos', destino, 'tokens', fcm[i].id)).catch(() => {})
    })
  }
}

/** Aviso a una persona del equipo o a la caja de una sede: centro de avisos + app. */
async function avisoEquipo(destino, evento, msg, pedidoId) {
  const nuevo = await guardarAviso(destino, evento, { ...msg, pedidoId, url: msg.url || 'https://delistars.com/domicilios/' })
  if (nuevo) await pushApp(destino, msg, msg.url || 'https://delistars.com/domicilios/', { orderId: pedidoId, tipo: msg.tipo || 'pedido' })
  return nuevo
}

async function sendPushForOrder(orderId, o, soloEtapa = false) {
  if (!o.clientUid) return
  const msg = notifyFor(o, soloEtapa)
  if (!msg) return
  const url = enlacePedido(orderId)
  const nuevo = await guardarAviso(o.clientUid, idEvento('pedido', orderId, soloEtapa ? `etapa-${o.etapa}` : `estado-${o.status}`), { ...msg, pedidoId: orderId, url })
  if (!nuevo) return
  await pushApp(o.clientUid, msg, url, { orderId, tipo: 'pedido' })
  await pushWebCliente(o.clientUid, msg, orderId, soloEtapa ? `etapa ${o.etapa}` : o.status)
}

// Push a la web del cliente (tokens del navegador en customers/{uid}.fcmTokens).
async function pushWebCliente(uid, msg, orderId, etiqueta) {
  const cust = await adminDb.doc(`customers/${uid}`).get()
  const tokens = cust.exists ? (cust.data().fcmTokens || []) : []
  if (!tokens.length) return
  const res = await getMessaging().sendEachForMulticast({
    tokens,
    notification: { title: msg.title, body: msg.body },
    data:    { orderId: String(orderId), url: enlacePedido(orderId) },
    webpush: { fcmOptions: { link: enlacePedido(orderId) } },
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
    await adminDb.doc(`customers/${uid}`)
      .update({ fcmTokens: FieldValue.arrayRemove(...bad) }).catch(() => {})
  }
  console.log(`[scheduler] push enviado (${etiqueta}) pedido ${orderId} → ${res.successCount}/${tokens.length}`)
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
    case 'quoted':
      // Domicilio confirmado sin nadie en turno (Fase 5): la caja decide.
      return o.sinDomiciliario && !o.driverEmail && o.deliveryMode !== 'pickup'
        ? { rol: 'cashier', title: '🛵 Pedido sin domiciliario', body: `El pedido${n} no tiene domiciliario en turno. Ábrelo y asígnalo a mano o espera.` }
        : null
    case 'accepted':
      // Asignado sin aceptación (Fase 5): el aviso al domiciliario sale por el cambio de domiciliario.
      if (o.asignacion) return null
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
  // Centro de avisos: a la persona (soloA) o a la caja de la sede, compartido.
  const destino = msg.soloA ? String(msg.soloA).toLowerCase() : msg.rol === 'cashier' ? destinoCaja(o.sedeId) : null
  if (destino) {
    const nuevo = await avisoEquipo(destino, idEvento(msg.clave || msg.tipo || o.status || 'aviso', orderId, msg.soloA ? '' : o.sedeId), msg, orderId)
    if (!nuevo) return
  }
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
  await sendPushForStaff(id, o, { ...mensajeDescuadre(o, r), clave: 'descuadre-domicilio' })
}

// Mensaje del chat: si lo escribió la caja, le llega al cliente; si lo escribió
// el cliente, a la caja de la sede.
async function avisarMensaje(id, o, m) {
  const n = o.orderNumber ? ` #${o.orderNumber}` : ''
  if (m.de === 'caja' && o.clientUid) {
    const msg = { title: `💬 Mensaje de ${o.sedeName || 'la sede'}`, body: m.texto || `Te escribieron sobre tu pedido${n}.`, tipo: 'mensaje' }
    const url = enlacePedido(id)
    if (await guardarAviso(o.clientUid, idEvento('pedido', id, 'msg', m.n), { ...msg, pedidoId: id, url })) {
      await pushApp(o.clientUid, msg, url, { orderId: id, tipo: msg.tipo })
      await pushWebCliente(o.clientUid, msg, id, `mensaje ${m.n}`)
    }
  } else if (m.de === 'cliente') {
    await sendPushForStaff(id, o, {
      rol: 'cashier', clave: `msg-${m.n}`, tipo: 'mensaje', title: `💬 Mensaje del cliente${n}`,
      body: m.texto || `${o.name || 'El cliente'} escribió en el chat.`,
    })
  }
}

// Excepciones del pedido (§9): la caja propone un cambio → al cliente; el
// cliente responde → a la caja; pide cancelar en reparto → a administración.
async function avisarExcepcion(id, o, anterior) {
  const n = o.orderNumber ? ` #${o.orderNumber}` : ''
  const pesos = (v) => `$${Number(v || 0).toLocaleString('es-CO')}`
  if (o.excepcion === 'cambio_pendiente' && o.clientUid) {
    const c = o.cambioPropuesto || {}
    const msg = {
      title: '✏️ La sede propone un cambio en tu pedido', tipo: 'cambio',
      body: `${c.motivo ? `${c.motivo}. ` : ''}Nuevo total: ${pesos(c.totalPrice)}. Entra y acéptalo o recházalo.`,
    }
    const url = enlacePedido(id)
    const evento = idEvento('pedido', id, 'cambio', c.propuestoAt?.toMillis?.() || Date.now())
    if (await guardarAviso(o.clientUid, evento, { ...msg, pedidoId: id, url })) {
      await pushApp(o.clientUid, msg, url, { orderId: id, tipo: msg.tipo, propuestaId: c.id })
      await pushWebCliente(o.clientUid, msg, id, 'cambio propuesto')
    }
    return
  }
  if (anterior === 'cambio_pendiente' && !o.excepcion) {
    const estado = o.cambioPropuesto?.estado
    const resp = o.cambioPropuesto?.respondidoAt?.toMillis?.() || Date.now()
    if (estado === 'aceptado') {
      await sendPushForStaff(id, o, { rol: 'cashier', clave: `cambio-aceptado-${resp}`, tipo: 'cambio', title: `✅ El cliente aceptó el cambio${n}`, body: `Ya puedes preparar el pedido${n} con lo nuevo (${pesos(o.totalPrice ?? o.cambioPropuesto?.totalPrice)}).` })
    } else if (estado === 'rechazado') {
      await sendPushForStaff(id, o, { rol: 'cashier', clave: `cambio-rechazado-${resp}`, tipo: 'cambio', title: `❌ El cliente rechazó el cambio${n}`, body: 'Queda el pedido original. Revisa si lo puedes preparar así o cancélalo con motivo.' })
    }
    return
  }
  if (o.excepcion === 'cancelacion_solicitada' && ['en_camino', 'llego'].includes(o.etapa)) {
    for (const email of ADMIN_EMAILS) {
      await sendPushForStaff(id, o, {
        rol: 'admin', soloA: email, clave: 'cancelacion-en-reparto', tipo: 'cancelacion', url: 'https://delistars.com/domicilios/',
        title: `🚫 Cancelación en reparto${n}`,
        body: `${o.name || 'El cliente'} pidió cancelar un pedido que ya va en camino${o.excepcionMotivo ? `: ${o.excepcionMotivo}` : ''}. Lo decide administración desde el panel de caja.`,
      }).catch(() => {})
    }
  }
}

async function avisarAsignacion(id, o, anterior) {
  const n = o.orderNumber ? ` #${o.orderNumber}` : ''
  await sendPushForStaff(id, o, {
    rol: 'driver', soloA: o.driverEmail, clave: `asignado-${o.driverEmail}`, title: '🛵 Nuevo domicilio para ti',
    body: `Pedido${n}${o.barrio ? ' — ' + o.barrio : ''}. Ya es tuyo: recógelo cuando esté listo.`,
  })
  if (anterior && anterior !== o.driverEmail) {
    await sendPushForStaff(id, o, {
      rol: 'driver', soloA: anterior, clave: `quitado-${anterior}-${o.driverEmail}`, title: '↪️ Te quitaron un pedido',
      body: `La caja le pasó el pedido${n} a otro domiciliario${o.reasignacionMotivo ? `: ${o.reasignacionMotivo}` : ''}.`,
    })
  }
}

// Vigila los pedidos recientes y notifica al cliente cuando su pedido cambia a
// un estado relevante (cotizado / en camino / llegó / entregado / rechazado).
function watchOrdersForPush() {
  const seen = new Map() // orderId -> { status, etapa } vistos por última vez
  let baseline = true    // en la primera carga NO se notifica (solo se toma foto)
  adminDb.collection('orders').orderBy('createdAt', 'desc').limit(150)
    .onSnapshot((snap) => {
      for (const chg of snap.docChanges()) {
        if (chg.type === 'removed') { seen.delete(chg.doc.id); continue }
        const id = chg.doc.id
        const o  = chg.doc.data()
        const prev = seen.get(id)
        seen.set(id, { status: o.status, etapa: o.etapa, driver: o.driverEmail || null, msgs: (o.clientMessages || []).length, exc: o.excepcion || null })
        if (!baseline && chg.type === 'added') {
          revisarDomicilioNuevo(id, o).catch((e) => console.error('[scheduler] revisión domicilio error:', e?.message || e))
        }
        if (baseline) continue
        // Cambió la excepción (Fase 7): cambio propuesto, respuesta del cliente,
        // cancelación pedida en reparto.
        if (prev && (prev.exc || null) !== (o.excepcion || null)) avisarExcepcion(id, o, prev.exc || null).catch((e) => console.error('[scheduler] aviso de excepción error:', e?.message || e))
        // Mensaje nuevo en el chat del pedido (Fase 6): al cliente o a la caja.
        const msgNuevo = mensajeNuevo(prev ? prev.msgs : null, o)
        if (msgNuevo) avisarMensaje(id, o, msgNuevo).catch((e) => console.error('[scheduler] aviso de mensaje error:', e?.message || e))
        // Asignación sin aceptación (Fase 5): avisarle a quien recibe el pedido
        // y, si fue una reasignación, a quien se lo quitaron.
        if (o.asignacion && o.driverEmail && (prev?.driver || null) !== o.driverEmail) {
          avisarAsignacion(id, o, prev?.driver || null).catch((e) => console.error('[scheduler] push asignación error:', e?.message || e))
        }
        if (prev && prev.status === o.status) {
          if (prev.etapa !== o.etapa) {
            sendPushForOrder(id, o, true).catch((e) => console.error('[scheduler] push error:', e?.message || e))
            // Listo en la sede: al domiciliario que lo tiene (Fase 6).
            if (o.etapa === 'listo' && o.driverEmail && o.deliveryMode !== 'pickup') {
              sendPushForStaff(id, o, {
                rol: 'driver', soloA: o.driverEmail, clave: 'listo', tipo: 'listo', title: '✅ Pedido listo para recoger',
                body: `El pedido${o.orderNumber ? ` #${o.orderNumber}` : ''} está listo en ${o.sedeName || 'la sede'}.`,
              }).catch((e) => console.error('[scheduler] aviso listo error:', e?.message || e))
            }
          }
          continue
        }
        // Fase 5: al confirmar, el domicilio se asigna solo y pasa de "pendiente"
        // directo a "aceptado" (sin quedar en "cotizado"): al cliente le llega
        // igual el aviso de que ya está cotizado y puede elegir cómo pagar.
        const paraCliente = prev?.status === 'pending' && o.status === 'accepted' && o.asignacion ? { ...o, status: 'quoted' } : o
        sendPushForOrder(id, paraCliente).catch((e) => console.error('[scheduler] push error:', e?.message || e))
        sendPushForStaff(id, o).catch((e) => console.error('[scheduler] push equipo error:', e?.message || e))
      }
      baseline = false
    }, (err) => console.error('[scheduler] watch pedidos error:', err?.message || err))
  console.log('[scheduler] push FCM activo (vigilando cambios de estado de pedidos)')
}

// ─── Chat cliente ↔ domiciliario (Fase 7, §8.3) ─────────────────────────────
// Vive en orders/{id}/chat_domiciliario, así que el vigía de pedidos no lo ve.
// Cada mensaje nuevo le avisa al otro lado: del domiciliario al cliente (centro
// de avisos + push a la app y a la web), del cliente al domiciliario asignado.
function watchChatDomiciliario() {
  let baseline = true
  adminDb.collectionGroup('chat_domiciliario').orderBy('ts', 'desc').limit(200)
    .onSnapshot(async (snap) => {
      if (baseline) { baseline = false; return }
      for (const chg of snap.docChanges()) {
        if (chg.type !== 'added') continue
        const m = chg.doc.data()
        const pedidoRef = chg.doc.ref.parent.parent
        if (!pedidoRef) continue
        try {
          const o = (await pedidoRef.get()).data()
          if (!o) continue
          const id = pedidoRef.id
          const n = o.orderNumber ? ` #${o.orderNumber}` : ''
          const texto = String(m.text || '').trim()
          const body = texto.length > 120 ? `${texto.slice(0, 117)}…` : texto
          if (m.role === 'driver' && o.clientUid) {
            const msg = { title: `💬 Mensaje de tu domiciliario${n}`, body: body || `${m.name || 'Tu domiciliario'} te escribió.`, tipo: 'mensaje' }
            const url = enlacePedido(id)
            if (await guardarAviso(o.clientUid, idEvento('pedido', id, 'msgdomi', chg.doc.id), { ...msg, pedidoId: id, url })) {
              await pushApp(o.clientUid, msg, url, { orderId: id, tipo: msg.tipo })
              await pushWebCliente(o.clientUid, msg, id, `mensaje del domiciliario`)
            }
          } else if (m.role === 'client' && o.driverEmail) {
            await sendPushForStaff(id, o, {
              rol: 'driver', soloA: o.driverEmail, clave: `msgcli-${chg.doc.id}`, tipo: 'mensaje',
              title: `💬 Mensaje del cliente${n}`, body: body || `${o.name || 'El cliente'} te escribió en el chat.`,
            })
          }
        } catch (e) { console.error('[scheduler] aviso chat domiciliario error:', e?.message || e) }
      }
    }, (err) => {
      // Si la consulta falla (por ejemplo, el índice de grupo aún se está
      // creando), se vuelve a intentar en un minuto en vez de quedarse muda.
      console.error('[scheduler] watch chat domiciliario error:', err?.message || err)
      setTimeout(() => { try { watchChatDomiciliario() } catch (e) { console.error('[scheduler] chat domiciliario reintento error:', e?.message || e) } }, 60000)
    })
  console.log('[scheduler] avisos del chat cliente ↔ domiciliario activos')
}

// ─── Devoluciones: aviso al celular de la caja ──────────────────────────────
// Elegir la devolución no cambia el estado del pedido (sigue rechazado o
// cancelado), así que watchOrdersForPush no lo ve. Además ese vigía solo mira
// los últimos 150 pedidos y la devolución puede ser de un pedido de días atrás.
// Por eso va aparte, consultando directo los pedidos con devolución pendiente.
function mensajeDevolucion(o, tipo) {
  const n = o.orderNumber ? ` #${o.orderNumber}` : ''
  const monto = `$${Number(o.devolucion?.monto || o.saldoAplicado?.usado || o.monto || 0).toLocaleString('es-CO')}`
  if (tipo === 'transferencia_solicitada') {
    return { rol: 'cashier', title: '💸 Devolución por transferencia', body: `${o.name || 'El cliente'} (pedido${n}) pidió que le transfieran ${monto}. Ábrelo para ver sus datos.` }
  }
  if (tipo === 'saldo_cuenta') {
    return { rol: 'cashier', title: '💸 Transferir saldo a favor', body: `${o.nombre || 'Un cliente'} eliminó su cuenta: hay que transferirle ${monto}. Ábrelo en la caja para ver sus datos.` }
  }
  if (tipo === 'cancelacion_solicitada') {
    return { rol: 'cashier', title: '⚠️ El cliente pidió cancelar', body: `${o.name || 'El cliente'} (pedido${n}) pidió cancelar${o.excepcionMotivo ? `: «${o.excepcionMotivo}»` : ''}. Ábrelo para aprobar o seguir.` }
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
        sendPushForStaff(d.id, o, { ...mensajeDevolucion(o, tipo), clave: `devolucion-${tipo}`, tipo: 'devolucion' })
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
  // Saldo de quien eliminó su cuenta (Fase 4, P-25): la caja se lo transfiere.
  vigilar(
    adminDb.collection('devoluciones_saldo').where('estado', '==', 'por_transferir'),
    () => 'saldo_cuenta',
  )
  // Solicitud de cancelación (Fase 4): no cambia el status viejo, así que el
  // vigía de pedidos tampoco la ve.
  vigilar(
    adminDb.collection('orders').where('excepcion', '==', 'cancelacion_solicitada'),
    () => 'cancelacion_solicitada',
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
      try { watchChatDomiciliario() }
      catch (err) { console.error('[scheduler] avisos del chat del domiciliario deshabilitados:', err?.message || err) }
      try { watchDevoluciones() }
      catch (err) { console.error('[scheduler] avisos de devoluciones deshabilitados:', err?.message || err) }
      try { watchSolicitudesAcceso() }
      catch (err) { console.error('[scheduler] avisos de solicitudes deshabilitados:', err?.message || err) }
      // Resumen del día al WhatsApp del dueño (11:45 PM, antes del cierre).
      cron.schedule('45 23 * * *', sendDailySummary, { timezone: TIMEZONE })
      // Vigía de pedidos sin cotizar: cada 3 min durante el servicio.
      cron.schedule('*/3 17-23 * * *', checkStuckOrders, { timezone: TIMEZONE })
      // Lo que tiene Mercadeo hoy → celular de administración, 10:00 a. m.
      cron.schedule('0 10 * * *', avisarMercadeoDelDia, { timezone: TIMEZONE })
      // Campañas de correo: envía cuando Mercadeo lo pide desde el panel.
      try { watchCampanas() } catch (err) { console.error('[scheduler] envío de campañas deshabilitado:', err?.message || err) }
      // Promociones por notificación: encolar y despachar cada minuto (§17.3).
      cron.schedule('* * * * *', procesarPromos, { timezone: TIMEZONE })
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

  console.log(`[scheduler] Listo. Horarios por sede en config/horarios (${TIMEZONE}); admin define el horario y la caja puede abrir o cerrar por el día.`)
}

main()
