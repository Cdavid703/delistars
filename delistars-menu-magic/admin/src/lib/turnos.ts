// ─── Reglas del cuadro de turnos ─────────────────────────────────────────────
// ESPEJO de src/utils/turnos.js (repo raíz), que es la FUENTE DE VERDAD y tiene
// las pruebas (`npm test` → tests/turnos.test.mjs). Si cambias una regla aquí,
// cámbiala allá y corre las pruebas.
//
// Las reglas del negocio (2026-08-29):
//   · Santa Teresita: siempre 2 personas. El resto va a Santa Lucía.
//   · Descansos SOLO de lunes a jueves, uno por día. Viernes, sábado y domingo
//     trabaja todo el mundo — por eso el finde queda con 4 en Santa Lucía.
//   · Sara rota como los demás (su miércoles fijo está suspendido, ver abajo).
//   · Valentina nunca va a Santa Teresita (lleva la gestión del negocio).
//   · El finde: Valentina en Santa Lucía y José Luis en Santa Teresita.
//   · Santa Teresita necesita SIEMPRE a José Luis o a Gendelson.
//   · Cada sede necesita un cajero presente (Valentina, José Luis o Sara).
//     En Santa Lucía se prefiere a Sara en caja para dejar libre a Valentina.
//   · Deisy (servicios generales) no rota: turno de la mañana de lunes a
//     jueves, y el finde se deja en blanco (lo cubre otra persona).
//   · Andrés (refuerzo) entra 2 días de lunes a jueves a Santa Teresita para
//     abrir descansos: cada día que entra, ese día puede descansar alguien más.
//
// Rotación a mitad de semana (2026-10-07): si el admin rota el miércoles, se
// rehace de miércoles a domingo y lunes y martes quedan EXACTAMENTE como se
// publicaron (sede, descanso y caja). Quien ya descansó no vuelve a descansar,
// a Andrés se le descuentan los días que ya entró, y si no quedan cupos para
// todos los que faltan por descansar, se quedan sin descanso y se avisa.
//
// Sara: tenía descanso fijo el miércoles. Desde la semana del 5 de octubre de
// 2026 rota como los demás, sin fecha de regreso (2026-10-09: se definirá después).

export const DIAS = ['lun', 'mar', 'mie', 'jue', 'vie', 'sab', 'dom']
export const DIAS_CON_DESCANSO = ['lun', 'mar', 'mie', 'jue']
export const CUPO_TERESITA = 2

export const SANTA_LUCIA = 'santa_lucia'
export const SANTA_TERESITA = 'santa_teresita'
export const DESCANSO = 'descanso'

type Refuerzo = { id: string; sede: string; dias: number }

export const REGLAS = {
  descansoFijo: { sara: 'mie' } as Record<string, string>,
  // Semanas en que el descanso fijo NO aplica y la persona rota como los demás.
  // Se mira la fecha que cae el día fijo esa semana (para Sara, el miércoles).
  descansoFijoLibre: { sara: [{ desde: '2026-10-05', hasta: '9999-12-31' }] } as Record<string, { desde: string; hasta: string }[]>,
  nuncaEnTeresita: ['valentina'],
  findeFijo: { valentina: SANTA_LUCIA, joseluis: SANTA_TERESITA } as Record<string, string>,
  anclasTeresita: ['joseluis', 'gendelson'],
  cajeros: ['valentina', 'joseluis', 'sara'],
  refuerzos: [{ id: 'andres', sede: SANTA_TERESITA, dias: 2 }] as Refuerzo[],
  cajerosRefuerzo: ['andres'],
  prefCaja: {
    [SANTA_LUCIA]: ['sara', 'valentina', 'joseluis'],
    [SANTA_TERESITA]: ['joseluis', 'sara', 'valentina', 'andres'],
  } as Record<string, string[]>,
}

const TODOS_CAJA = [...REGLAS.cajeros, ...REGLAS.cajerosRefuerzo]

