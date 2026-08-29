// ─── Reglas del cuadro de turnos ─────────────────────────────────────────────
// FUENTE DE VERDAD de la rotación. ESPEJO: delistars-menu-magic/admin/src/lib/
// turnos.ts (el admin es un build Vite aparte). Mantener sincronizados.
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

/** Días en los que alguien descansa. El resto de la semana trabaja el equipo completo. */
export const DIAS_CON_DESCANSO = ['lun', 'mar', 'mie', 'jue']

/** Cupos fijos de Santa Teresita; a Santa Lucía va todo el que sobre. */
export const CUPO_TERESITA = 2

export const SANTA_LUCIA = 'santa_lucia'
export const SANTA_TERESITA = 'santa_teresita'
export const DESCANSO = 'descanso'

export const REGLAS = {
  // Empleado → día en que siempre descansa.
  descansoFijo: { sara: 'mie' },
  // Nunca se les asigna Santa Teresita.
  nuncaEnTeresita: ['valentina'],
  // Viernes, sábado y domingo: sede fija.
  findeFijo: { valentina: SANTA_LUCIA, joseluis: SANTA_TERESITA },
  // Santa Teresita necesita al menos a uno de estos dos, todos los días.
  anclasTeresita: ['joseluis', 'gendelson'],
  // Quiénes pueden hacer caja.
  cajeros: ['valentina', 'joseluis', 'sara'],
  // Orden de preferencia para la caja de cada sede.
  prefCaja: {
    [SANTA_LUCIA]: ['sara', 'valentina', 'joseluis'],
    [SANTA_TERESITA]: ['joseluis', 'sara', 'valentina'],
  },
}

export const esFinde = (dia) => dia === 'vie' || dia === 'sab' || dia === 'dom'

const shuffle = (arr, rnd) => {
  const out = [...arr]
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rnd() * (i + 1))
    ;[out[i], out[j]] = [out[j], out[i]]
  }
  return out
}

/**
 * Reparte los descansos de lunes a jueves: uno por día, nadie descansa dos
 * veces. Los descansos fijos (Sara el miércoles) mandan; el resto se sortea.
 * Si hay menos gente que días, algún día queda sin descanso.
 */
function repartirDescansos(regulares, rnd) {
  const porDia = {}
  const yaDescansan = new Set()

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

/** Todas las parejas posibles de una lista. */
function parejas(ids) {
  const out = []
  for (let i = 0; i < ids.length; i++) {
    for (let j = i + 1; j < ids.length; j++) out.push([ids[i], ids[j]])
  }
  return out
}

/**
 * Elige las 2 personas de Santa Teresita. Devuelve la pareja o null si ninguna
 * combinación cumple las reglas duras (el llamador reintenta la semana).
 */
function elegirTeresita(trabajando, dia, rnd) {
  const validas = parejas(trabajando).filter((par) => {
    if (par.some((id) => REGLAS.nuncaEnTeresita.includes(id))) return false
    // El ancla (José Luis o Gendelson) y el cajero solo se exigen si esa gente
    // está en el equipo: así el cuadro no se rompe si alguien sale.
    const hayAncla = trabajando.some((id) => REGLAS.anclasTeresita.includes(id))
    if (hayAncla && !par.some((id) => REGLAS.anclasTeresita.includes(id))) return false
    const hayCajero = trabajando.some((id) => REGLAS.cajeros.includes(id))
    if (hayCajero && !par.some((id) => REGLAS.cajeros.includes(id))) return false
    // Santa Lucía también necesita cajero: si los únicos cajeros del día se van
    // los dos a Teresita, Lucía queda sin caja.
    if (hayCajero) {
      const enLucia = trabajando.filter((id) => !par.includes(id))
      if (!enLucia.some((id) => REGLAS.cajeros.includes(id))) return false
    }
    if (esFinde(dia)) {
      // Sede fija del fin de semana.
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

/** ¿Este empleado puede quedar en caja? (para habilitar la marca en el cuadro) */
export const esCajero = (empId) => REGLAS.cajeros.includes(empId)

/** Cajero de una sede: el primero de la lista de preferencia que esté ahí. */
export function elegirCaja(presentes, sede) {
  const pref = REGLAS.prefCaja[sede] || []
  const porPreferencia = pref.find((id) => presentes.includes(id))
  if (porPreferencia) return porPreferencia
  return presentes.find((id) => REGLAS.cajeros.includes(id)) || null
}

/** Arma una semana completa. Devuelve null si algún día no tiene solución. */
function intentarSemana(regulares, rnd) {
  const descansos = repartirDescansos(regulares, rnd)
  const schedule = {}
  const caja = {}
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
 * Devuelve { schedule, caja, avisos }:
 *   schedule[empId][dia] = 'santa_lucia' | 'santa_teresita' | 'descanso' | ''
 *   caja[dia][sede]      = empId del cajero de esa sede ese día
 *   avisos               = reglas que no se pudieron cumplir (lista vacía si todo cuadró)
 */
export function generarRotacion(empleados, rnd = Math.random) {
  const regulares = empleados.filter((e) => e.type === 'regular').map((e) => e.id)
  const servicios = empleados.filter((e) => e.type === 'servicios')
  const avisos = []

  let semana = null
  for (let intento = 0; intento < 200 && !semana; intento++) {
    semana = intentarSemana(regulares, rnd)
  }

  if (!semana) {
    // Sin solución con las reglas actuales (equipo muy chico o alguien de baja):
    // se arma lo básico y se avisa, en vez de publicar un cuadro que aparente
    // cumplir reglas que no cumple.
    avisos.push(
      'No se pudo cumplir todas las reglas con el equipo actual. Revisa el cuadro a mano.',
    )
    semana = { schedule: {}, caja: {} }
    regulares.forEach((id, i) => {
      semana.schedule[id] = {}
      DIAS.forEach((dia) => {
        semana.schedule[id][dia] = i < CUPO_TERESITA ? SANTA_TERESITA : SANTA_LUCIA
      })
    })
  }

  // Servicios generales: turno de la mañana de lunes a jueves; el finde queda
  // en blanco a propósito (lo cubre otra persona, no es un descanso).
  servicios.forEach((emp) => {
    semana.schedule[emp.id] = {}
    DIAS.forEach((dia) => {
      semana.schedule[emp.id][dia] = esFinde(dia) ? '' : 'trabajo'
    })
  })

  return { ...semana, avisos }
}
