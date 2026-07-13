// ─── Roles fijos hardcoded ───────────────────────────────────────────────────
// FUENTE DE VERDAD de ADMIN_EMAILS: delistars-menu-magic/admin/src/lib/team.ts
// (esta copia es para la app de domicilios). Mantener sincronizadas las 3 apps;
// verificar con `npm run check:emails`.
export const ADMIN_EMAILS = [
  'thebesta4321@gmail.com',   // Andrés Elías Arango Monsalve
  'cdavid.jaramillo@gmail.com', // Carlos David Jaramillo Gallego (dev)
  'josemigeul44@gmail.com',
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
  'josemanuellondonorivillas@gmail.com',
]

export const DEFAULT_DRIVER_NAMES = {
  'cdavid.jaramillo@gmail.com':          'Carlos David Jaramillo',
  'josemanuellondonorivillas@gmail.com': 'José Manuel Londoño',
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
    // Cadena completa estilo Google Maps — usada como ORIGEN al calcular ruta
    mapsAddress: 'DELISTAR | Santa Lucía | Perros y hamburguesas | Medellín, Cra. 87 #48e-3, Santa Rosa De Lima, Medellín, San Javier, Medellín, Antioquia',
    coords:    { lat: 6.2397, lng: -75.6111 },
    whatsapp:  '573135065720',
    // Barrios habituales de cobertura. NO es un filtro: el cliente puede
    // escribir cualquier barrio; esto solo lo autocompleta y le avisa que el
    // domicilio se confirma en caja. Editar libremente según la operación.
    barrios: [
      // Comuna 13 (San Javier) — donde está la sede
      'Santa Rosa de Lima', 'Santa Lucía', 'San Javier No. 1', 'San Javier No. 2',
      'La Pradera', 'Antonio Nariño', 'El Salado', 'Veinte de Julio', 'Metropolitano',
      'El Socorro', 'La Divisa', 'Eduardo Santos', 'Blanquizal', 'El Pesebre',
      'Los Alcázares', 'Belencito', 'Betania', 'Juan XXIII', 'Nuevos Conquistadores',
      'Las Independencias', 'El Corazón', 'La Gabriela',
      // Comuna 12 (La América) colindante
      'Barrio Cristóbal', 'El Danubio', 'La Floresta', 'Calasanz', 'Ferrini',
      'Los Pinos', 'Simón Bolívar', 'La América', 'Santa Mónica',
    ],
  },
  santa_teresita: {
    id:        'santa_teresita',
    name:      'Santa Teresita',
    address:   'Cl 35B #87A-165, La América, Medellín',
    mapsAddress: 'Cl 35B #87A-165, La América, Medellín, Antioquia',
    coords:    { lat: 6.2477, lng: -75.6020 },
    whatsapp:  '573150634084',
    barrios: [
      // Comuna 12 (La América) — donde está la sede
      'Santa Teresita', 'La América', 'La Floresta', 'Calasanz', 'Calasanz Parte Alta',
      'Ferrini', 'Los Pinos', 'El Danubio', 'Santa Mónica', 'Barrio Cristóbal',
      'Simón Bolívar', 'La Castellana', 'Campo Alegre', 'Nueva Villa de la Iguaná',
      'Santa Lucía',
      // Comuna 11 (Laureles-Estadio) colindante
      'Laureles', 'Bolivariana', 'Las Acacias', 'San Joaquín', 'Los Conquistadores',
      'Florida Nueva', 'El Velódromo', 'Estadio', 'Naranjal', 'Suramericana',
      'Carlos E. Restrepo', 'Los Colores', 'El Nogal',
      // Comuna 16 (Belén) colindante al sur
      'Rosales', 'Belén', 'La Palma',
    ],
  },
}

// ─── Determinar rol base desde Firestore ─────────────────────────────────────
// disabledEmails: empleados dados de baja desde el admin (colección
// roles_disabled). Anulan tanto los defaults hardcodeados como los dinámicos,
// para poder retirar del sistema a alguien que ya no trabaja aquí.
export function resolveRole(email, dynamicCashiers = [], dynamicDrivers = [], disabledEmails = []) {
  if (!email) return ROLES.CLIENT
  const e = email.toLowerCase()
  if (ADMIN_EMAILS.map(a => a.toLowerCase()).includes(e)) return ROLES.ADMIN

  const disabled = disabledEmails.map(x => x.toLowerCase())
  if (disabled.includes(e)) return ROLES.CLIENT

  const allCashiers = [...DEFAULT_CASHIERS, ...dynamicCashiers.map(x => x.toLowerCase())]
  if (allCashiers.includes(e)) return ROLES.CASHIER

  const allDrivers = [...DEFAULT_DRIVERS, ...dynamicDrivers.map(x => x.toLowerCase())]
  if (allDrivers.includes(e)) return ROLES.DRIVER

  return ROLES.CLIENT
}

/** Retorna TODOS los roles que puede usar un usuario */
export function getAllRoles(email, dynamicCashiers = [], dynamicDrivers = [], disabledEmails = []) {
  if (!email) return [ROLES.CLIENT]
  const e = email.toLowerCase()
  const roles = []

  if (ADMIN_EMAILS.map(a => a.toLowerCase()).includes(e)) roles.push(ROLES.ADMIN)

  const disabled = disabledEmails.map(x => x.toLowerCase())
  const allCashiers = [...DEFAULT_CASHIERS, ...dynamicCashiers.map(x => x.toLowerCase())]
  if (allCashiers.includes(e) && !disabled.includes(e)) roles.push(ROLES.CASHIER)

  const allDrivers = [...DEFAULT_DRIVERS, ...dynamicDrivers.map(x => x.toLowerCase())]
  if (allDrivers.includes(e) && !disabled.includes(e)) roles.push(ROLES.DRIVER)

  roles.push(ROLES.CLIENT)
  return roles
}