export type Schedule = Record<string, Record<string, string>>
export type Caja = Record<string, Record<string, string>>
type Empleado = { id: string; short?: string; type: 'regular' | 'servicios' | 'refuerzo' }
type Rnd = () => number

export const esFinde = (dia: string) => dia === 'vie' || dia === 'sab' || dia === 'dom'
export const esCajero = (empId: string) => TODOS_CAJA.includes(empId)

const NOMBRE_DIA: Record<string, string> = {
  lun: 'lunes', mar: 'martes', mie: 'miércoles', jue: 'jueves',
  vie: 'viernes', sab: 'sábado', dom: 'domingo',
}

const shuffle = (arr: string[], rnd: Rnd): string[] => {
  const out = [...arr]
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rnd() * (i + 1))
    ;[out[i], out[j]] = [out[j], out[i]]
  }
  return out
}

function combinaciones(arr: string[], k: number): string[][] {
  if (k <= 0) return [[]]
  if (k > arr.length) return []
  const out: string[][] = []
  const rec = (inicio: number, acc: string[]) => {
    if (acc.length === k) { out.push([...acc]); return }
    for (let i = inicio; i < arr.length; i++) { acc.push(arr[i]); rec(i + 1, acc); acc.pop() }
  }
  rec(0, [])
  return out
}

/** Suma días a una fecha 'yyyy-mm-dd' (sin líos de zona horaria). */
export function sumarDias(fechaISO: string, n: number): string {
  const [a, m, d] = fechaISO.split('-').map(Number)
  return new Date(Date.UTC(a, m - 1, d + n)).toISOString().slice(0, 10)
}

/** Clave del día de una fecha ('lun'…'dom'), en la hora local del navegador. */
export const diaDeHoy = (fecha = new Date()): string => DIAS[(fecha.getDay() + 6) % 7]

/** Descansos fijos que aplican la semana que empieza el lunes `semana`: id → día. */
export function descansosFijos(semana?: string): Record<string, string> {
  const out: Record<string, string> = {}
  Object.entries(REGLAS.descansoFijo).forEach(([id, dia]) => {
    if (semana) {
      const fecha = sumarDias(semana, DIAS.indexOf(dia))
      const libre = (REGLAS.descansoFijoLibre[id] ?? []).some((v) => fecha >= v.desde && fecha <= v.hasta)
      if (libre) return
    }
    out[id] = dia
  })
  return out
}

function planearRefuerzos(refuerzos: Refuerzo[], diasDescanso: string[], rnd: Rnd): Record<string, Refuerzo[]> {
  const porDia: Record<string, Refuerzo[]> = {}
  refuerzos.forEach((r) => {
    const dias = shuffle(diasDescanso, rnd).slice(0, Math.min(r.dias, diasDescanso.length))
    dias.forEach((d) => { (porDia[d] ??= []).push(r) })
  })
  return porDia
}

function repartirDescansos(
  pendientes: string[], cupo: Record<string, number>, diasDescanso: string[],
  fijos: Record<string, string>, rnd: Rnd,
): { rest: Record<string, string[]>; sinCupo: string[]; sinDiaFijo: string[] } {
  const rest: Record<string, string[]> = {}
  diasDescanso.forEach((d) => { rest[d] = [] })
  const sinCupo: string[] = []
  const sinDiaFijo: string[] = []
  const conDiaFijo = new Set<string>()

  Object.entries(fijos).forEach(([id, dia]) => {
    if (!pendientes.includes(id)) return
    conDiaFijo.add(id)
    if (diasDescanso.includes(dia) && rest[dia].length < cupo[dia]) rest[dia].push(id)
    else sinDiaFijo.push(id)
  })

  // Primero a quienes se les corrió el día fijo; después el resto, sorteado.

  const libres = [...shuffle(sinDiaFijo, rnd), ...shuffle(pendientes.filter((id) => !conDiaFijo.has(id)), rnd)]
  libres.forEach((id) => {
    const dias = diasDescanso.filter((d) => rest[d].length < cupo[d])
    if (!dias.length) { sinCupo.push(id); return }
    const dia = dias[Math.floor(rnd() * dias.length)]
    rest[dia].push(id)
  })
  return { rest, sinCupo, sinDiaFijo }
}

