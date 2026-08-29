// ─── Reglas del cuadro de turnos ─────────────────────────────────────────────
// ESPEJO de src/utils/turnos.js (repo raíz), que es la FUENTE DE VERDAD y tiene
// las pruebas (`npm test` → tests/turnos.test.mjs). Si cambias una regla aquí,
// cámbiala allá y corre las pruebas.
//
// Las reglas del negocio (2026-08-29):
//   · Santa Teresita: siempre 2 personas. El resto va a Santa Lucía.
//   · Descansos SOLO de lunes a jueves, uno por día. Viernes, sábado y domingo
//     trabaja todo el mundo — por eso el finde queda con 4 en Santa Lucía.
//   · Sara descansa siempre el miércoles.
//   · Valentina nunca va a Santa Teresita (lleva la gestión del negocio).
//   · El finde: Valentina en Santa Lucía y José Luis en Santa Teresita.
//   · Santa Teresita necesita SIEMPRE a José Luis o a Gendelson.
//   · Cada sede necesita un cajero presente (Valentina, José Luis o Sara).
//     En Santa Lucía se prefiere a Sara en caja para dejar libre a Valentina.
//   · Deisy (servicios generales) no rota: turno de la mañana de lunes a
//     jueves, y el finde se deja en blanco (lo cubre otra persona).
//   · Andrés (refuerzo) entra 2 días de lunes a jueves a Santa Teresita para
//     abrir descansos: cada día que entra, ese día puede descansar alguien más.

export const DIAS = ['lun', 'mar', 'mie', 'jue', 'vie', 'sab', 'dom']
export const DIAS_CON_DESCANSO = ['lun', 'mar', 'mie', 'jue']
export const CUPO_TERESITA = 2

export const SANTA_LUCIA = 'santa_lucia'
export const SANTA_TERESITA = 'santa_teresita'
export const DESCANSO = 'descanso'

type Refuerzo = { id: string; sede: string; dias: number }

export const REGLAS = {
  descansoFijo: { sara: 'mie' } as Record<string, string>,
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
type Empleado = { id: string; type: 'regular' | 'servicios' | 'refuerzo' }
type Rnd = () => number

export const esFinde = (dia: string) => dia === 'vie' || dia === 'sab' || dia === 'dom'
export const esCajero = (empId: string) => TODOS_CAJA.includes(empId)

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

function planearRefuerzos(refuerzos: Refuerzo[], rnd: Rnd): Record<string, Refuerzo[]> {
  const porDia: Record<string, Refuerzo[]> = {}
  refuerzos.forEach((r) => {
    const dias = shuffle(DIAS_CON_DESCANSO, rnd).slice(0, Math.min(r.dias, DIAS_CON_DESCANSO.length))
    dias.forEach((d) => { (porDia[d] ??= []).push(r) })
  })
  return porDia
}

function repartirDescansos(
  regulares: string[], cupo: Record<string, number>, rnd: Rnd,
): Record<string, string[]> {
  const rest: Record<string, string[]> = {}
  DIAS_CON_DESCANSO.forEach((d) => { rest[d] = [] })
  const yaDescansan = new Set<string>()

  Object.entries(REGLAS.descansoFijo).forEach(([id, dia]) => {
    if (regulares.includes(id) && DIAS_CON_DESCANSO.includes(dia) && rest[dia].length < cupo[dia]) {
      rest[dia].push(id)
      yaDescansan.add(id)
    }
  })

  const libres = shuffle(regulares.filter((id) => !yaDescansan.has(id)), rnd)
  libres.forEach((id) => {
    const dias = DIAS_CON_DESCANSO.filter((d) => rest[d].length < cupo[d])
    if (!dias.length) return
    const dia = dias[Math.floor(rnd() * dias.length)]
    rest[dia].push(id)
  })
  return rest
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

function intentarSemana(
  regulares: string[], refuerzos: Refuerzo[], rnd: Rnd,
): { schedule: Schedule; caja: Caja } | null {
  const porDiaRefuerzo = planearRefuerzos(refuerzos, rnd)
  const cupo: Record<string, number> = {}
  DIAS_CON_DESCANSO.forEach((d) => { cupo[d] = 1 + (porDiaRefuerzo[d]?.length ?? 0) })

  const descansos = repartirDescansos(regulares, cupo, rnd)
  const schedule: Schedule = {}
  const caja: Caja = {}
  regulares.forEach((id) => { schedule[id] = {} })
  refuerzos.forEach((r) => { schedule[r.id] = {} })

  for (const dia of DIAS) {
    const descansaHoy = esFinde(dia) ? [] : descansos[dia]
    const refuerzosHoy = esFinde(dia) ? [] : (porDiaRefuerzo[dia] ?? [])
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
    DIAS.forEach((dia) => { if (schedule[r.id][dia] === undefined) schedule[r.id][dia] = '' })
  })
  return { schedule, caja }
}

/**
 * Sugiere el cuadro de la semana.
 *   schedule[empId][dia] = 'santa_lucia' | 'santa_teresita' | 'descanso' | ''
 *   caja[dia][sede]      = empId del cajero de esa sede ese día
 *   avisos               = reglas que no se pudieron cumplir
 */
export function generarRotacion(
  empleados: Empleado[],
  rnd: Rnd = Math.random,
): { schedule: Schedule; caja: Caja; avisos: string[] } {
  const regulares = empleados.filter((e) => e.type === 'regular').map((e) => e.id)
  const servicios = empleados.filter((e) => e.type === 'servicios')
  const refuerzos = REGLAS.refuerzos.filter((r) => empleados.some((e) => e.id === r.id))
  const avisos: string[] = []

  let semana: { schedule: Schedule; caja: Caja } | null = null
  for (let intento = 0; intento < 300 && !semana; intento++) {
    semana = intentarSemana(regulares, refuerzos, rnd)
  }

  if (!semana) {
    avisos.push('No se pudo cumplir todas las reglas con el equipo actual. Revisa el cuadro a mano.')
    const schedule: Schedule = {}
    regulares.forEach((id, i) => {
      schedule[id] = {}
      DIAS.forEach((dia) => {
        schedule[id][dia] = i < CUPO_TERESITA ? SANTA_TERESITA : SANTA_LUCIA
      })
    })
    refuerzos.forEach((r) => {
      schedule[r.id] = {}
      DIAS.forEach((dia) => { schedule[r.id][dia] = '' })
    })
    semana = { schedule, caja: {} }
  }

  servicios.forEach((emp) => {
    semana!.schedule[emp.id] = {}
    DIAS.forEach((dia) => {
      semana!.schedule[emp.id][dia] = esFinde(dia) ? '' : 'trabajo'
    })
  })

  return { ...semana, avisos }
}
