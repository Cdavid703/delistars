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
//   · Andrés (refuerzo) entra 2 días de lunes a jueves a Santa Teresita. No es
//     de la rotación fija: su función es abrir descansos. Cada día que entra,
//     ese día trabaja una persona más y puede descansar alguien más.
//
// Con 6 personas en rotación solo alcanzan 4 descansos (uno por día de lunes a
// jueves): faltarían dos. Los dos días de Andrés aportan justo esos dos, así
// que con el refuerzo TODOS descansan una vez. El generador sortea qué días
// entra Andrés y a quién le toca cada descanso, para no cargar siempre a los
// mismos.

export const DIAS = ['lun', 'mar', 'mie', 'jue', 'vie', 'sab', 'dom']

/** Días en los que alguien descansa. El resto de la semana trabaja el equipo completo. */
export const DIAS_CON_DESCANSO = ['lun', 'mar', 'mie', 'jue']

/** Cupos fijos de Santa Teresita; a Santa Lucía va todo el que sobre. */
export const CUPO_TERESITA = 2

export const SANTA_LUCIA = 'santa_lucia'
export const SANTA_TERESITA = 'santa_teresita'
export const DESCANSO = 'descanso'

export const REGLAS = {
  descansoFijo: { sara: 'mie' },
  nuncaEnTeresita: ['valentina'],
  findeFijo: { valentina: SANTA_LUCIA, joseluis: SANTA_TERESITA },
  anclasTeresita: ['joseluis', 'gendelson'],
  cajeros: ['valentina', 'joseluis', 'sara'],
  refuerzos: [{ id: 'andres', sede: SANTA_TERESITA, dias: 2 }],
  cajerosRefuerzo: ['andres'],
  prefCaja: {
    [SANTA_LUCIA]: ['sara', 'valentina', 'joseluis'],
    [SANTA_TERESITA]: ['joseluis', 'sara', 'valentina', 'andres'],
  },
}

// Cualquiera que pueda quedar en caja: los cajeros de rotación + los de refuerzo
// (Andrés cubre la caja de Teresita solo cuando no hay un cajero de rotación).
const TODOS_CAJA = [...REGLAS.cajeros, ...REGLAS.cajerosRefuerzo]

export const esFinde = (dia) => dia === 'vie' || dia === 'sab' || dia === 'dom'

/** ¿Este empleado puede quedar en caja? (para habilitar la marca en el cuadro) */
export const esCajero = (empId) => TODOS_CAJA.includes(empId)

const shuffle = (arr, rnd) => {
  const out = [...arr]
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rnd() * (i + 1))
    ;[out[i], out[j]] = [out[j], out[i]]
  }
  return out
}

/** Todas las combinaciones de tamaño k de una lista. */
function combinaciones(arr, k) {
  if (k <= 0) return [[]]
  if (k > arr.length) return []
  const out = []
  const rec = (inicio, acc) => {
    if (acc.length === k) { out.push([...acc]); return }
    for (let i = inicio; i < arr.length; i++) { acc.push(arr[i]); rec(i + 1, acc); acc.pop() }
  }
  rec(0, [])
  return out
}

/**
 * Sortea los días (de lunes a jueves) en que entra cada refuerzo.
 * Devuelve { porDia }: día → lista de refuerzos que entran ese día.
 */
function planearRefuerzos(refuerzos, rnd) {
  const porDia = {}
  refuerzos.forEach((r) => {
    const dias = shuffle(DIAS_CON_DESCANSO, rnd).slice(0, Math.min(r.dias, DIAS_CON_DESCANSO.length))
    dias.forEach((d) => { (porDia[d] ??= []).push(r) })
  })
  return porDia
}

/**
 * Reparte los descansos de lunes a jueves respetando el cupo de cada día
 * (1 normal, +1 por cada refuerzo que entra ese día). Sara el miércoles manda;
 * el resto se sortea. Devuelve día → lista de ids que descansan.
 */
function repartirDescansos(regulares, cupo, rnd) {
  const rest = {}
  DIAS_CON_DESCANSO.forEach((d) => { rest[d] = [] })
  const yaDescansan = new Set()

  Object.entries(REGLAS.descansoFijo).forEach(([id, dia]) => {
    if (regulares.includes(id) && DIAS_CON_DESCANSO.includes(dia) && rest[dia].length < cupo[dia]) {
      rest[dia].push(id)
      yaDescansan.add(id)
    }
  })

  const libres = shuffle(regulares.filter((id) => !yaDescansan.has(id)), rnd)
  libres.forEach((id) => {
    const dias = DIAS_CON_DESCANSO.filter((d) => rest[d].length < cupo[d])
    if (!dias.length) return // sin cupo: esta persona no descansa (deficit)
    const dia = dias[Math.floor(rnd() * dias.length)]
    rest[dia].push(id)
  })
  return rest
}