function sedeValida(teresita: string[], lucia: string[], trabajando: string[], dia: string): boolean {
  // Ancla: Teresita SIEMPRE necesita a José Luis o Gendelson (absoluto). Si un
  // reparto deja a los dos por fuera el mismo día, no hay sede válida y se
  // reintenta la semana (nunca descansan los dos a la vez).
  if (!teresita.some((id) => REGLAS.anclasTeresita.includes(id))) return false
  if (!teresita.some((id) => TODOS_CAJA.includes(id))) return false
  if (!lucia.some((id) => REGLAS.cajeros.includes(id))) return false
  if (esFinde(dia)) {
    const malFinde = Object.entries(REGLAS.findeFijo).some(([id, sede]) => {
      if (!trabajando.includes(id)) return false
      return sede === SANTA_TERESITA ? !teresita.includes(id) : teresita.includes(id)
    })
    if (malFinde) return false
  }
  return true
}

function repartirSede(
  trabajandoReg: string[], refuerzosHoy: Refuerzo[], dia: string, rnd: Rnd,
): { teresita: string[]; lucia: string[] } | null {
  const teresitaFijos = refuerzosHoy.filter((r) => r.sede === SANTA_TERESITA).map((r) => r.id)
  const luciaFijos = refuerzosHoy.filter((r) => r.sede === SANTA_LUCIA).map((r) => r.id)
  const libres = CUPO_TERESITA - teresitaFijos.length
  if (libres < 0) return null

  const candidatos = trabajandoReg.filter((id) => !REGLAS.nuncaEnTeresita.includes(id))
  const validos: { teresita: string[]; lucia: string[] }[] = []
  combinaciones(candidatos, libres).forEach((combo) => {
    const teresita = [...teresitaFijos, ...combo]
    const lucia = [...luciaFijos, ...trabajandoReg.filter((id) => !combo.includes(id))]
    const trabajando = [...trabajandoReg, ...refuerzosHoy.map((r) => r.id)]
    if (sedeValida(teresita, lucia, trabajando, dia)) validos.push({ teresita, lucia })
  })
  if (!validos.length) return null
  return validos[Math.floor(rnd() * validos.length)]
}

export function elegirCaja(presentes: string[], sede: string): string | null {
  const pref = REGLAS.prefCaja[sede] || []
  const porPreferencia = pref.find((id) => presentes.includes(id))
  if (porPreferencia) return porPreferencia
  return presentes.find((id) => TODOS_CAJA.includes(id)) || null
}

type Parcial = { schedule: Schedule; caja: Caja; sinCupo: string[]; sinDiaFijo: string[] }

function intentarSemana(
  { regulares, pendientes, refuerzos, diasNuevos, fijos }: {
    regulares: string[]; pendientes: string[]; refuerzos: Refuerzo[]
    diasNuevos: string[]; fijos: Record<string, string>
  },
  rnd: Rnd,
): Parcial | null {
  const diasDescanso = DIAS_CON_DESCANSO.filter((d) => diasNuevos.includes(d))
  const porDiaRefuerzo = planearRefuerzos(refuerzos, diasDescanso, rnd)
  const cupo: Record<string, number> = {}
  diasDescanso.forEach((d) => { cupo[d] = 1 + (porDiaRefuerzo[d]?.length ?? 0) })

  const { rest: descansos, sinCupo, sinDiaFijo } =
    repartirDescansos(pendientes, cupo, diasDescanso, fijos, rnd)
  const schedule: Schedule = {}
  const caja: Caja = {}
  regulares.forEach((id) => { schedule[id] = {} })
  refuerzos.forEach((r) => { schedule[r.id] = {} })

  for (const dia of diasNuevos) {
    const descansaHoy = descansos[dia] ?? []
    const refuerzosHoy = porDiaRefuerzo[dia] ?? []
    descansaHoy.forEach((id) => { schedule[id][dia] = DESCANSO })
    refuerzosHoy.forEach((r) => { schedule[r.id][dia] = r.sede })

    const trabajandoReg = regulares.filter((id) => !descansaHoy.includes(id))
    const grupos = repartirSede(trabajandoReg, refuerzosHoy, dia, rnd)
    if (grupos === null) return null

    grupos.teresita.forEach((id) => { schedule[id][dia] = SANTA_TERESITA })
    grupos.lucia.forEach((id) => { schedule[id][dia] = SANTA_LUCIA })

    caja[dia] = {}
    const cajaLucia = elegirCaja(grupos.lucia, SANTA_LUCIA)
    const cajaTeresita = elegirCaja(grupos.teresita, SANTA_TERESITA)
    if (cajaLucia) caja[dia][SANTA_LUCIA] = cajaLucia
    if (cajaTeresita) caja[dia][SANTA_TERESITA] = cajaTeresita
  }

  refuerzos.forEach((r) => {
    diasNuevos.forEach((dia) => { if (schedule[r.id][dia] === undefined) schedule[r.id][dia] = '' })
  })
  return { schedule, caja, sinCupo, sinDiaFijo }
}

