// Horarios de atención por sede (especificación §16.2, decisión C7 del 18 oct
// 2026). Solo administración los cambia; se guardan en config/horarios:
//
//   { santa_lucia: Horario, santa_teresita: Horario, actualizadoPor, actualizadoAt }
//   Horario = {
//     semana:      { lun: [{ desde: '17:30', hasta: '23:30' }], mar: [...], ..., dom: [...] },
//     excepciones: { 'yyyy-mm-dd': [] | [{ desde, hasta }] },   // [] = cerrada ese día
//     manual:      null | { modo: 'abierta' | 'cerrada', hasta: ISO | null, por }
//   }
//
// Un turno con `hasta` menor o igual que `desde` cruza la medianoche (se cuenta
// en el día en que empieza). Todo se calcula en hora de Colombia (UTC-5, sin
// horario de verano), sin importar la zona horaria del dispositivo.
//
// ESTE ARCHIVO SE COPIA IGUAL en front/src/lib, admin/src/lib y scheduler
// (horarios.mjs). Una prueba (tests/horarios.test.mjs) avisa si difieren.

export const DIAS = ['dom', 'lun', 'mar', 'mie', 'jue', 'vie', 'sab']
export const NOMBRE_DIA = { lun: 'Lunes', mar: 'Martes', mie: 'Miércoles', jue: 'Jueves', vie: 'Viernes', sab: 'Sábado', dom: 'Domingo' }
export const SEDES_HORARIO = ['santa_lucia', 'santa_teresita']

/** El horario de siempre (antes fijo en el scheduler): todos los días 5:30 p. m. a 11:30 p. m. */
export const HORARIO_POR_DEFECTO = {
  semana: Object.fromEntries(DIAS.map((d) => [d, [{ desde: '17:30', hasta: '23:30' }]])),
  excepciones: {},
  manual: null,
}

const OFFSET_MS = -5 * 60 * 60 * 1000
const DIA_MS = 24 * 60 * 60 * 1000

/** Fecha, día y minuto del día en Colombia para un instante. */
export function enColombia(ms) {
  const d = new Date(ms + OFFSET_MS)
  return { fecha: d.toISOString().slice(0, 10), dia: DIAS[d.getUTCDay()], minuto: d.getUTCHours() * 60 + d.getUTCMinutes() }
}

const aMinutos = (hhmm) => {
  const [h, m] = String(hhmm || '').split(':').map(Number)
  return Number.isFinite(h) && Number.isFinite(m) ? h * 60 + m : null
}

/** Instante (ms) de una hora 'HH:MM' en una fecha de Colombia. */
const instante = (fecha, hhmm) => Date.parse(`${fecha}T${hhmm}:00-05:00`)

const turnosDe = (h, fecha, dia) => {
  const exc = h?.excepciones?.[fecha]
  const lista = Array.isArray(exc) ? exc : (h?.semana?.[dia] ?? [])
  return lista.filter((t) => aMinutos(t?.desde) !== null && aMinutos(t?.hasta) !== null)
}

/** Turnos de una fecha como intervalos [inicio, fin) en ms (los que cruzan medianoche terminan al otro día). */
function intervalos(h, fecha) {
  const dia = DIAS[new Date(`${fecha}T12:00:00-05:00`).getUTCDay()]
  return turnosDe(h, fecha, dia).map((t) => {
    const ini = instante(fecha, t.desde)
    let fin = instante(fecha, t.hasta)
    if (fin <= ini) fin += DIA_MS
    return [ini, fin]
  })
}

const fechaMas = (fecha, n) => new Date(Date.parse(`${fecha}T12:00:00-05:00`) + n * DIA_MS + OFFSET_MS).toISOString().slice(0, 10)

/**
 * Estado de una sede en un instante:
 *   { abierta, motivo: 'manual' | 'horario' | 'excepcion', hasta: ms | null, proxima: ms | null }
 * `hasta` = cuándo cambia el estado actual (null = hasta que se cambie a mano);
 * `proxima` = próxima apertura si está cerrada (null si no hay en 8 días).
 */
export function estadoSede(horario, ahora = Date.now()) {
  const h = horario && typeof horario === 'object' ? horario : HORARIO_POR_DEFECTO
  const m = h.manual
  if (m && (m.modo === 'abierta' || m.modo === 'cerrada')) {
    const hasta = m.hasta ? Date.parse(m.hasta) : null
    if (hasta === null || ahora < hasta) {
      return { abierta: m.modo === 'abierta', motivo: 'manual', hasta, proxima: m.modo === 'cerrada' ? hasta : null }
    }
  }
  const { fecha } = enColombia(ahora)
  const motivo = h.excepciones && Array.isArray(h.excepciones[fecha]) ? 'excepcion' : 'horario'
  // Turnos de ayer (por si cruzan la medianoche), hoy y los próximos 7 días.
  const todos = []
  for (let i = -1; i <= 7; i++) todos.push(...intervalos(h, fechaMas(fecha, i)))
  todos.sort((a, b) => a[0] - b[0])
  const actual = todos.find(([ini, fin]) => ini <= ahora && ahora < fin)
  if (actual) return { abierta: true, motivo, hasta: actual[1], proxima: null }
  const prox = todos.find(([ini]) => ini > ahora)
  return { abierta: false, motivo, hasta: prox ? prox[0] : null, proxima: prox ? prox[0] : null }
}

/** ¿Alguna sede abierta? (bandera vieja config/client_platform.active, para apps sin actualizar). */
export const algunaAbierta = (horarios, ahora = Date.now()) =>
  SEDES_HORARIO.some((s) => estadoSede(horarios?.[s], ahora).abierta)

const hora = (ms) => {
  const { minuto } = enColombia(ms)
  const h = Math.floor(minuto / 60), mm = String(minuto % 60).padStart(2, '0')
  return `${h % 12 || 12}:${mm} ${h < 12 ? 'a. m.' : 'p. m.'}`
}
const cuando = (ms, ahora) => {
  const a = enColombia(ahora).fecha, b = enColombia(ms).fecha
  if (a === b) return `hoy a las ${hora(ms)}`
  if (fechaMas(a, 1) === b) return `mañana a las ${hora(ms)}`
  return `el ${NOMBRE_DIA[enColombia(ms).dia].toLowerCase()} a las ${hora(ms)}`
}

/** Texto corto para clientes y caja: "Abierta hasta las 11:30 p. m.", "Cerrada · abre hoy a las 5:30 p. m.". */
export function textoEstado(e, ahora = Date.now()) {
  if (!e) return ''
  if (e.abierta) return e.hasta ? `Abierta hasta las ${hora(e.hasta)}` : 'Abierta'
  if (e.motivo === 'manual' && !e.proxima) return 'Cerrada por ahora'
  return e.proxima ? `Cerrada · abre ${cuando(e.proxima, ahora)}` : 'Cerrada'
}
