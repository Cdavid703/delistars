import { useEffect, useState } from 'react'
import type { User } from 'firebase/auth'
import { collection, getDocs } from 'firebase/firestore'
import { db } from '@/services/firebase'
import { ADMIN_EMAILS, DEFAULT_CASHIERS, DEFAULT_DRIVERS } from '@/lib/team'

export const ROLES = { ADMIN: 'admin', CASHIER: 'cashier', DRIVER: 'driver', CLIENT: 'client' } as const
export type RoleName = typeof ROLES[keyof typeof ROLES]

// Calcula los roles operativos reales del admin (admin/cajero/domiciliario/cliente),
// igual que AuthContext en la app de domicilios, incluyendo cajeros/domiciliarios
// agregados dinámicamente desde Usuarios (Firestore roles_cashiers/roles_drivers).
export function useAllRoles(user: User | null) {
  const [allRoles, setAllRoles] = useState<RoleName[]>([ROLES.ADMIN, ROLES.CLIENT])

  useEffect(() => {
    const email = user?.email?.toLowerCase()
    if (!email) { setAllRoles([ROLES.CLIENT]); return }
    let cancelled = false
    Promise.all([
      getDocs(collection(db, 'roles_cashiers')),
      getDocs(collection(db, 'roles_drivers')),
      getDocs(collection(db, 'roles_disabled')),
    ])
      .then(([cashierSnap, driverSnap, disabledSnap]) => {
        if (cancelled) return
        const dynamicCashiers = cashierSnap.docs.map(d => d.id.toLowerCase())
        const dynamicDrivers = driverSnap.docs.map(d => d.id.toLowerCase())
        const disabled = disabledSnap.docs.map(d => d.id.toLowerCase())
        const roles: RoleName[] = []
        if (ADMIN_EMAILS.map(a => a.toLowerCase()).includes(email)) roles.push(ROLES.ADMIN)
        const allCashiers = [...Object.keys(DEFAULT_CASHIERS).map(x => x.toLowerCase()), ...dynamicCashiers]
        if (allCashiers.includes(email) && !disabled.includes(email)) roles.push(ROLES.CASHIER)
        const allDrivers = [...Object.keys(DEFAULT_DRIVERS).map(x => x.toLowerCase()), ...dynamicDrivers]
        if (allDrivers.includes(email) && !disabled.includes(email)) roles.push(ROLES.DRIVER)
        roles.push(ROLES.CLIENT)
        setAllRoles(roles)
      })
      .catch(() => { if (!cancelled) setAllRoles([ROLES.ADMIN, ROLES.CLIENT]) })
    return () => { cancelled = true }
  }, [user?.email])

  return allRoles
}