const enumerar = (nombres: string[]): string =>
  nombres.length <= 1 ? nombres.join('') : `${nombres.slice(0, -1).join(', ')} y ${nombres[nombres.length - 1]}`

/**
 * Sugiere el cuadro de la semana.
 *   opciones.desde     = día desde el que se rehace ('lun' = semana entera)
 *   opciones.publicado = { schedule, caja } publicado (se copian los días previos)
 *   opciones.semana    = lunes de la semana, 'yyyy-mm-dd'
 *   schedule[empId][dia] = 'santa_lucia' | 'santa_teresita' | 'descanso' | ''
 *   caja[dia][sede]      = empId del cajero de esa sede ese día
 *   avisos               = reglas que no se pudieron cumplir
 */
export function generarRotacion(
  empleados: Empleado[],
  rnd: Rnd = Math.random,
  opciones: { desde?: string; publicado?: { schedule?: Schedule; caja?: Caja }; semana?: string } = {},
): { schedule: Schedule; caja: Caja; avisos: string[] } {
  const { desde = 'lun', publicado, semana } = opciones
  const regulares = empleados.filter((e) => e.type === 'regular').map((e) => e.id)
  const servicios = empleados.filter((e) => e.type === 'servicios')
  const nombre = (id: string) => empleados.find((e) => e.id === id)?.short ?? id
  const avisos: string[] = []

  const iDesde = Math.max(0, DIAS.indexOf(desde))
  const diasFijos = DIAS.slice(0, iDesde)
  const diasNuevos = DIAS.slice(iDesde)

  // Lo que ya pasó se copia tal cual se publicó: sede, descanso y caja.
  const pubSchedule = publicado?.schedule ?? {}
  const pubCaja = publicado?.caja ?? {}
  const fijo: Schedule = {}
  Object.entries(pubSchedule).forEach(([id, dias]) => {
    diasFijos.forEach((d) => { if (dias?.[d] !== undefined) (fijo[id] ??= {})[d] = dias[d] })
  })
  const cajaFija: Caja = {}
  diasFijos.forEach((d) => { if (pubCaja[d]) cajaFija[d] = { ...pubCaja[d] } })
  if (diasFijos.length && !Object.keys(fijo).length) {
    const rango = diasFijos.length === 1
      ? `el ${NOMBRE_DIA[diasFijos[0]]}`
      : `de ${NOMBRE_DIA[diasFijos[0]]} a ${NOMBRE_DIA[diasFijos[diasFijos.length - 1]]}`
    avisos.push(`No hay cuadro publicado ${rango}: esos días quedan vacíos y no se sabe quién ya descansó.`)
  }

  const yaDescanso = (id: string) => diasFijos.some((d) => fijo[id]?.[d] === DESCANSO)
  const pendientes = regulares.filter((id) => !yaDescanso(id))
  const refuerzos = REGLAS.refuerzos
    .filter((r) => empleados.some((e) => e.id === r.id))
    .map((r) => {
      const usados = diasFijos.filter((d) => [SANTA_LUCIA, SANTA_TERESITA].includes(fijo[r.id]?.[d])).length
      return { ...r, dias: Math.max(0, r.dias - usados) }
    })
  const fijos = descansosFijos(semana)

  let nueva: Parcial | null = null
  for (let intento = 0; intento < 300 && !nueva; intento++) {
    nueva = intentarSemana({ regulares, pendientes, refuerzos, diasNuevos, fijos }, rnd)
  }

  if (!nueva) {
    avisos.push('No se pudo cumplir todas las reglas con el equipo actual. Revisa el cuadro a mano.')
    const sched: Schedule = {}
    regulares.forEach((id, i) => {
      sched[id] = {}
      diasNuevos.forEach((dia) => {
        sched[id][dia] = i < CUPO_TERESITA ? SANTA_TERESITA : SANTA_LUCIA
      })
    })
    refuerzos.forEach((r) => {
      sched[r.id] = {}
      diasNuevos.forEach((dia) => { sched[r.id][dia] = '' })
    })
    nueva = { schedule: sched, caja: {}, sinCupo: [], sinDiaFijo: [] }
  }

  nueva.sinDiaFijo.forEach((id) => {
    avisos.push(`${nombre(id)} no descansó el ${NOMBRE_DIA[fijos[id]]}, su día fijo: se le busca otro día esta semana.`)
  })
  if (nueva.sinCupo.length) {
    avisos.push(`No quedan cupos de descanso de lunes a jueves para ${enumerar(nueva.sinCupo.map(nombre))}: quedan sin descanso esta semana.`)
  }

  const schedule: Schedule = {}
  Object.entries(fijo).forEach(([id, dias]) => { schedule[id] = { ...dias } })
  Object.entries(nueva.schedule).forEach(([id, dias]) => { schedule[id] = { ...(schedule[id] ?? {}), ...dias } })

  servicios.forEach((emp) => {
    schedule[emp.id] = { ...(schedule[emp.id] ?? {}) }
    diasNuevos.forEach((dia) => {
      schedule[emp.id][dia] = esFinde(dia) ? '' : 'trabajo'
    })
  })

  return { schedule, caja: { ...cajaFija, ...nueva.caja }, avisos }
}

