// ─── Reglas del cuadro de turnos ─────────────────────────────────────────────
// FUENTE DE VERDAD de la rotación. ESPEJO: delistars-menu-magic/admin/src/lib/
// turnos.ts (el admin es un build Vite aparte). Mantener sincronizados.
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
//   · Andrés (refuerzo) entra 2 días de lunes a jueves a Santa Teresita. No es
//     de la rotación fija: su función es abrir descansos. Cada día que entra,
//     ese día trabaja una persona más y puede descansar alguien más.
//
// Con 6 personas en rotación solo alcanzan 4 descansos (uno por día de lunes a
// jueves): faltarían dos. Los dos días de Andrés aportan justo esos dos, así
// que con el refuerzo TODOS descansan una vez. El generador sortea qué días
// entra Andrés y a quién le toca cada descanso, para no cargar siempre a los
// mismos.
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

/** Días en los que alguien descansa. El resto de la semana trabaja el equipo completo. */
export const DIAS_CON_DESCANSO = ['lun', 'mar', 'mie', 'jue']

/** Cupos fijos de Santa Teresita; a Santa Lucía va todo el que sobre. */
export const CUPO_TERESITA = 2

export const SANTA_LUCIA = 'santa_lucia'
export const SANTA_TERESITA = 'santa_teresita'
export const DESCANSO = 'descanso'

