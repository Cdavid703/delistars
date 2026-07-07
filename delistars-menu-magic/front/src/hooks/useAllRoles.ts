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
    // Cada lectura tolera fallas por separado: si roles_disabled no se puede
    // leer (reglas sin publicar), no se pierden los demás roles.
    const safeIds = async (col: string): Promise<string[]> => {
      try { return (await getDocs(collection(db, col))).docs.map(d => d.id) }
      catch { return [] }
    }
    Promise.all([
      safeIds('roles_cashiers'),
      safeIds('roles_drivers'),
      safeIds('roles_disabled'),
    ])
      .then(([dynamicCashiers, dynamicDrivers, disabled]) => {
        if (cancelled) return
        setAllRoles(getAllRoles(user.email, dynamicCashiers, dynamicDrivers, disabled))
      })
      .catch(() => { if (!cancelled) setAllRoles(getAllRoles(user.email)) })
    return () => { cancelled = true }
  }, [user?.email])

  return allRoles
}