// ─── Historial ───────────────────────────────────────────────────────────────
// Cada semana se guarda en turnos/{weekId} y se sobrescribe al publicar: lo que
// hay es cómo quedó al final. Desde 2026-10-07 también se guarda `equipo`.

export type MiembroEquipo = { id: string; short: string; name?: string; type: string }
export type RegistroSemana = { schedule?: Schedule; caja?: Caja; equipo?: MiembroEquipo[]; weekStart?: string }
export type FilaHistorial = {
  id: string; short: string; type: string
  dias: Record<string, { valor: string; etiqueta: string; caja: boolean }>
}

export const NOMBRE_TURNO: Record<string, string> = {
  santa_lucia: 'Santa Lucía',
  santa_teresita: 'Santa Teresita',
  descanso: 'Descanso',
  trabajo: 'Mañana',
}
export const etiquetaTurno = (valor: string): string => NOMBRE_TURNO[valor] ?? '—'

const MESES = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic']
const partes = (fechaISO: string) => fechaISO.split('-').map(Number)

/** "5 al 11 de oct de 2026", "28 de sep al 4 de oct de 2026", con cambio de año igual. */
export function etiquetaSemana(lunes: string): string {
  const domingo = sumarDias(lunes, 6)
  const [a1, m1, d1] = partes(lunes)
  const [a2, m2, d2] = partes(domingo)
  if (a1 !== a2) return `${d1} de ${MESES[m1 - 1]} de ${a1} al ${d2} de ${MESES[m2 - 1]} de ${a2}`
  if (m1 !== m2) return `${d1} de ${MESES[m1 - 1]} al ${d2} de ${MESES[m2 - 1]} de ${a2}`
  return `${d1} al ${d2} de ${MESES[m2 - 1]} de ${a2}`
}

