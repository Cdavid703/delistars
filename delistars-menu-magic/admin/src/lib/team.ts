// Fuente única del equipo DeliStars para el panel admin.
// front/src/lib/staff.ts y src/services/roles.js (domicilios) deben mantenerse
// sincronizados con este archivo cuando entren o salgan personas del equipo.

export const ADMIN_EMAILS = [
  'thebesta4321@gmail.com',     // Andrés Elías Arango Monsalve
  'cdavid.jaramillo@gmail.com', // Carlos David Jaramillo (dev)
]

export const isAdminEmail = (email?: string | null): boolean =>
  !!email && ADMIN_EMAILS.includes(email.toLowerCase())

// Empleados del equipo — usados en la grilla de Turnos.
export const EMPLOYEES = [
  { id: 'joseluis',   name: 'José Luis Martínez Villegas',   short: 'José Luis',   type: 'regular' },
  { id: 'yency',      name: 'Yency Torres Parra',            short: 'Yency',       type: 'regular' },
  { id: 'sara',       name: 'Sara Castaño Monsalve',         short: 'Sara',        type: 'regular' },
  { id: 'valentina',  name: 'Valentina Villegas Mazo',       short: 'Valentina',   type: 'regular' },
  { id: 'josemanuel', name: 'Jose Manuel Londoño Rivillas',  short: 'Jose Manuel', type: 'regular' },
  { id: 'juandiego',  name: 'Juan Diego Rodríguez Martínez', short: 'Juan Diego',  type: 'regular' },
  { id: 'gendelson',  name: 'Gendelson González Blanco',     short: 'Gendelson',   type: 'regular' },
  { id: 'deisy',      name: 'Deisy Henao Grisales',          short: 'Deisy',       type: 'servicios' },
] as const

// Roles por defecto en Firestore para la app de domicilios.
// Mirror de src/services/roles.js en el repo raíz.
export const DEFAULT_CASHIERS: Record<string, string> = {
  'lluis02martinez@gmail.com':           'Jose Luis Martinez Villegas',
  'josemanuellondonorivillas@gmail.com': 'Jose Manuel Londoño Rivillas',
  'vvillegasmazo@gmail.com':             'Valentina Villegas Mazo',
  'yencytp@gmail.com':                   'Yency Torres Parra',
  'cdavid.jaramillo@gmail.com':          'Carlos David Jaramillo',
  'thebesta4321@gmail.com':              'Andrés Elías Arango Monsalve',
}

export const DEFAULT_DRIVERS: Record<string, string> = {
  'cdavid.jaramillo@gmail.com':          'Carlos David Jaramillo',
  'josemanuellondonorivillas@gmail.com': 'José Manuel Londoño',
}
