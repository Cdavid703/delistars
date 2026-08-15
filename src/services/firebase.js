import { initializeApp } from 'firebase/app'
import { getAuth, GoogleAuthProvider, signInAnonymously } from 'firebase/auth'
import {
  getFirestore, runTransaction, doc,
  collection, getDocs, addDoc, updateDoc, setDoc, serverTimestamp, Timestamp, arrayUnion,
} from 'firebase/firestore'
import { getStorage } from 'firebase/storage'
import { getMessaging, getToken, onMessage, isSupported } from 'firebase/messaging'

const firebaseConfig = {
  apiKey:            import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain:        import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId:         import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket:     import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId:             import.meta.env.VITE_FIREBASE_APP_ID,
}

const app             = initializeApp(firebaseConfig)
export const auth     = getAuth(app)
export const db       = getFirestore(app)
export const storage  = getStorage(app)
export const provider = new GoogleAuthProvider()
export const loginAnon = () => signInAnonymously(auth)

provider.setCustomParameters({ prompt: 'select_account' })

// ─── Notificaciones push (FCM) ────────────────────────────────────────────────
// Clave pública VAPID del proyecto (no es secreta: se entrega al navegador).
export const VAPID_KEY = 'BLUoTFw_6LKPI6f8_7DJMTsEVAynKnwsmZBb0qRsE_1GQZcjKZaCG-yfhYuI2Jy1XmEbwlAuBdbp2LlD3rl1Ymo'

// Registra el service worker de FCM (bajo /domicilios/) pasándole la config
// pública por query-params, para no tener que hornearla en el archivo estático.
function registerFcmSw() {
  const p = new URLSearchParams({
    apiKey:            firebaseConfig.apiKey || '',
    projectId:         firebaseConfig.projectId || '',
    messagingSenderId: firebaseConfig.messagingSenderId || '',
    appId:             firebaseConfig.appId || '',
  })
  // Scope propio (sub-ruta) para NO reemplazar al service worker de la PWA que
  // ya vive en /domicilios/. El push en segundo plano no depende del scope.
  return navigator.serviceWorker.register(
    `${import.meta.env.BASE_URL}firebase-messaging-sw.js?${p.toString()}`,
    { scope: `${import.meta.env.BASE_URL}fcm/` },
  )
}

// Estado del permiso de notificaciones ('default' | 'granted' | 'denied' | 'unsupported').
export function pushPermission() {
  return ('Notification' in window) ? Notification.permission : 'unsupported'
}

// Pide permiso, obtiene el token FCM del dispositivo y lo guarda en el perfil
// del cliente (customers/{uid}.fcmTokens). Devuelve { ok, reason }.
export async function enablePush(uid) {
  try {
    if (!uid || !('Notification' in window) || !(await isSupported())) {
      return { ok: false, reason: 'unsupported' }
    }
    const perm = await Notification.requestPermission()
    if (perm !== 'granted') return { ok: false, reason: perm === 'denied' ? 'denied' : 'dismissed' }
    const swReg = await registerFcmSw()
    const token = await getToken(getMessaging(app), { vapidKey: VAPID_KEY, serviceWorkerRegistration: swReg })
    if (!token) return { ok: false, reason: 'no-token' }
    await setDoc(doc(db, 'customers', uid),
      { fcmTokens: arrayUnion(token), updatedAt: serverTimestamp() }, { merge: true })
    return { ok: true, token }
  } catch (e) {
    console.error('[push] enablePush error:', e)
    return { ok: false, reason: 'error' }
  }
}

// Notificaciones con la app ABIERTA (por si el cliente la tiene en primer plano).
export async function listenForegroundPush(cb) {
  try {
    if (!(await isSupported())) return () => {}
    return onMessage(getMessaging(app), cb)
  } catch { return () => {} }
}

