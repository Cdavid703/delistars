import { create } from 'zustand'
import { onAuthStateChanged, signInWithPopup, signOut, type User, type AuthProvider } from 'firebase/auth'
import { doc, getDoc } from 'firebase/firestore'
import { auth, db, provider, microsoftProvider, isAdminEmail, isMarketingEmail } from '@/services/firebase'

// Quién puede entrar al panel y qué ve:
//   · admin    → todo el panel.
//   · mercadeo → solo Mercadeo y Correo.
// Cualquier otra cuenta se cierra.
export type PanelRole = 'admin' | 'mercadeo'

interface AuthState {
  user: User | null       // solo se setea si tiene acceso al panel
  role: PanelRole | null
  ready: boolean          // el estado de auth ya se resolvió
  loading: boolean        // login en curso
  login: () => Promise<void>
  loginMicrosoft: () => Promise<void>
  logout: () => void
}

/** Rol en el panel para un correo, o null si no tiene acceso. */
async function rolDe(email?: string | null): Promise<PanelRole | null> {
  if (!email) return null
  if (isAdminEmail(email)) return 'admin'
  const e = email.toLowerCase()
  try {
    const baja = await getDoc(doc(db, 'roles_disabled', e))
    if (baja.exists()) return null
  } catch { /* sin permiso para leer bajas: se sigue con la lista fija */ }
  if (isMarketingEmail(e)) return 'mercadeo'
  try {
    const m = await getDoc(doc(db, 'roles_marketing', e))
    if (m.exists()) return 'mercadeo'
  } catch { /* reglas aún sin roles_marketing: solo cuentan los fijos */ }
  return null
}

// Mensajes claros para los errores típicos del login.
function mensajeError(err: unknown, proveedor: 'Google' | 'Microsoft'): string {
  const code = (err as { code?: string })?.code || ''
  if (code === 'auth/operation-not-allowed') return `El ingreso con ${proveedor} todavía no está activado.`
  if (code === 'auth/account-exists-with-different-credential') {
    return `Ese correo ya entra con ${proveedor === 'Microsoft' ? 'Google' : 'Microsoft'}: usa ese botón.`
  }
  if (code === 'auth/popup-closed-by-user' || code === 'auth/cancelled-popup-request') return 'Cerraste la ventana antes de terminar.'
  if (code === 'auth/popup-blocked') return 'El navegador bloqueó la ventana de ingreso. Permite ventanas emergentes e intenta de nuevo.'
  return (err as Error)?.message || 'Error al iniciar sesión'
}

async function ingresar(p: AuthProvider, nombre: 'Google' | 'Microsoft') {
  useAuthStore.setState({ loading: true })
  try {
    let res
    try {
      res = await signInWithPopup(auth, p)
    } catch (err) {
      throw new Error(mensajeError(err, nombre))
    }
    if (!(await rolDe(res.user.email))) {
      await signOut(auth)
      throw new Error('Esta cuenta no tiene acceso al panel')
    }
    // onAuthStateChanged se encarga de setear user y role
  } finally {
    useAuthStore.setState({ loading: false })
  }
}

export const useAuthStore = create<AuthState>(() => ({
  user: null,
  role: null,
  ready: false,
  loading: false,

  login: () => ingresar(provider, 'Google'),
  loginMicrosoft: () => ingresar(microsoftProvider, 'Microsoft'),

  logout: () => { signOut(auth) },
}))

// Hidratar el estado de sesión: solo quien tiene rol queda autenticado.
onAuthStateChanged(auth, async (u) => {
  if (!u) {
    useAuthStore.setState({ user: null, role: null, ready: true })
    return
  }
  const role = await rolDe(u.email)
  if (!role) {
    signOut(auth)
    useAuthStore.setState({ user: null, role: null, ready: true })
    return
  }
  useAuthStore.setState({ user: u, role, ready: true })
})
