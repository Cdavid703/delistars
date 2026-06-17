import { useEffect, useState } from 'react'
import { onAuthStateChanged, signInWithPopup, signOut, type User } from 'firebase/auth'
import { auth, provider } from '@/services/firebase'

// Auth ligera para el menú: el equipo inicia sesión con Google para ver "Mis turnos".
export function useStaffAuth() {
  const [user, setUser] = useState<User | null>(null)

  useEffect(() => onAuthStateChanged(auth, (u) => setUser(u)), [])

  const login = () => { signInWithPopup(auth, provider).catch(() => {}) }
  const logout = () => { signOut(auth) }

  return { user, login, logout }
}