// Fecha del día en HORA COLOMBIA (America/Bogota), formato YYYY-MM-DD.
// ⚠️ Antes se usaba la fecha UTC: en Colombia el día UTC cambia a las 7:00 PM,
// así que el contador se reiniciaba a 001 EN PLENA JORNADA (el turno es
// 5:30–11:30 PM). Esa era la causa principal de números repetidos/saltados.
const bogotaToday = () =>
  new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Bogota' }).format(new Date())

// Contador de pedidos POR SEDE — cada sede tiene su propio contador,
// independiente del de las demás, y se reinicia cada día (hora Colombia).
// Usa counters/orders_<sedeId> { lastNumber: number, date: "YYYY-MM-DD" }.
// Solo para asignar número a pedidos YA existentes sin número (fallback al
// cotizar). Para crear pedidos nuevos usar SIEMPRE createOrderWithNumber.
export async function getNextOrderNumber(sedeId) {
  const today = bogotaToday()
  const counterRef = doc(db, 'counters', `orders_${sedeId || 'default'}`)
  return runTransaction(db, async (tx) => {
    const snap = await tx.get(counterRef)
    const data = snap.exists() ? snap.data() : {}
    const lastNum = data.date === today ? (Number(data.lastNumber) || 0) : 0
    const next = lastNum + 1
    tx.set(counterRef, { lastNumber: next, date: today }, { merge: true })
    return String(next).padStart(3, '0')
  })
}

// Crea el pedido Y le asigna su número consecutivo en UNA SOLA transacción
// atómica: o pasan las dos cosas o ninguna. Así es imposible "quemar" números
// (contador que avanza sin pedido) o crear pedidos sin número (que luego
// recibían uno tardío al cotizar y desordenaban la secuencia).
export async function createOrderWithNumber(sedeId, orderData) {
  const today = bogotaToday()
  const counterRef = doc(db, 'counters', `orders_${sedeId || 'default'}`)
  const orderRef = doc(collection(db, 'orders')) // id generado por adelantado
  const orderNumber = await runTransaction(db, async (tx) => {
    const snap = await tx.get(counterRef)
    const data = snap.exists() ? snap.data() : {}
    const lastNum = data.date === today ? (Number(data.lastNumber) || 0) : 0
    const next = lastNum + 1
    const num = String(next).padStart(3, '0')
    tx.set(counterRef, { lastNumber: next, date: today }, { merge: true })
    tx.set(orderRef, { ...orderData, orderNumber: num })
    return num
  })
  return { orderRef, orderNumber }
}

// ─── Fidelización ───────────────────────────────────────────────────────────
// Progreso independiente por sede. Cada 10 domicilios entregados (1 por día,
// solo domicilios — no recoger en sede) gana 1 premio. Tope de 3 premios
// disponibles a la vez por sede: al llegar a 30 el progreso se reinicia a 0.
// Los premios sin usar caducan 60 días después de ganarse.
// El premio son DOS productos, no uno: la Hamburguesa Especial ($20.000) y el
// Perro Grande con tocineta ($19.000). El `type` se queda como estaba porque
// va grabado en los premios ya otorgados y nada lo consulta.
export const LOYALTY_REWARD = {
  type:        'hamburguesa_especial',
  name:        'Hamburguesa Especial + Perro Grande con tocineta',
  price:       39000,
  description: 'Nuestra Hamburguesa Especial —receta estrella con queso y tocineta— junto a un Perro Grande con tocineta premium.',
}
const LOYALTY_GOAL       = 10
const LOYALTY_CYCLE      = 30
const LOYALTY_MAX_REWARDS = 3
const LOYALTY_EXPIRY_MS  = 60 * 24 * 60 * 60 * 1000

function rewardsCol(uid) {
  return collection(db, 'customers', uid, 'rewards')
}

/** Todos los premios (cualquier estado) del cliente, más recientes primero. */
export async function getLoyaltyRewards(uid) {
  if (!uid) return []
  const snap = await getDocs(rewardsCol(uid))
  return snap.docs
    .map(d => ({ id: d.id, ...d.data() }))
    .sort((a, b) => (b.earnedAt?.toMillis?.() || 0) - (a.earnedAt?.toMillis?.() || 0))
}

