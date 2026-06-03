import { initializeApp } from 'firebase/app'
import { getAuth, GoogleAuthProvider, signInAnonymously } from 'firebase/auth'
import { getFirestore, runTransaction, doc } from 'firebase/firestore'
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

// Contador global de pedidos — se resetea cada día y devuelve número formateado (01, 02…).
// Usa counters/orders { lastNumber: number, date: "YYYY-MM-DD" } en Firestore.
export async function getNextOrderNumber() {
  const today = new Date().toISOString().slice(0, 10)
  const counterRef = doc(db, 'counters', 'orders')
  return runTransaction(db, async (tx) => {
    const snap = await tx.get(counterRef)
    const data = snap.exists() ? snap.data() : {}
    const lastNum = data.date === today ? (Number(data.lastNumber) || 0) : 0
    const next = lastNum + 1
    tx.set(counterRef, { lastNumber: next, date: today }, { merge: true })
    return String(next).padStart(2, '0')
  })
}
