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

    // Cada colección se lee por separado y tolera fallas: si una lectura no
    // se puede (p. ej. reglas de Firestore sin publicar para roles_disabled),
    // esa lista queda vacía pero NUNCA se pierden los roles del código ni los
    // que sí se pudieron leer. Antes un Promise.all que fallaba dejaba solo
    // admin+client (2 roles) — regresión que rompió el selector de roles.
    const safeIds = async (col: string): Promise<string[]> => {
      try { return (await getDocs(collection(db, col))).docs.map(d => d.id.toLowerCase()) }
      catch { return [] }
    }

    ;(async () => {
      const [dynamicCashiers, dynamicDrivers, disabled] = await Promise.all([
        safeIds('roles_cashiers'),
        safeIds('roles_drivers'),
        safeIds('roles_disabled'),
      ])
      if (cancelled) return
      const roles: RoleName[] = []
      if (ADMIN_EMAILS.map(a => a.toLowerCase()).includes(email)) roles.push(ROLES.ADMIN)
      const allCashiers = [...Object.keys(DEFAULT_CASHIERS).map(x => x.toLowerCase()), ...dynamicCashiers]
      if (allCashiers.includes(email) && !disabled.includes(email)) roles.push(ROLES.CASHIER)
      const allDrivers = [...Object.keys(DEFAULT_DRIVERS).map(x => x.toLowerCase()), ...dynamicDrivers]
      if (allDrivers.includes(email) && !disabled.includes(email)) roles.push(ROLES.DRIVER)
      roles.push(ROLES.CLIENT)
      setAllRoles(roles)
    })()

    return () => { cancelled = true }
  }, [user?.email])

  return allRoles
}
