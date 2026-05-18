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

        // Restore viewingAs from localStorage so role choice survives page refresh
        if (resolvedRole !== ROLES.CLIENT) {
          const saved = localStorage.getItem(`viewingAs_${firebaseUser.uid}`)
          if (saved !== null) {
            // stored as 'null' string (own role) or a role string like 'client'
            const parsed = saved === 'null' ? null : saved
            // validate it's still a valid option for this user
            const valid = parsed === null || resolvedAllRoles.includes(parsed)
            setViewingAs(valid ? parsed : undefined)
          } else {
            setViewingAs(undefined) // first visit — show role choice
          }
        } else {
          setViewingAs(null)
        }

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

  // Persists role choice across page refreshes
  const selectViewingAs = (v) => {
    setViewingAs(v)
    if (user) {
      if (v === undefined) {
        localStorage.removeItem(`viewingAs_${user.uid}`)
      } else {
        localStorage.setItem(`viewingAs_${user.uid}`, v === null ? 'null' : String(v))
      }
    }
  }

  const logout = async () => {
    const uid = user?.uid
    await signOut(auth)
    setSede(null)
    setViewingAs(null)
    if (uid) {
      localStorage.removeItem(`sede_${uid}`)
      localStorage.removeItem(`viewingAs_${uid}`)
    }
  }

  const selectSede = (sedeObj) => {
    setSede(sedeObj)
    if (user && role !== ROLES.CLIENT) localStorage.setItem(`sede_${user.uid}`, JSON.stringify(sedeObj))
  }

  // Role the user is currently viewing
  const effectiveRole = viewingAs || role

  return (
    <AuthContext.Provider value={{
      user, role, allRoles, effectiveRole, viewingAs, setViewingAs: selectViewingAs,
      sede, selectSede, loading, login, loginGuest, logout,
    }}>
      {children}
    </AuthContext.Provider>
  )
}

export const useAuth = () => useContext(AuthContext)
