// Abre la plataforma de clientes todos los días a las 5:30pm y la cierra a
// las 11:30pm (hora Colombia), sin que el cajero tenga que tocar el
// interruptor. Usa una cuenta de Firebase dedicada con permisos MUY
// limitados (solo puede escribir config/client_platform.active) — nunca una
// llave de admin que tendría acceso a toda la base de datos.
const { initializeApp } = require('firebase/app')
const { getAuth, signInWithEmailAndPassword } = require('firebase/auth')
const { getFirestore, doc, setDoc, serverTimestamp } = require('firebase/firestore')
const cron = require('node-cron')
// Solo para LEER pedidos al calcular tiempos de entrega (SA de solo lectura,
// la misma del backup). La escritura de estadísticas va por el bot (reglas).
const admin = require('firebase-admin')

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

async function setPlatformActive(active) {
  try {
    await setDoc(doc(db, 'config', 'client_platform'), {
      active,
      updatedBy: BOT_EMAIL,
      updatedAt: serverTimestamp(),
    }, { merge: true })
    console.log(`[scheduler] ${new Date().toISOString()} — plataforma ${active ? 'ABIERTA' : 'CERRADA'} automáticamente`)
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
    const snap = await admin.firestore()
      .collection('orders')
      .orderBy('deliveredAt', 'desc')
      .limit(200)
      .get()
    const bySede = {}
    snap.forEach((d) => {
      const o = d.data()
      if (!o.deliveredAt?.toMillis || !o.createdAt?.toMillis || !o.sedeId) return
      const min = (o.deliveredAt.toMillis() - o.createdAt.toMillis()) / 60000
      if (min < 10 || min > 180) return // atípicos: pruebas, pedidos olvidados
      ;(bySede[o.sedeId] = bySede[o.sedeId] || []).push(min)
    })
    const stats = {}
    for (const [sede, arr] of Object.entries(bySede)) {
      arr.sort((a, b) => a - b)
      stats[sede] = { medianMin: Math.round(arr[Math.floor(arr.length / 2)]), sample: arr.length }
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

  cron.schedule('30 17 * * *', () => setPlatformActive(true),  { timezone: TIMEZONE })
  cron.schedule('30 23 * * *', () => setPlatformActive(false), { timezone: TIMEZONE })

  // Estadísticas de tiempo de entrega: requieren la llave de la SA de solo
  // lectura montada en el contenedor. Si no está, esta parte simplemente se
  // omite (el abre/cierra de plataforma no depende de ella).
  if (process.env.GOOGLE_APPLICATION_CREDENTIALS) {
    try {
      admin.initializeApp({ projectId: firebaseConfig.projectId })
      cron.schedule('*/30 17-23 * * *', updateEtaStats, { timezone: TIMEZONE })
      updateEtaStats() // una vez al arrancar
      console.log('[scheduler] eta_stats activo (cada 30 min en horario de servicio)')
    } catch (err) {
      console.error('[scheduler] eta_stats deshabilitado:', err?.message || err)
    }
  } else {
    console.log('[scheduler] eta_stats omitido: sin GOOGLE_APPLICATION_CREDENTIALS')
  }

  console.log(`[scheduler] Listo. Abre 5:30pm / cierra 11:30pm (${TIMEZONE}). El cajero igual puede prender/apagar manualmente en cualquier momento.`)
}

main()
