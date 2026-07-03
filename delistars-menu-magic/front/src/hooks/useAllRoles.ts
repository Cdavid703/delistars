import { useEffect, useState } from 'react'
import type { User } from 'firebase/auth'
import { collection, getDocs } from 'firebase/firestore'
import { db } from '@/services/firebase'
import { getAllRoles, ROLES, type RoleName } from '@/lib/staff'

// Calcula los roles operativos reales del usuario (admin/cajero/domiciliario/cliente),
// igual que lo hace AuthContext en la app de domicilios, incluyendo cajeros/domiciliarios
// agregados dinámicamente desde el admin (Firestore roles_cashiers/roles_drivers).
export function useAllRoles(user: User | null) {
  const [allRoles, setAllRoles] = useState<RoleName[]>([ROLES.CLIENT])

  useEffect(() => {
    if (!user?.email) { setAllRoles([ROLES.CLIENT]); return }
    let cancelled = false
    Promise.all([
      getDocs(collection(db, 'roles_cashiers')),
      getDocs(collection(db, 'roles_drivers')),
      getDocs(collection(db, 'roles_disabled')),
    ])
      .then(([cashierSnap, driverSnap, disabledSnap]) => {
        if (cancelled) return
        const dynamicCashiers = cashierSnap.docs.map(d => d.id)
        const dynamicDrivers = driverSnap.docs.map(d => d.id)
        const disabled = disabledSnap.docs.map(d => d.id)
        setAllRoles(getAllRoles(user.email, dynamicCashiers, dynamicDrivers, disabled))
      })
      .catch(() => { if (!cancelled) setAllRoles(getAllRoles(user.email)) })
    return () => { cancelled = true }
  }, [user?.email])

  return allRoles
}