/** "5 oct": fecha corta de un día de la semana. */
export function fechaCorta(lunes: string, dia: string): string {
  const [, m, d] = partes(sumarDias(lunes, DIAS.indexOf(dia)))
  return `${d} ${MESES[m - 1]}`
}

/** Lunes ('yyyy-mm-dd') de la fecha dada, en hora local. */
export function lunesDe(fecha = new Date()): string {
  const f = new Date(fecha.getFullYear(), fecha.getMonth(), fecha.getDate() - ((fecha.getDay() + 6) % 7))
  return `${f.getFullYear()}-${String(f.getMonth() + 1).padStart(2, '0')}-${String(f.getDate()).padStart(2, '0')}`
}

/** Los lunes desde `desde` hasta `hasta` (ambos incluidos). */
export function semanasEntre(desde: string, hasta: string): string[] {
  const out: string[] = []
  for (let s = desde; s <= hasta; s = sumarDias(s, 7)) out.push(s)
  return out
}

/** Lunes de un registro guardado: weekStart o, si no lo tiene, el id ISO 'yyyy-Www'. */
export function lunesDeRegistro(id: string, data?: { weekStart?: string }): string | null {
  if (data?.weekStart) return data.weekStart
  const m = /^(\d{4})-W(\d{2})$/.exec(id)
  if (!m) return null
  const ene4 = new Date(Date.UTC(Number(m[1]), 0, 4))
  const lunesSemana1 = new Date(ene4)
  lunesSemana1.setUTCDate(4 - ((ene4.getUTCDay() + 6) % 7))
  return sumarDias(lunesSemana1.toISOString().slice(0, 10), (Number(m[2]) - 1) * 7)
}

/** Filas de una semana del historial, en el orden en que se publicó. */
export function filasSemana(
  registro: RegistroSemana | null | undefined,
  directorio: { id: string; short: string; type: string }[],
): FilaHistorial[] {
  const schedule = registro?.schedule ?? {}
  const caja = registro?.caja ?? {}
  // En el directorio manda la primera aparición; el equipo guardado, sobre todo.
  const porId = new Map<string, { short: string; type: string }>()
  directorio.forEach((e) => { if (!porId.has(e.id)) porId.set(e.id, e) })
  ;(registro?.equipo ?? []).forEach((e) => porId.set(e.id, e))

  const orden = [...new Set(registro?.equipo?.length
    ? registro.equipo.map((e) => e.id)
    : directorio.map((e) => e.id))]
  const ids = [
    ...orden.filter((id) => schedule[id]),
    ...Object.keys(schedule).filter((id) => !orden.includes(id)).sort(),
  ]

  return ids.map((id) => {
    const emp = porId.get(id)
    const dias: FilaHistorial['dias'] = {}
    DIAS.forEach((d) => {
      const valor = schedule[id]?.[d] ?? ''
      dias[d] = { valor, etiqueta: etiquetaTurno(valor), caja: !!valor && caja[d]?.[valor] === id }
    })
    return { id, short: emp?.short ?? id, type: emp?.type ?? 'regular', dias }
  })
}

/** `equipo` que se guarda al publicar (ver src/utils/turnos.js). */
export function equipoDelCuadro(
  schedule: Schedule,
  empleados: { id: string; short: string; name?: string; type: string }[],
  conocidos: { id: string; short: string; name?: string; type: string }[] = [],
): MiembroEquipo[] {
  const porId = new Map(conocidos.map((e) => [e.id, e]))
  empleados.forEach((e) => porId.set(e.id, e))
  const actuales = empleados.map((e) => e.id)
  const orden = [...actuales, ...Object.keys(schedule).filter((id) => !actuales.includes(id))]
  return orden.filter((id) => schedule[id]).map((id) => {
    const e = porId.get(id)
    return { id, short: e?.short ?? id, name: e?.name ?? e?.short ?? id, type: e?.type ?? 'regular' }
  })
}
