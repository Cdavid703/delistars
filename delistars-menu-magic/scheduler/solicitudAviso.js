// Aviso al celular de administración cuando alguien pide acceso al equipo
// (caja o domiciliario) desde la app. Módulo puro para probarlo con node --test.
const ROL = { caja: 'caja', domiciliario: 'domiciliario' }
const SEDE = { santa_lucia: 'Santa Lucía', santa_teresita: 'Santa Teresita' }

/** Mensaje para una solicitud pendiente (lo que verá el admin en el celular). */
function mensajeSolicitud(s) {
  return {
    tipo: 'solicitud de acceso',
    title: '🙋 Nueva solicitud de acceso',
    body: `${s.nombre || 'Alguien'} pide acceso de ${ROL[s.rol] || s.rol} en ${SEDE[s.sedeId] || s.sedeId}. ` +
      'Ábrela en Usuarios para aprobarla o rechazarla.',
    url: 'https://delistars.com/admin/usuarios',
  }
}

/**
 * Clave de una solicitud: si la persona cambia de rol o de sede es una solicitud
 * nueva (se vuelve a avisar); si solo se reescribe la misma, no.
 */
const claveSolicitud = (id, s) => `${id}:${s.rol}:${s.sedeId}:${s.creadaAt?.toMillis?.() ?? ''}`

module.exports = { mensajeSolicitud, claveSolicitud }
