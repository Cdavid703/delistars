import { create } from 'zustand'
import { onAuthStateChanged, signInWithPopup, signOut, type User } from 'firebase/auth'
import { auth, provider, isAdminEmail } from '@/services/firebase'

interface AuthState {
  user: User | null      // solo se setea si es admin
  ready: boolean         // el estado de auth ya se resolvió
  loading: boolean       // login en curso
  login: () => Promise<void>
  logout: () => void
}

export const useAuthStore = create<AuthState>((set) => ({
  user: null,
  ready: false,
  loading: false,

  login: async () => {
    set({ loading: true })
    try {
      const res = await signInWithPopup(auth, provider)
      if (!isAdminEmail(res.user.email)) {
        await signOut(auth)
        throw new Error('Esta cuenta no tiene acceso de administrador')
      }
      // onAuthStateChanged se encarga de setear el user
    } finally {
      set({ loading: false })
    }
  },

  logout: () => { signOut(auth) },
}))

// Hidratar el estado de sesión: solo admins quedan autenticados.
onAuthStateChanged(auth, (u) => {
  if (u && !isAdminEmail(u.email)) {
    signOut(auth)
    useAuthStore.setState({ user: null, ready: true })
    return
  }
  useAuthStore.setState({ user: u, ready: true })
})
