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
//
// Con 6 personas en rotación solo alcanzan 4 descansos (uno por día de lunes a
// jueves), así que cada semana hay dos personas que trabajan los 7 días. El
// generador sortea quiénes son para que no le toque siempre a los mismos.

export const DIAS = ['lun', 'mar', 'mie', 'jue', 'vie', 'sab', 'dom']
export const DIAS_CON_DESCANSO = ['lun', 'mar', 'mie', 'jue']
export const CUPO_TERESITA = 2

export const SANTA_LUCIA = 'santa_lucia'
export const SANTA_TERESITA = 'santa_teresita'
export const DESCANSO = 'descanso'

export const REGLAS = {
  descansoFijo: { sara: 'mie' } as Record<string, string>,
  nuncaEnTeresita: ['valentina'],
  findeFijo: { valentina: SANTA_LUCIA, joseluis: SANTA_TERESITA } as Record<string, string>,
  anclasTeresita: ['joseluis', 'gendelson'],
  cajeros: ['valentina', 'joseluis', 'sara'],
  prefCaja: {
    [SANTA_LUCIA]: ['sara', 'valentina', 'joseluis'],
    [SANTA_TERESITA]: ['joseluis', 'sara', 'valentina'],
  } as Record<string, string[]>,
}

export type Schedule = Record<string, Record<string, string>>
export type Caja = Record<string, Record<string, string>>
type Empleado = { id: string; type: 'regular' | 'servicios' }
type Rnd = () => number

export const esFinde = (dia: string) => dia === 'vie' || dia === 'sab' || dia === 'dom'
export const esCajero = (empId: string) => REGLAS.cajeros.includes(empId)

const shuffle = (arr: string[], rnd: Rnd): string[] => {
  const out = [...arr]
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rnd() * (i + 1))
    ;[out[i], out[j]] = [out[j], out[i]]
  }
  return out
}

function repartirDescansos(regulares: string[], rnd: Rnd): Record<string, string> {
  const porDia: Record<string, string> = {}
  const yaDescansan = new Set<string>()

  Object.entries(REGLAS.descansoFijo).forEach(([id, dia]) => {
    if (regulares.includes(id) && DIAS_CON_DESCANSO.includes(dia)) {
      porDia[dia] = id
      yaDescansan.add(id)
    }
  })

  const libres = shuffle(regulares.filter((id) => !yaDescansan.has(id)), rnd)
  let i = 0
  DIAS_CON_DESCANSO.forEach((dia) => {
    if (porDia[dia] || i >= libres.length) return
    porDia[dia] = libres[i++]
  })
  return porDia
}

function parejas(ids: string[]): string[][] {
  const out: string[][] = []
  for (let i = 0; i < ids.length; i++) {
    for (let j = i + 1; j < ids.length; j++) out.push([ids[i], ids[j]])
  }
  return out
}

function elegirTeresita(trabajando: string[], dia: string, rnd: Rnd): string[] | null {
  const validas = parejas(trabajando).filter((par) => {
    if (par.some((id) => REGLAS.nuncaEnTeresita.includes(id))) return false
    const hayAncla = trabajando.some((id) => REGLAS.anclasTeresita.includes(id))
    if (hayAncla && !par.some((id) => REGLAS.anclasTeresita.includes(id))) return false
    const hayCajero = trabajando.some((id) => REGLAS.cajeros.includes(id))
    if (hayCajero && !par.some((id) => REGLAS.cajeros.includes(id))) return false
    if (hayCajero) {
      const enLucia = trabajando.filter((id) => !par.includes(id))
      if (!enLucia.some((id) => REGLAS.cajeros.includes(id))) return false
    }
    if (esFinde(dia)) {
      const malFinde = Object.entries(REGLAS.findeFijo).some(([id, sede]) => {
        if (!trabajando.includes(id)) return false
        return sede === SANTA_TERESITA ? !par.includes(id) : par.includes(id)
      })
      if (malFinde) return false
    }
    return true
  })
  if (!validas.length) return null
  return validas[Math.floor(rnd() * validas.length)]
}

export function elegirCaja(presentes: string[], sede: string): string | null {
  const pref = REGLAS.prefCaja[sede] || []
  const porPreferencia = pref.find((id) => presentes.includes(id))
  if (porPreferencia) return porPreferencia
  return presentes.find((id) => REGLAS.cajeros.includes(id)) || null
}

function intentarSemana(regulares: string[], rnd: Rnd): { schedule: Schedule; caja: Caja } | null {
  const descansos = repartirDescansos(regulares, rnd)
  const schedule: Schedule = {}
  const caja: Caja = {}
  regulares.forEach((id) => { schedule[id] = {} })

  for (const dia of DIAS) {
    const descansa = esFinde(dia) ? null : descansos[dia]
    const trabajando = regulares.filter((id) => id !== descansa)
    if (descansa) schedule[descansa][dia] = DESCANSO

    const teresita = trabajando.length > CUPO_TERESITA
      ? elegirTeresita(trabajando, dia, rnd)
      : []
    if (teresita === null) return null

    const lucia = trabajando.filter((id) => !teresita.includes(id))
    teresita.forEach((id) => { schedule[id][dia] = SANTA_TERESITA })
    lucia.forEach((id) => { schedule[id][dia] = SANTA_LUCIA })

    caja[dia] = {}
    const cajaLucia = elegirCaja(lucia, SANTA_LUCIA)
    const cajaTeresita = elegirCaja(teresita, SANTA_TERESITA)
    if (cajaLucia) caja[dia][SANTA_LUCIA] = cajaLucia
    if (cajaTeresita) caja[dia][SANTA_TERESITA] = cajaTeresita
  }
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
  const avisos: string[] = []

  let semana: { schedule: Schedule; caja: Caja } | null = null
  for (let intento = 0; intento < 200 && !semana; intento++) {
    semana = intentarSemana(regulares, rnd)
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
