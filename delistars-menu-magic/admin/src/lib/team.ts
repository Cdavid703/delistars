// Fuente única del equipo DeliStars para el panel admin.
// front/src/lib/staff.ts y src/services/roles.js (domicilios) deben mantenerse
// sincronizados con este archivo cuando entren o salgan personas del equipo.

export const ADMIN_EMAILS = [
  'thebesta4321@gmail.com',     // Andrés Elías Arango Monsalve
  'cdavid.jaramillo@gmail.com', // Carlos David Jaramillo (dev)
]

export const isAdminEmail = (email?: string | null): boolean =>
  !!email && ADMIN_EMAILS.includes(email.toLowerCase())

// Admins de confianza total — pueden modificar fidelización (corregir progreso,
// otorgar/anular premios). Subconjunto de ADMIN_EMAILS: puede haber admins que
// vean fidelización pero no la modifiquen (hoy coincide con ADMIN_EMAILS).
// Espejo de isSuperAdmin() en firestore.rules — mantener sincronizado.
export const SUPER_ADMIN_EMAILS = [
  'thebesta4321@gmail.com',
  'cdavid.jaramillo@gmail.com',
]

export const isSuperAdminEmail = (email?: string | null): boolean =>
  !!email && SUPER_ADMIN_EMAILS.includes(email.toLowerCase())

// Empleados del equipo — usados en la grilla de Turnos.
// Plantilla base del cuadro de turnos. Lleva EMAIL para poder cruzarla con las
// bajas del panel (roles_disabled) y con los empleados creados desde el admin:
// quien se da de baja desaparece del cuadro sin tocar código.
// `doc` es la cédula (o PPT) del empleado: identifica a la persona aunque
// todavía no tenga correo. `email` puede ir vacío mientras no lo tengamos —
// sin correo la persona sale en el cuadro de turnos, pero no puede iniciar
// sesión ni tener rol de cajero/domiciliario. Cuando llegue el correo hay que
// escribirlo AQUÍ (y en los dos espejos), no agregarlo desde el panel: si no,
// quedaría duplicado en el cuadro.
export interface ShiftEmployee {
  id: string
  email: string
  doc?: string
  name: string
  short: string
  type: 'regular' | 'servicios'
}

export const EMPLOYEES: ShiftEmployee[] = [
  { id: 'joseluis',  email: 'lluis02martinez@gmail.com',  doc: '1003231096',    name: 'José Luis Martínez Villegas', short: 'José Luis', type: 'regular' },
  { id: 'sara',      email: 'monsalvesara1124@gmail.com', doc: '1015072348',    name: 'Sara Castaño Monsalve',       short: 'Sara',      type: 'regular' },
  { id: 'valentina', email: 'vvillegasmazo@gmail.com',    doc: '1041631088',    name: 'Valentina Villegas Mazo',     short: 'Valentina', type: 'regular' },
  { id: 'gendelson', email: 'tikdash17@gmail.com',        doc: 'PPT6005363877', name: 'Gendelson González Blanco',   short: 'Gendelson', type: 'regular' },
  { id: 'shirly',    email: '',                           doc: '1003316676',    name: 'Shirly Elena Rico Daza',      short: 'Shirly',    type: 'regular' },
  { id: 'melissa',   email: '',                           doc: '1042151261',    name: 'Melissa Varelas Mazo',        short: 'Melissa',   type: 'regular' },
  { id: 'deisy',     email: 'deisyhenao670@gmail.com',    doc: '1035916337',    name: 'Deisy Henao Grisales',        short: 'Deisy',     type: 'servicios' },
]

// Id estable para un empleado creado desde el admin (a partir de su correo).
export const shiftIdFromEmail = (email: string) =>
  email.toLowerCase().split('@')[0].replace(/[^a-z0-9]/g, '') || email.toLowerCase()

/**
 * Lista final del cuadro de turnos: la plantilla base más los empleados que el
 * admin haya marcado para turnos, quitando los que estén dados de baja.
 * `extra` son los empleados de Firestore que tengan shiftType configurado.
 */
export function buildShiftEmployees(
  extra: { email: string; doc?: string; name?: string; shortName?: string; shiftType?: string }[],
  disabledEmails: string[],
): ShiftEmployee[] {
  const baja = new Set(disabledEmails.map((e) => e.toLowerCase()))
  // Documentos que ya vienen del panel: si a alguien de la plantilla sin correo
  // le crean su usuario desde el admin con la misma cédula, manda el del panel
  // (si no, saldría dos veces en el cuadro).
  const docsDelPanel = new Set(extra.map((e) => (e.doc || '').trim()).filter(Boolean))
  const out = EMPLOYEES.filter((e) => {
    if (e.email) return !baja.has(e.email.toLowerCase())
    return !(e.doc && docsDelPanel.has(e.doc))
  })
  const yaEsta = new Set(out.map((e) => e.email.toLowerCase()))

  extra.forEach((e) => {
    const email = (e.email || '').toLowerCase()
    if (!email || baja.has(email) || yaEsta.has(email)) return
    if (e.shiftType !== 'regular' && e.shiftType !== 'servicios') return
    out.push({
      id: shiftIdFromEmail(email),
      email,
      name: e.name || email,
      short: e.shortName || (e.name || email).split(' ')[0],
      type: e.shiftType,
    })
    yaEsta.add(email)
  })
  return out
}

// Roles por defecto en Firestore para la app de domicilios.
// Mirror de src/services/roles.js en el repo raíz.
export const DEFAULT_CASHIERS: Record<string, string> = {
  'lluis02martinez@gmail.com':           'Jose Luis Martinez Villegas',
  'vvillegasmazo@gmail.com':             'Valentina Villegas Mazo',
  'cdavid.jaramillo@gmail.com':          'Carlos David Jaramillo',
  'thebesta4321@gmail.com':              'Andrés Elías Arango Monsalve',
}

export const DEFAULT_DRIVERS: Record<string, string> = {
  'cdavid.jaramillo@gmail.com':          'Carlos David Jaramillo',
}
