// Correos del equipo DeliStars. FUENTE DE VERDAD: delistars-menu-magic/admin/src/lib/team.ts
// Sincronizar este archivo cuando entren o salgan personas del equipo.
export const STAFF_EMAILS = [
  'thebesta4321@gmail.com',              // Andrés Elías Arango (admin)
  'cdavid.jaramillo@gmail.com',          // Carlos David Jaramillo (admin)
  'lluis02martinez@gmail.com',           // José Luis Martínez
  'josemanuellondonorivillas@gmail.com', // Jose Manuel Londoño
  'vvillegasmazo@gmail.com',             // Valentina Villegas
  'yencytp@gmail.com',                   // Yency Torres
  'monsalvesara1124@gmail.com',          // Sara Castaño
  'jotade.rodmar@gmail.com',             // Juan Diego Rodríguez
  'tikdash17@gmail.com',                 // Gendelson González
  'deisyhenao670@gmail.com',             // Deisy Henao
]

export const isStaff = (email?: string | null): boolean =>
  !!email && STAFF_EMAILS.includes(email.toLowerCase())

// ─── Roles operativos (espejo exacto de src/services/roles.js) ────────────
// Estos son los roles que dan acceso a un panel (admin/cajero/domiciliario)
// en /admin/ o /domicilios/. No todo STAFF_EMAILS tiene uno de estos roles
// (puede haber empleados que solo usan "Mis turnos").
export const ROLES = { ADMIN: 'admin', CASHIER: 'cashier', DRIVER: 'driver', CLIENT: 'client' } as const
export type RoleName = typeof ROLES[keyof typeof ROLES]

export const ADMIN_EMAILS = [
  'thebesta4321@gmail.com',
  'cdavid.jaramillo@gmail.com',
]

export const CASHIER_EMAILS = [
  'lluis02martinez@gmail.com',
  'josemanuellondonorivillas@gmail.com',
  'vvillegasmazo@gmail.com',
  'yencytp@gmail.com',
  'cdavid.jaramillo@gmail.com',
  'thebesta4321@gmail.com',
]

export const DRIVER_EMAILS = [
  'cdavid.jaramillo@gmail.com',
  'josemanuellondonorivillas@gmail.com',
]

export const isCashier = (email?: string | null): boolean =>
  !!email && CASHIER_EMAILS.includes(email.toLowerCase())

/** Todos los roles operativos que tiene un usuario, incluyendo cajeros/domiciliarios
 *  agregados dinámicamente desde el admin (Firestore roles_cashiers/roles_drivers). */
export function getAllRoles(
  email?: string | null,
  dynamicCashiers: string[] = [],
  dynamicDrivers: string[] = [],
): RoleName[] {
  if (!email) return [ROLES.CLIENT]
  const e = email.toLowerCase()
  const roles: RoleName[] = []

  if (ADMIN_EMAILS.map(a => a.toLowerCase()).includes(e)) roles.push(ROLES.ADMIN)

  const allCashiers = [...CASHIER_EMAILS, ...dynamicCashiers.map(x => x.toLowerCase())]
  if (allCashiers.includes(e)) roles.push(ROLES.CASHIER)

  const allDrivers = [...DRIVER_EMAILS, ...dynamicDrivers.map(x => x.toLowerCase())]
  if (allDrivers.includes(e)) roles.push(ROLES.DRIVER)

  roles.push(ROLES.CLIENT)
  return roles
}
