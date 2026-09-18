import { initializeApp } from 'firebase/app'
import { getAuth, GoogleAuthProvider, signInAnonymously, signInWithPopup, linkWithPopup } from 'firebase/auth'
import { getFirestore } from 'firebase/firestore'

// Mismo proyecto Firebase que el resto de DeliStars. La sesión iniciada aquí
// (en el menú raíz) es válida en /domicilios/ por compartir proyecto y dominio.
const firebaseConfig = {
  apiKey:            import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain:        import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId:         import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket:     import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId:             import.meta.env.VITE_FIREBASE_APP_ID,
}

const app = initializeApp(firebaseConfig)
export const auth = getAuth(app)
export const db = getFirestore(app)
export const provider = new GoogleAuthProvider()
provider.setCustomParameters({ prompt: 'select_account' })

// Login de cliente sin cuenta (invitado)
export const loginAnon = () => signInAnonymously(auth)

// Entrar con Google SIN perder lo que ya hizo como invitado.
//
// El problema real: el cliente pedía como invitado (sesión anónima), después
// entraba con Google y Firebase le creaba una cuenta NUEVA. Sus pedidos
// quedaban colgados del usuario anónimo viejo, así que en su panel "no
// aparecía nada": los daba por perdidos y volvía a pedir. En 90 días, 35 de
// los 149 clientes que repitieron pidieron con otra cuenta.
//
// La solución es ENLAZAR la cuenta anónima con la de Google: el uid se
// mantiene y los pedidos (y la fidelización) siguen ahí. Si ese correo ya
// tenía cuenta propia, no se puede enlazar: se entra normal, que es lo que
// pasaba antes, y el cliente recupera su historial de esa cuenta de Google.
export async function loginGoogle() {
  const actual = auth.currentUser
  if (actual?.isAnonymous) {
    try {
      return await linkWithPopup(actual, provider)
    } catch (err) {
      const code = (err as { code?: string })?.code || ''
      // Ese correo ya tiene cuenta propia (o el anónimo ya no vale): se entra
      // normal. Cualquier otro error (popup cerrado) se propaga tal cual.
      if (!['auth/credential-already-in-use', 'auth/email-already-in-use',
            'auth/provider-already-linked', 'auth/user-token-expired',
            'auth/user-mismatch', 'auth/invalid-user-token'].includes(code)) throw err
    }
  }
  return signInWithPopup(auth, provider)
}

