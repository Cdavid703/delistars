// Abre la plataforma de clientes todos los días a las 5:30pm y la cierra a
// las 11:30pm (hora Colombia), sin que el cajero tenga que tocar el
// interruptor. Usa una cuenta de Firebase dedicada con permisos MUY
// limitados (solo puede escribir config/client_platform.active) — nunca una
// llave de admin que tendría acceso a toda la base de datos.
const { initializeApp } = require('firebase/app')
const { getAuth, signInWithEmailAndPassword } = require('firebase/auth')
const { getFirestore, doc, setDoc, serverTimestamp } = require('firebase/firestore')
const cron = require('node-cron')

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

  console.log(`[scheduler] Listo. Abre 5:30pm / cierra 11:30pm (${TIMEZONE}). El cajero igual puede prender/apagar manualmente en cualquier momento.`)
}

main()
