import { createContext, useContext, useEffect, useState } from 'react'
import { onAuthStateChanged, signOut } from 'firebase/auth'
import { collection, getDocs } from 'firebase/firestore'
import { auth, db, loginAnon, loginGoogle, elegirOtraCuentaGoogle } from '../services/firebase'
import { resolveRole, getAllRoles, ROLES } from '../services/roles'

const AuthContext = createContext(null)

export function AuthProvider({ children }) {
  const [user,        setUser]        = useState(null)
  const [role,        setRole]        = useState(null)
  const [allRoles,    setAllRoles]    = useState([])
  const [viewingAs,   setViewingAs]   = useState(undefined) // undefined=not chosen, null=own role, string=rol elegido
  const [sede,        setSede]        = useState(null)
  const [loading,     setLoading]     = useState(true)
  // «Ahora está Laura en esta caja»: aviso de unos segundos tras cambiar de empleado.
  const [avisoCambio, setAvisoCambio] = useState(null)

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (firebaseUser) => {
      if (firebaseUser) {
        // Cada lista se lee por separado y tolera fallas: si una colección no
        // se puede leer (reglas de Firestore sin publicar), esa lista queda
        // vacía pero NO se pierden las demás ni los roles hardcodeados.
        const safeIds = async (col) => {
          try { return (await getDocs(collection(db, col))).docs.map(d => d.id) }
          catch { return [] }
        }
        const [dynamicCashiers, dynamicDrivers, disabledEmails] = await Promise.all([
          safeIds('roles_cashiers'),
          safeIds('roles_drivers'),
          safeIds('roles_disabled'),
        ])

        const resolvedRole = resolveRole(
          firebaseUser.email,
          dynamicCashiers,
          dynamicDrivers,
          disabledEmails
        )
        const resolvedAllRoles = getAllRoles(
          firebaseUser.email,
          dynamicCashiers,
          dynamicDrivers,
          disabledEmails
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
          // Cambio de empleado: el aparato sigue en su sede (la del puesto).
          const delPuesto = sessionStorage.getItem('ds_sede_puesto')
          sessionStorage.removeItem('ds_sede_puesto')
          const savedSede = delPuesto || localStorage.getItem(`sede_${firebaseUser.uid}`)
          if (savedSede) {
            try {
              setSede(JSON.parse(savedSede))
              if (delPuesto) localStorage.setItem(`sede_${firebaseUser.uid}`, delPuesto)
            } catch { localStorage.removeItem(`sede_${firebaseUser.uid}`) }
          }
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

  // Enlaza la cuenta de invitado en vez de crear una nueva (ver loginGoogle).
  const login      = () => loginGoogle()
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

  /**
   * Cambiar de empleado (§6.3) en un aparato compartido: quien toma el puesto
   * entra con su cuenta de Google y reemplaza a la anterior. El aparato conserva
   * su sede (y en la caja, si es el principal o el que imprime). Devuelve
   * { cambio: false } si cancelaron o eligieron la misma cuenta.
   */
  const cambiarDeEmpleado = async () => {
    const anterior = user?.uid
    try { if (sede) sessionStorage.setItem('ds_sede_puesto', JSON.stringify(sede)) } catch { /* sin almacenamiento */ }
    try {
      const cred = await elegirOtraCuentaGoogle()
      if (cred.user.uid === anterior) { sessionStorage.removeItem('ds_sede_puesto'); return { cambio: false, mismo: true } }
      const nombre = cred.user.displayName || cred.user.email || 'otra persona'
      setAvisoCambio(nombre)
      setTimeout(() => setAvisoCambio(null), 6000)
      return { cambio: true, nombre }
    } catch (err) {
      sessionStorage.removeItem('ds_sede_puesto')
      if (['auth/popup-closed-by-user', 'auth/cancelled-popup-request'].includes(err?.code)) return { cambio: false }
      throw err
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
      sede, selectSede, loading, login, loginGuest, logout, cambiarDeEmpleado, avisoCambio,
    }}>
      {children}
    </AuthContext.Provider>
  )
}

export const useAuth = () => useContext(AuthContext)
