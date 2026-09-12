// ─── Roles fijos hardcoded ───────────────────────────────────────────────────
// FUENTE DE VERDAD de ADMIN_EMAILS: delistars-menu-magic/admin/src/lib/team.ts
// (esta copia es para la app de domicilios). Mantener sincronizadas las 3 apps;
// verificar con `npm run check:emails`.
export const ADMIN_EMAILS = [
  'thebesta4321@gmail.com',   // Andrés Elías Arango Monsalve
  'cdavid.jaramillo@gmail.com', // Carlos David Jaramillo Gallego (dev)
]

// Mantener compatibilidad con código que use ADMIN_EMAIL singular
export const ADMIN_EMAIL = ADMIN_EMAILS[0]

export const DEFAULT_CASHIERS = [
  'lluis02martinez@gmail.com',
  'vvillegasmazo@gmail.com',
  'cdavid.jaramillo@gmail.com',
  'thebesta4321@gmail.com',
]

export const DEFAULT_CASHIER_NAMES = {
  'lluis02martinez@gmail.com':          'Jose Luis Martinez Villegas',
  'vvillegasmazo@gmail.com':            'Valentina Villegas Mazo',
  'cdavid.jaramillo@gmail.com':         'Carlos David Jaramillo',
  'thebesta4321@gmail.com':             'Andrés Elías Arango Monsalve',
}

export const DEFAULT_DRIVERS = [
  'cdavid.jaramillo@gmail.com',
]

export const DEFAULT_DRIVER_NAMES = {
  'cdavid.jaramillo@gmail.com':          'Carlos David Jaramillo',
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
    // Texto para Google Maps. Sin el nombre comercial ni barras: la cadena
    // anterior ("DELISTAR | Santa Lucía | Perros y hamburguesas | Medellín, …",
    // con "Medellín" tres veces) confundía al buscador de Maps.
    mapsAddress: 'Cra. 87 #48e-3, Santa Rosa de Lima, San Javier, Medellín, Antioquia',
    // Pin verificado por Andrés el 2026-09-04. El valor anterior
    // (6.2397, -75.6111) estaba 2,4 km corrido: Waze mandaba al domiciliario a
    // otro sector y además desviaba el orden de la ruta y el cálculo de la caja.
    coords:    { lat: 6.260435, lng: -75.604912 },
    // Cobra el domicilio automáticamente por distancia (ver utils/tarifaDomicilio).
    // Solo se activa con el pin verificado: con una coordenada mala el cliente
    // recibiría un precio equivocado.
    tarifaAutomatica: true,
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
    // Pin verificado por Andrés el 2026-09-11. El valor anterior
    // (6.2477, -75.6020) estaba 1,28 km corrido. Este queda a 186 m de donde el
    // geocodificador ubica la Calle 35B con Carrera 87A, y a 1,97 km de Santa
    // Lucía, que es la separación real entre las dos sedes.
    coords:    { lat: 6.244691, lng: -75.613159 },
    tarifaAutomatica: true,
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
