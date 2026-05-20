// ─── Roles fijos hardcoded ───────────────────────────────────────────────────
export const ADMIN_EMAILS = [
  'thebesta4321@gmail.com',   // Andrés Elías Arango Monsalve
  'cdavid.jaramillo@gmail.com', // Carlos David Jaramillo Gallego (dev)
]

// Mantener compatibilidad con código que use ADMIN_EMAIL singular
export const ADMIN_EMAIL = ADMIN_EMAILS[0]

export const DEFAULT_CASHIERS = [
  'lluis02martinez@gmail.com',
  'josemanuellondonorivillas@gmail.com',
  'vvillegasmazo@gmail.com',
  'yencytp@gmail.com',
  'cdavid.jaramillo@gmail.com',
  'thebesta4321@gmail.com',
]

export const DEFAULT_CASHIER_NAMES = {
  'lluis02martinez@gmail.com':          'Jose Luis Martinez Villegas',
  'josemanuellondonorivillas@gmail.com': 'Jose Manuel Londoño Rivillas',
  'vvillegasmazo@gmail.com':            'Valentina Villegas Mazo',
  'yencytp@gmail.com':                  'Yency Torres Parra',
  'cdavid.jaramillo@gmail.com':         'Carlos David Jaramillo',
  'thebesta4321@gmail.com':             'Andrés Elías Arango Monsalve',
}

export const DEFAULT_DRIVERS = [
  'cdavid.jaramillo@gmail.com',
]

export const DEFAULT_DRIVER_NAMES = {
  'cdavid.jaramillo@gmail.com': 'Carlos David Jaramillo',
}

export const ROLES = {
  ADMIN:    'admin',
  CASHIER:  'cashier',
  DRIVER:   'driver',
  CLIENT:   'client',
}

// ─── Sedes ───────────────────────────────────────────────────────────────────
export const SEDES = {
  santa_lucia: {
    id:        'santa_lucia',
    name:      'Santa Lucía',
    address:   'Cra. 87 #48e-3, Santa Rosa De Lima, Medellín',
    coords:    { lat: 6.2397, lng: -75.6111 },
    whatsapp:  '573135065720',
  },
  santa_teresita: {
    id:        'santa_teresita',
    name:      'Santa Teresita',
    address:   'Cl 35B #87A-165, La América, Medellín',
    coords:    { lat: 6.2477, lng: -75.6020 },
    whatsapp:  '573150634084',
  },
}

// ─── Determinar rol base desde Firestore ─────────────────────────────────────
// getUserRole is called after loading dynamic lists from Firestore
export function resolveRole(email, dynamicCashiers = [], dynamicDrivers = []) {
  if (!email) return ROLES.CLIENT
  const e = email.toLowerCase()
  if (ADMIN_EMAILS.map(a => a.toLowerCase()).includes(e)) return ROLES.ADMIN

  const allCashiers = [...DEFAULT_CASHIERS, ...dynamicCashiers.map(x => x.toLowerCase())]
  if (allCashiers.includes(e)) return ROLES.CASHIER

  const allDrivers = [...DEFAULT_DRIVERS, ...dynamicDrivers.map(x => x.toLowerCase())]
  if (allDrivers.includes(e)) return ROLES.DRIVER

  return ROLES.CLIENT
}

/** Retorna TODOS los roles que puede usar un usuario */
export function getAllRoles(email, dynamicCashiers = [], dynamicDrivers = []) {
  if (!email) return [ROLES.CLIENT]
  const e = email.toLowerCase()
  const roles = []

  if (ADMIN_EMAILS.map(a => a.toLowerCase()).includes(e)) roles.push(ROLES.ADMIN)

  const allCashiers = [...DEFAULT_CASHIERS, ...dynamicCashiers.map(x => x.toLowerCase())]
  if (allCashiers.includes(e)) roles.push(ROLES.CASHIER)

  const allDrivers = [...DEFAULT_DRIVERS, ...dynamicDrivers.map(x => x.toLowerCase())]
  if (allDrivers.includes(e)) roles.push(ROLES.DRIVER)

  roles.push(ROLES.CLIENT)
  return roles
}
