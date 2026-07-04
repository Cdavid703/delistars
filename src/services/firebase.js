import { initializeApp } from 'firebase/app'
import { getAuth, GoogleAuthProvider, signInAnonymously } from 'firebase/auth'
import {
  getFirestore, runTransaction, doc,
  collection, getDocs, addDoc, updateDoc, serverTimestamp, Timestamp,
} from 'firebase/firestore'
import { getStorage } from 'firebase/storage'

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
export const LOYALTY_REWARD = {
  type:        'hamburguesa_especial',
  name:        'Hamburguesa Especial',
  price:       20000,
  description: 'Nuestra receta estrella elaborada con ingredientes seleccionados para brindar una experiencia de sabor superior, incluye queso y tocineta.',
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

    const today = new Date().toISOString().slice(0, 10)
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
