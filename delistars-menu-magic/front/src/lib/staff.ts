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