/** ¿Este reparto de sedes cumple las reglas duras del día? */
function sedeValida(teresita, lucia, trabajando, dia) {
  // Ancla: Teresita SIEMPRE necesita a José Luis o Gendelson. Es absoluto: si un
  // reparto de descansos deja a los dos por fuera el mismo día, no hay reparto de
  // sede válido y el generador reintenta la semana (nunca descansan los dos a la vez).
  if (!teresita.some((id) => REGLAS.anclasTeresita.includes(id))) return false
  // Caja de Teresita: un cajero de rotación o, en su defecto, el refuerzo.
  if (!teresita.some((id) => TODOS_CAJA.includes(id))) return false
  // Caja de Lucía: siempre un cajero de rotación (el refuerzo no va a Lucía).
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

/**
 * Reparte a la gente del día entre las dos sedes. Los refuerzos van fijos a su
 * sede; los cupos que sobran de Teresita se llenan con regulares. Devuelve
 * { teresita, lucia } o null si ninguna combinación cumple las reglas.
 */
function repartirSede(trabajandoReg, refuerzosHoy, dia, rnd) {
  const teresitaFijos = refuerzosHoy.filter((r) => r.sede === SANTA_TERESITA).map((r) => r.id)
  const luciaFijos = refuerzosHoy.filter((r) => r.sede === SANTA_LUCIA).map((r) => r.id)
  const libres = CUPO_TERESITA - teresitaFijos.length
  if (libres < 0) return null

  const candidatos = trabajandoReg.filter((id) => !REGLAS.nuncaEnTeresita.includes(id))
  const validos = []
  combinaciones(candidatos, libres).forEach((combo) => {
    const teresita = [...teresitaFijos, ...combo]
    const lucia = [...luciaFijos, ...trabajandoReg.filter((id) => !combo.includes(id))]
    const trabajando = [...trabajandoReg, ...refuerzosHoy.map((r) => r.id)]
    if (sedeValida(teresita, lucia, trabajando, dia)) validos.push({ teresita, lucia })
  })
  if (!validos.length) return null
  return validos[Math.floor(rnd() * validos.length)]
}

/** Cajero de una sede: el primero de la lista de preferencia que esté ahí. */
export function elegirCaja(presentes, sede) {
  const pref = REGLAS.prefCaja[sede] || []
  const porPreferencia = pref.find((id) => presentes.includes(id))
  if (porPreferencia) return porPreferencia
  return presentes.find((id) => TODOS_CAJA.includes(id)) || null
}

/** Arma una semana completa. Devuelve null si algún día no tiene solución. */
function intentarSemana(regulares, refuerzos, rnd) {
  const porDiaRefuerzo = planearRefuerzos(refuerzos, rnd)
  const cupo = {}
  DIAS_CON_DESCANSO.forEach((d) => { cupo[d] = 1 + (porDiaRefuerzo[d]?.length ?? 0) })

  const descansos = repartirDescansos(regulares, cupo, rnd)
  const schedule = {}
  const caja = {}
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

  // Días que el refuerzo no entra (y todo el finde) quedan en blanco: no es un
  // descanso, simplemente no forma parte de la rotación esos días.
  refuerzos.forEach((r) => {
    DIAS.forEach((dia) => { if (schedule[r.id][dia] === undefined) schedule[r.id][dia] = '' })
  })
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
  // Refuerzos configurados que además estén en el equipo actual (si Andrés no
  // está en la plantilla, no hay refuerzo y se vuelve a los dos sin descanso).
  const refuerzos = REGLAS.refuerzos.filter((r) => empleados.some((e) => e.id === r.id))
  const avisos = []

  let semana = null
  for (let intento = 0; intento < 300 && !semana; intento++) {
    semana = intentarSemana(regulares, refuerzos, rnd)
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
    refuerzos.forEach((r) => {
      semana.schedule[r.id] = {}
      DIAS.forEach((dia) => { semana.schedule[r.id][dia] = '' })
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
