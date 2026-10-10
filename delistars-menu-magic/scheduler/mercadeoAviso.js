// Aviso diario a administración: qué tiene Mercadeo programado para hoy.
// Las actividades viven en mercadeo/calendario/actividades (calendario del
// panel); las fechas son texto 'yyyy-mm-dd' en hora de Colombia.

// ESPEJO de ADMIN_EMAILS en admin/src/lib/team.ts.
const ADMIN_EMAILS = ['thebesta4321@gmail.com', 'cdavid.jaramillo@gmail.com']

const TIPOS = {
  correo: 'Correo', redes: 'Redes', promocion: 'Promoción', evento: 'Evento',
  volanteo: 'Volanteo', alianza: 'Alianza', otro: 'Otro',
}
const SEDES = { ambas: 'ambas sedes', santa_lucia: 'Santa Lucía', santa_teresita: 'Santa Teresita' }

/** Hoy en Colombia (UTC-5) como 'yyyy-mm-dd'. */
const hoyColombia = (ahoraMs = Date.now()) => new Date(ahoraMs - 5 * 3600 * 1000).toISOString().slice(0, 10)

/** Actividades vigentes ese día que no están canceladas ni ya hechas. */
function actividadesDelDia(acts, dia) {
  return acts
    .filter((a) => a.inicio <= dia && dia <= (a.fin || a.inicio))
    .filter((a) => a.estado !== 'cancelada' && a.estado !== 'hecha')
    .sort((a, b) => String(a.titulo).localeCompare(String(b.titulo)))
}

/** Notificación para administración, o null si no hay nada hoy. */
function mensajeDelDia(acts, dia) {
  const hoy = actividadesDelDia(acts, dia)
  if (!hoy.length) return null
  const linea = (a) => {
    const partes = [TIPOS[a.tipo] || 'Otro', SEDES[a.sede] || a.sede]
    if (a.responsable) partes.push(a.responsable)
    const rango = a.fin && a.fin !== a.inicio ? ` (hasta el ${a.fin.slice(8)}/${a.fin.slice(5, 7)})` : ''
    return `• ${a.titulo}${rango} — ${partes.join(' · ')}`
  }
  return {
    tipo: 'mercadeo',
    url: 'https://delistars.com/admin/',
    title: `📣 Mercadeo hoy: ${hoy.length} actividad${hoy.length > 1 ? 'es' : ''}`,
    body: hoy.slice(0, 5).map(linea).join('\n') + (hoy.length > 5 ? `\n…y ${hoy.length - 5} más` : ''),
  }
}

module.exports = { ADMIN_EMAILS, hoyColombia, actividadesDelDia, mensajeDelDia }