/** Premios vigentes (disponibles y no vencidos) de una sede. */
export function availableRewardsForSede(rewards, sedeId) {
  const now = Date.now()
  return rewards.filter(r =>
    r.sedeId === sedeId &&
    r.status === 'available' &&
    (r.expiresAt?.toMillis?.() ?? Infinity) > now
  )
}

// Se llama cuando el domiciliario marca un pedido como entregado. Cuenta
// progreso (best-effort, nunca bloquea la entrega) solo si: es a domicilio
// (no pickup) y el cliente inició con cuenta de Google real (clientEmail).
export async function registerLoyaltyDelivery(order) {
  try {
    if (!order?.clientUid || !order?.clientEmail) return
    if (order.deliveryMode === 'pickup') return
    const sedeId = order.sedeId
    if (!sedeId) return

    // Día en hora Colombia (con UTC, dos entregas de la misma noche —antes y
    // después de las 7 PM— contaban como "días distintos").
    const today = bogotaToday()
    const customerRef = doc(db, 'customers', order.clientUid)

    const newCount = await runTransaction(db, async (tx) => {
      const snap = await tx.get(customerRef)
      const data = snap.exists() ? snap.data() : {}
      const sedeLoyalty = data.loyalty?.[sedeId] || {}
      if (sedeLoyalty.lastCountedDate === today) return null // ya contado hoy
      const next      = (Number(sedeLoyalty.count) || 0) + 1
      const nextTotal = (Number(sedeLoyalty.totalDelivered) || 0) + 1
      tx.set(customerRef, {
        loyalty: {
          [sedeId]: {
            count:           next === LOYALTY_CYCLE ? 0 : next,
            totalDelivered:  nextTotal,
            lastCountedDate: today,
          },
        },
      }, { merge: true })
      return next
    })

    if (!newCount || newCount % LOYALTY_GOAL !== 0) return

    const rewards = await getLoyaltyRewards(order.clientUid)
    const available = availableRewardsForSede(rewards, sedeId)
    if (available.length >= LOYALTY_MAX_REWARDS) return // tope alcanzado, no se otorga uno nuevo

    await addDoc(rewardsCol(order.clientUid), {
      sedeId,
      type:       LOYALTY_REWARD.type,
      earnedAt:   serverTimestamp(),
      expiresAt:  Timestamp.fromMillis(Date.now() + LOYALTY_EXPIRY_MS),
      status:     'available',
      redeemedAt: null,
      orderId:    null,
      notified:   false,
      cycleReset: newCount === LOYALTY_CYCLE,
    })
  } catch (_) { /* best-effort: nunca debe romper el flujo de entrega */ }
}

/** El cliente marca como canjeados N premios (ya escogidos) en un pedido recién creado. */
export async function redeemLoyaltyRewards(uid, rewardIds, orderId) {
  await Promise.all(rewardIds.map(id =>
    updateDoc(doc(db, 'customers', uid, 'rewards', id), {
      status:     'redeemed',
      redeemedAt: serverTimestamp(),
      orderId,
    })
  ))
}

/** El cliente confirma que ya vio el aviso de "ganaste un premio". */
export async function markRewardNotified(uid, rewardId) {
  await updateDoc(doc(db, 'customers', uid, 'rewards', rewardId), { notified: true })
}

// Si un pedido con premio canjeado termina rechazado, se devuelve el premio.
export async function restoreLoyaltyRedemption(order) {
  const rewardIds = order?.loyaltyRedemption?.rewardIds
  if (!rewardIds?.length || !order.clientUid) return
  await Promise.all(rewardIds.map(id =>
    updateDoc(doc(db, 'customers', order.clientUid, 'rewards', id), {
      status:     'available',
      redeemedAt: null,
      orderId:    null,
    }).catch(() => {})
  ))
}
