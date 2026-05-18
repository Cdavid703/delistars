import { createContext, useContext, useEffect, useState } from 'react'
import { onAuthStateChanged, signInWithPopup, signOut } from 'firebase/auth'
import { doc, getDoc, collection, getDocs } from 'firebase/firestore'
import { auth, db, provider, loginAnon } from '../services/firebase'
import { resolveRole, getAllRoles, ROLES } from '../services/roles'

const AuthContext = createContext(null)

export function AuthProvider({ children }) {
  const [user,        setUser]        = useState(null)
  const [role,        setRole]        = useState(null)
  const [allRoles,    setAllRoles]    = useState([])
  const [viewingAs,   setViewingAs]   = useState(undefined) // undefined=not chosen, null=own role, string=rol elegido
  const [sede,        setSede]        = useState(null)
  const [loading,     setLoading]     = useState(true)

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (firebaseUser) => {
      if (firebaseUser) {
        // Load dynamic role lists from Firestore
        const [cashierSnap, driverSnap] = await Promise.all([
          getDocs(collection(db, 'roles_cashiers')),
          getDocs(collection(db, 'roles_drivers')),
        ]).catch(() => [{ docs: [] }, { docs: [] }])

        const dynamicCashiers = cashierSnap.docs?.map(d => d.id) || []
        const dynamicDrivers  = driverSnap.docs?.map(d => d.id)  || []

        const resolvedRole = resolveRole(
          firebaseUser.email,
          dynamicCashiers,
          dynamicDrivers
        )
        const resolvedAllRoles = getAllRoles(
          firebaseUser.email,
          dynamicCashiers,
          dynamicDrivers
        )

        setUser(firebaseUser)
        setRole(resolvedRole)
        setAllRoles(resolvedAllRoles)
        setViewingAs(undefined)

        // Restore sede from localStorage — only for staff, never for pure clients
        if (resolvedRole !== ROLES.CLIENT) {
          const savedSede = localStorage.getItem(`sede_${firebaseUser.uid}`)
          if (savedSede) setSede(JSON.parse(savedSede))
        }
      } else {
        setUser(null)
        setRole(null)
        setSede(null)
        setViewingAs(null)
      }
      setLoading(false)
    })
    return unsub
  }, [])

  const login      = () => signInWithPopup(auth, provider)
  const loginGuest = () => loginAnon()

  const logout = async () => {
    await signOut(auth)
    setSede(null)
    setViewingAs(null)
    localStorage.removeItem(`sede_${user?.uid}`)
  }

  const selectSede = (sedeObj) => {
    setSede(sedeObj)
    if (user && role !== ROLES.CLIENT) localStorage.setItem(`sede_${user.uid}`, JSON.stringify(sedeObj))
  }

  // Role the user is currently viewing
  const effectiveRole = viewingAs || role

  return (
    <AuthContext.Provider value={{
      user, role, allRoles, effectiveRole, viewingAs, setViewingAs,
      sede, selectSede, loading, login, loginGuest, logout,
    }}>
      {children}
    </AuthContext.Provider>
  )
}

export const useAuth = () => useContext(AuthContext)
