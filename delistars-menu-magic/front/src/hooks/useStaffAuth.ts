import { useEffect, useState } from 'react'
import { onAuthStateChanged, signInWithPopup, signOut, type User } from 'firebase/auth'
import { auth, provider, loginAnon } from '@/services/firebase'

// Auth ligera para el menú: el cliente (o el equipo) inicia sesión desde la raíz.
// La sesión vale también en /domicilios/ por compartir proyecto Firebase y dominio.
export function useStaffAuth() {
  const [user, setUser] = useState<User | null>(null)

  useEffect(() => onAuthStateChanged(auth, (u) => setUser(u)), [])

  const login = () => signInWithPopup(auth, provider)
  const loginGuest = () => loginAnon()
  const logout = () => { signOut(auth) }

  // `user` es invitado (sin cuenta) cuando es anónimo
  const isGuest = !!user?.isAnonymous

  return { user, login, loginGuest, logout, isGuest }
}