export const REGLAS = {
  descansoFijo: { sara: 'mie' },
  // Semanas en que el descanso fijo NO aplica y la persona rota como los demás.
  // Se mira la fecha que cae el día fijo esa semana (para Sara, el miércoles).
  descansoFijoLibre: { sara: [{ desde: '2026-10-05', hasta: '9999-12-31' }] },
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


const NOMBRE_DIA = {
  lun: 'lunes', mar: 'martes', mie: 'miércoles', jue: 'jueves',
  vie: 'viernes', sab: 'sábado', dom: 'domingo',
}

/** Suma días a una fecha 'yyyy-mm-dd' (sin líos de zona horaria). */
export function sumarDias(fechaISO, n) {
  const [a, m, d] = fechaISO.split('-').map(Number)
  return new Date(Date.UTC(a, m - 1, d + n)).toISOString().slice(0, 10)
}

/** Clave del día de una fecha ('lun'…'dom'), en la hora local del navegador. */
export const diaDeHoy = (fecha = new Date()) => DIAS[(fecha.getDay() + 6) % 7]

/**
 * Descansos fijos que aplican la semana que empieza el lunes `semana`
 * ('yyyy-mm-dd'): id → día. Sin semana aplican todos.
 */
export function descansosFijos(semana) {
  const out = {}
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

/**
 * Sortea en cuáles de `diasDescanso` entra cada refuerzo (r.dias = los días
 * que le quedan esa semana). Devuelve día → lista de refuerzos que entran.
 */
function planearRefuerzos(refuerzos, diasDescanso, rnd) {
  const porDia = {}
  refuerzos.forEach((r) => {
    const dias = shuffle(diasDescanso, rnd).slice(0, Math.min(r.dias, diasDescanso.length))
    dias.forEach((d) => { (porDia[d] ??= []).push(r) })
  })
  return porDia
}

/**
 * Reparte los descansos de los que aún no han descansado entre `diasDescanso`,
 * respetando el cupo de cada día (1 normal, +1 por cada refuerzo que entra).
 * El descanso fijo manda. Si ese día ya pasó (o no tiene cupo), la persona
 * pasa primera a los días que quedan; sinDiaFijo dice a quién se le corrió.
 * Devuelve { rest, sinCupo, sinDiaFijo }.
 */
function repartirDescansos(pendientes, cupo, diasDescanso, fijos, rnd) {
  const rest = {}
  diasDescanso.forEach((d) => { rest[d] = [] })
  const sinCupo = []
  const sinDiaFijo = []
  const conDiaFijo = new Set()

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

/**
 * Arma los días `diasNuevos` de la semana. Devuelve null si algún día no tiene
 * solución. `pendientes` son los regulares que todavía no han descansado.
 */
function intentarSemana({ regulares, pendientes, refuerzos, diasNuevos, fijos }, rnd) {
  const diasDescanso = DIAS_CON_DESCANSO.filter((d) => diasNuevos.includes(d))
  const porDiaRefuerzo = planearRefuerzos(refuerzos, diasDescanso, rnd)
  const cupo = {}
  diasDescanso.forEach((d) => { cupo[d] = 1 + (porDiaRefuerzo[d]?.length ?? 0) })

  const { rest: descansos, sinCupo, sinDiaFijo } =
    repartirDescansos(pendientes, cupo, diasDescanso, fijos, rnd)
  const schedule = {}
  const caja = {}
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

  // Días que el refuerzo no entra (y todo el finde) quedan en blanco: no es un
  // descanso, simplemente no forma parte de la rotación esos días.
  refuerzos.forEach((r) => {
    diasNuevos.forEach((dia) => { if (schedule[r.id][dia] === undefined) schedule[r.id][dia] = '' })
  })
  return { schedule, caja, sinCupo, sinDiaFijo }
}

/** "Shirly", "Shirly y Melissa", "Sara, Shirly y Melissa". */
const enumerar = (nombres) =>
  nombres.length <= 1 ? nombres.join('') : `${nombres.slice(0, -1).join(', ')} y ${nombres[nombres.length - 1]}`

/**
 * Sugiere el cuadro de la semana.
 *
 * opciones:
 *   desde     = día desde el que se rehace ('lun' por defecto = semana entera).
 *               Los días anteriores se copian tal cual de `publicado`.
 *   publicado = { schedule, caja } publicado de esa semana.
 *   semana    = lunes de la semana, 'yyyy-mm-dd' (para reglas con fecha).
 *
 * Devuelve { schedule, caja, avisos }:
 *   schedule[empId][dia] = 'santa_lucia' | 'santa_teresita' | 'descanso' | ''
 *   caja[dia][sede]      = empId del cajero de esa sede ese día
 *   avisos               = reglas que no se pudieron cumplir (lista vacía si todo cuadró)
 */
export function generarRotacion(empleados, rnd = Math.random, opciones = {}) {
  const { desde = 'lun', publicado, semana } = opciones
  const regulares = empleados.filter((e) => e.type === 'regular').map((e) => e.id)
  const servicios = empleados.filter((e) => e.type === 'servicios')
  const nombre = (id) => empleados.find((e) => e.id === id)?.short ?? id
  const avisos = []

  const iDesde = Math.max(0, DIAS.indexOf(desde))
  const diasFijos = DIAS.slice(0, iDesde)
  const diasNuevos = DIAS.slice(iDesde)

  // Lo que ya pasó se copia tal cual se publicó: sede, descanso y caja, de
  // todas las personas que aparezcan (aunque hoy ya no estén en el equipo).
  const pubSchedule = publicado?.schedule ?? {}
  const pubCaja = publicado?.caja ?? {}
  const fijo = {}
  Object.entries(pubSchedule).forEach(([id, dias]) => {
    diasFijos.forEach((d) => { if (dias?.[d] !== undefined) (fijo[id] ??= {})[d] = dias[d] })
  })
  const cajaFija = {}
  diasFijos.forEach((d) => { if (pubCaja[d]) cajaFija[d] = { ...pubCaja[d] } })
  if (diasFijos.length && !Object.keys(fijo).length) {
    const rango = diasFijos.length === 1
      ? `el ${NOMBRE_DIA[diasFijos[0]]}`
      : `de ${NOMBRE_DIA[diasFijos[0]]} a ${NOMBRE_DIA[diasFijos[diasFijos.length - 1]]}`
    avisos.push(`No hay cuadro publicado ${rango}: esos días quedan vacíos y no se sabe quién ya descansó.`)
  }

  const yaDescanso = (id) => diasFijos.some((d) => fijo[id]?.[d] === DESCANSO)
  const pendientes = regulares.filter((id) => !yaDescanso(id))
  // Refuerzos configurados que además estén en el equipo actual (si Andrés no
  // está en la plantilla, no hay refuerzo y se vuelve a los dos sin descanso).
  // A cada uno se le descuentan los días que ya entró esta semana.
  const refuerzos = REGLAS.refuerzos
    .filter((r) => empleados.some((e) => e.id === r.id))
    .map((r) => {
      const usados = diasFijos.filter((d) => [SANTA_LUCIA, SANTA_TERESITA].includes(fijo[r.id]?.[d])).length
      return { ...r, dias: Math.max(0, r.dias - usados) }
    })
  const fijos = descansosFijos(semana)

  let nueva = null
  for (let intento = 0; intento < 300 && !nueva; intento++) {
    nueva = intentarSemana({ regulares, pendientes, refuerzos, diasNuevos, fijos }, rnd)
  }

  if (!nueva) {
    // Sin solución con las reglas actuales (equipo muy chico o alguien de baja):
    // se arma lo básico y se avisa, en vez de publicar un cuadro que aparente
    // cumplir reglas que no cumple.
    avisos.push(
      'No se pudo cumplir todas las reglas con el equipo actual. Revisa el cuadro a mano.',
    )
    nueva = { schedule: {}, caja: {}, sinCupo: [], sinDiaFijo: [] }
    regulares.forEach((id, i) => {
      nueva.schedule[id] = {}
      diasNuevos.forEach((dia) => {
        nueva.schedule[id][dia] = i < CUPO_TERESITA ? SANTA_TERESITA : SANTA_LUCIA
      })
    })
    refuerzos.forEach((r) => {
      nueva.schedule[r.id] = {}
      diasNuevos.forEach((dia) => { nueva.schedule[r.id][dia] = '' })
    })
  }

  nueva.sinDiaFijo.forEach((id) => {
    avisos.push(`${nombre(id)} no descansó el ${NOMBRE_DIA[fijos[id]]}, su día fijo: se le busca otro día esta semana.`)
  })
  if (nueva.sinCupo.length) {
    avisos.push(`No quedan cupos de descanso de lunes a jueves para ${enumerar(nueva.sinCupo.map(nombre))}: quedan sin descanso esta semana.`)
  }

  const schedule = {}
  Object.entries(fijo).forEach(([id, dias]) => { schedule[id] = { ...dias } })
  Object.entries(nueva.schedule).forEach(([id, dias]) => { schedule[id] = { ...(schedule[id] ?? {}), ...dias } })

  // Servicios generales: turno de la mañana de lunes a jueves; el finde queda
  // en blanco a propósito (lo cubre otra persona, no es un descanso).
  servicios.forEach((emp) => {
    schedule[emp.id] = { ...(schedule[emp.id] ?? {}) }
    diasNuevos.forEach((dia) => {
      schedule[emp.id][dia] = esFinde(dia) ? '' : 'trabajo'
    })
  })

  return { schedule, caja: { ...cajaFija, ...nueva.caja }, avisos }
}

// ─── Historial ───────────────────────────────────────────────────────────────
// Cada semana se guarda en turnos/{weekId} y se sobrescribe al publicar, así
// que lo que hay es cómo quedó al final. Desde 2026-10-07 también se guarda
// `equipo` (quién estaba y cómo se llamaba) para que una semana vieja muestre a
// la gente aunque después haya salido.

export const NOMBRE_TURNO = {
  santa_lucia: 'Santa Lucía',
  santa_teresita: 'Santa Teresita',
  descanso: 'Descanso',
  trabajo: 'Mañana',
}
export const etiquetaTurno = (valor) => NOMBRE_TURNO[valor] ?? '—'

const MESES = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic']
const partes = (fechaISO) => fechaISO.split('-').map(Number)

/** "5 al 11 de oct de 2026", "28 de sep al 4 de oct de 2026", con cambio de año igual. */
export function etiquetaSemana(lunes) {
  const domingo = sumarDias(lunes, 6)
  const [a1, m1, d1] = partes(lunes)
  const [a2, m2, d2] = partes(domingo)
  if (a1 !== a2) return `${d1} de ${MESES[m1 - 1]} de ${a1} al ${d2} de ${MESES[m2 - 1]} de ${a2}`
  if (m1 !== m2) return `${d1} de ${MESES[m1 - 1]} al ${d2} de ${MESES[m2 - 1]} de ${a2}`
  return `${d1} al ${d2} de ${MESES[m2 - 1]} de ${a2}`
}

/** "5 oct": fecha corta de un día de la semana. */
export function fechaCorta(lunes, dia) {
  const [, m, d] = partes(sumarDias(lunes, DIAS.indexOf(dia)))
  return `${d} ${MESES[m - 1]}`
}

/** Lunes ('yyyy-mm-dd') de la fecha dada, en hora local. */
export function lunesDe(fecha = new Date()) {
  const f = new Date(fecha.getFullYear(), fecha.getMonth(), fecha.getDate() - ((fecha.getDay() + 6) % 7))
  return `${f.getFullYear()}-${String(f.getMonth() + 1).padStart(2, '0')}-${String(f.getDate()).padStart(2, '0')}`
}

/** Los lunes desde `desde` hasta `hasta` (ambos lunes, ambos incluidos). */
export function semanasEntre(desde, hasta) {
  const out = []
  for (let s = desde; s <= hasta; s = sumarDias(s, 7)) out.push(s)
  return out
}

/**
 * Lunes de un registro guardado: el campo weekStart o, si no lo tiene, el id
 * 'yyyy-Www' leído como semana ISO.
 */
export function lunesDeRegistro(id, data) {
  if (data?.weekStart) return data.weekStart
  const m = /^(\d{4})-W(\d{2})$/.exec(id)
  if (!m) return null
  const ene4 = new Date(Date.UTC(Number(m[1]), 0, 4))
  const lunesSemana1 = new Date(ene4)
  lunesSemana1.setUTCDate(4 - ((ene4.getUTCDay() + 6) % 7))
  return sumarDias(lunesSemana1.toISOString().slice(0, 10), (Number(m[2]) - 1) * 7)
}

/**
 * Filas de una semana del historial, en el orden en que se publicó.
 * `directorio` = [{ id, short, type }] para nombrar a quien no venga en el
 * `equipo` guardado (semanas publicadas antes de que se guardara).
 * Cada fila: { id, short, type, dias: { lun: { valor, etiqueta, caja } … } }.
 */
export function filasSemana(registro, directorio) {
  const schedule = registro?.schedule ?? {}
  const caja = registro?.caja ?? {}
  // En el directorio manda la primera aparición; el equipo guardado, sobre todo.
  const porId = new Map()
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
    const dias = {}
    DIAS.forEach((d) => {
      const valor = schedule[id]?.[d] ?? ''
      dias[d] = { valor, etiqueta: etiquetaTurno(valor), caja: !!valor && caja[d]?.[valor] === id }
    })
    return { id, short: emp?.short ?? id, type: emp?.type ?? 'regular', dias }
  })
}

/**
 * `equipo` que se guarda al publicar: quién aparece en el cuadro, en el orden
 * de la pantalla, con su nombre. Quien ya no está en el equipo actual (pero
 * tiene días de esa semana) se nombra con `conocidos` (lo guardado antes o la
 * lista de ex empleados).
 */
export function equipoDelCuadro(schedule, empleados, conocidos = []) {
  const porId = new Map(conocidos.map((e) => [e.id, e]))
  empleados.forEach((e) => porId.set(e.id, e))
  const actuales = empleados.map((e) => e.id)
  const orden = [...actuales, ...Object.keys(schedule).filter((id) => !actuales.includes(id))]
  return orden.filter((id) => schedule[id]).map((id) => {
    const e = porId.get(id)
    return { id, short: e?.short ?? id, name: e?.name ?? e?.short ?? id, type: e?.type ?? 'regular' }
  })
}
