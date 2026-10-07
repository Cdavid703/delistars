// Pruebas de las reglas del cuadro de turnos. El generador sortea, así que
// cada prueba corre muchas semanas seguidas: una regla que se rompe una vez
// cada veinte sorteos igual llega al cuadro publicado.
// Corre con: npm test  (node --test, sin dependencias)
import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  generarRotacion, DIAS, DIAS_CON_DESCANSO, CUPO_TERESITA, esFinde,
  SANTA_LUCIA, SANTA_TERESITA, DESCANSO, REGLAS,
  descansosFijos, diaDeHoy, etiquetaSemana, semanasEntre, lunesDe, lunesDeRegistro, filasSemana,
  equipoDelCuadro,
} from '../src/utils/turnos.js'

// La plantilla real al 2026-08-29.
const EQUIPO = [
  { id: 'joseluis',  type: 'regular' },
  { id: 'sara',      type: 'regular' },
  { id: 'valentina', type: 'regular' },
  { id: 'gendelson', type: 'regular' },
  { id: 'shirly',    type: 'regular' },
  { id: 'melissa',   type: 'regular' },
  { id: 'andres',    type: 'refuerzo' },
  { id: 'deisy',     type: 'servicios' },
]

const REGULARES = EQUIPO.filter((e) => e.type === 'regular').map((e) => e.id)
// Quiénes ocupan un puesto de sede: los regulares + el refuerzo (Andrés).
const EN_ROTACION = [...REGULARES, 'andres']
const VECES = 40

/** Corre el generador varias veces y ejecuta la comprobación en cada semana. */
const porCadaSemana = (fn) => {
  for (let i = 0; i < VECES; i++) fn(generarRotacion(EQUIPO), i)
}

// Cuenta todos los cuerpos en una sede (regulares + refuerzo), que es lo que
// realmente define el cupo — Andrés ocupa uno de los 2 de Teresita sus días.
const enSede = (schedule, dia, sede) =>
  EN_ROTACION.filter((id) => schedule[id]?.[dia] === sede)

const esDiaDeAndres = (schedule, dia) => schedule.andres?.[dia] === SANTA_TERESITA

test('siempre cuadra: 2 en Santa Teresita y el resto en Santa Lucía', () => {
  porCadaSemana(({ schedule, avisos }) => {
    assert.deepEqual(avisos, [])
    DIAS.forEach((dia) => {
      assert.equal(enSede(schedule, dia, SANTA_TERESITA).length, CUPO_TERESITA, `Teresita el ${dia}`)
      // Entre semana siempre trabajan 5 (2 Teresita + 3 Lucía); el finde 6 (2+4).
      const esperados = esFinde(dia) ? 4 : 3
      assert.equal(enSede(schedule, dia, SANTA_LUCIA).length, esperados, `Lucía el ${dia}`)
    })
  })
})

test('los descansos son solo de lunes a jueves; 1 por día, 2 si entra Andrés', () => {
  porCadaSemana(({ schedule }) => {
    DIAS.forEach((dia) => {
      const descansan = REGULARES.filter((id) => schedule[id][dia] === DESCANSO)
      const esperados = esFinde(dia) ? 0 : (esDiaDeAndres(schedule, dia) ? 2 : 1)
      assert.equal(descansan.length, esperados, `descansos el ${dia}`)
    })
  })
})

test('nadie descansa dos veces en la misma semana', () => {
  porCadaSemana(({ schedule }) => {
    REGULARES.forEach((id) => {
      const dias = DIAS.filter((d) => schedule[id][d] === DESCANSO)
      assert.ok(dias.length <= 1, `${id} descansó ${dias.length} veces`)
    })
  })
})

test('Sara descansa el miércoles, siempre', () => {
  porCadaSemana(({ schedule }) => {
    assert.equal(schedule.sara.mie, DESCANSO)
  })
})

test('Valentina nunca va a Santa Teresita', () => {
  porCadaSemana(({ schedule }) => {
    DIAS.forEach((dia) => assert.notEqual(schedule.valentina[dia], SANTA_TERESITA))
  })
})

test('el fin de semana: Valentina en Santa Lucía y José Luis en Santa Teresita', () => {
  porCadaSemana(({ schedule }) => {
    DIAS.filter(esFinde).forEach((dia) => {
      assert.equal(schedule.valentina[dia], SANTA_LUCIA, `Valentina el ${dia}`)
      assert.equal(schedule.joseluis[dia], SANTA_TERESITA, `José Luis el ${dia}`)
    })
  })
})

test('Santa Teresita siempre tiene a José Luis o a Gendelson', () => {
  porCadaSemana(({ schedule }) => {
    DIAS.forEach((dia) => {
      const equipo = enSede(schedule, dia, SANTA_TERESITA)
      assert.ok(
        equipo.some((id) => REGLAS.anclasTeresita.includes(id)),
        `${dia}: Teresita quedó con ${equipo.join(' y ')}`,
      )
    })
  })
})

test('cada sede tiene un cajero presente todos los días', () => {
  porCadaSemana(({ schedule, caja }) => {
    DIAS.forEach((dia) => {
      ;[SANTA_LUCIA, SANTA_TERESITA].forEach((sede) => {
        const cajero = caja[dia][sede]
        assert.ok(cajero, `${dia}: ${sede} sin cajero`)
        const puedeCaja = [...REGLAS.cajeros, ...REGLAS.cajerosRefuerzo].includes(cajero)
        assert.ok(puedeCaja, `${cajero} no puede hacer caja`)
        assert.equal(schedule[cajero][dia], sede, `${cajero} no estaba en ${sede} el ${dia}`)
      })
    })
  })
})

test('si Sara y Valentina coinciden en Santa Lucía, la caja la hace Sara', () => {
  let vecesQueCoinciden = 0
  porCadaSemana(({ schedule, caja }) => {
    DIAS.forEach((dia) => {
      if (schedule.sara[dia] === SANTA_LUCIA && schedule.valentina[dia] === SANTA_LUCIA) {
        vecesQueCoinciden++
        assert.equal(caja[dia][SANTA_LUCIA], 'sara', `${dia}: la caja de Lucía no quedó en Sara`)
      }
    })
  })
  assert.ok(vecesQueCoinciden > 0, 'nunca coincidieron: la prueba no comprobó nada')
})

test('Deisy: mañana de lunes a jueves y el finde en blanco', () => {
  porCadaSemana(({ schedule }) => {
    DIAS_CON_DESCANSO.forEach((dia) => assert.equal(schedule.deisy[dia], 'trabajo', `Deisy el ${dia}`))
    DIAS.filter(esFinde).forEach((dia) => assert.equal(schedule.deisy[dia], '', `Deisy el ${dia}`))
  })
})

test('con el refuerzo de Andrés, los 6 regulares descansan una vez', () => {
  porCadaSemana(({ schedule }) => {
    const sinDescanso = REGULARES.filter((id) => !DIAS.some((d) => schedule[id][d] === DESCANSO))
    assert.deepEqual(sinDescanso, [])
  })
})

test('Andrés entra exactamente 2 días, siempre a Santa Teresita entre semana', () => {
  porCadaSemana(({ schedule }) => {
    const diasAndres = DIAS.filter((d) => schedule.andres[d] === SANTA_TERESITA)
    assert.equal(diasAndres.length, 2, 'no fueron 2 días')
    diasAndres.forEach((d) => assert.ok(DIAS_CON_DESCANSO.includes(d), `entró en finde: ${d}`))
    // Los demás días queda en blanco: no descansa, no rota.
    DIAS.forEach((d) => {
      if (schedule.andres[d] !== SANTA_TERESITA) assert.equal(schedule.andres[d], '', `Andrés el ${d}`)
    })
  })
})

test('el sorteo reparte: a la larga a todos les toca descansar alguna vez', () => {
  const descansos = new Set()
  for (let i = 0; i < 60; i++) {
    const { schedule } = generarRotacion(EQUIPO)
    REGULARES.forEach((id) => {
      if (DIAS.some((d) => schedule[id][d] === DESCANSO)) descansos.add(id)
    })
  }
  // Valentina y José Luis también entran en el sorteo de lunes a jueves.
  assert.deepEqual([...descansos].sort(), [...REGULARES].sort())
})

test('las reglas del admin no se desincronizan de estas', async () => {
  // El admin es un build Vite aparte y lleva su propia copia (lib/turnos.ts).
  // Esta prueba compara el bloque REGLAS de los dos archivos, ignorando los
  // tipos de TypeScript, para que una regla no cambie solo en un lado.
  const { readFile } = await import('node:fs/promises')
  const bloqueReglas = (texto) => {
    const m = texto.match(/export const REGLAS = \{([\s\S]*?)\n\}/)
    assert.ok(m, 'no se encontró el bloque REGLAS')
    return m[1]
      .replace(/ as Record<[^>]+>/g, '')   // anotaciones solo del .ts
      .replace(/ as Refuerzo\[\]/g, '')    // ídem
      .replace(/\/\/[^\n]*/g, '')          // comentarios: no son parte del contrato
      .replace(/\s+/g, ' ')
      .trim()
  }
  const [js, ts] = await Promise.all([
    readFile(new URL('../src/utils/turnos.js', import.meta.url), 'utf8'),
    readFile(new URL('../delistars-menu-magic/admin/src/lib/turnos.ts', import.meta.url), 'utf8'),
  ])
  assert.equal(bloqueReglas(ts), bloqueReglas(js))
})

test('si alguien sale del equipo el cuadro sigue saliendo', () => {
  const equipoCorto = EQUIPO.filter((e) => e.id !== 'melissa' && e.id !== 'shirly')
  const { schedule, avisos } = generarRotacion(equipoCorto)
  assert.deepEqual(avisos, [])
  DIAS.forEach((dia) => {
    const teresita = ['joseluis', 'sara', 'valentina', 'gendelson', 'andres']
      .filter((id) => schedule[id][dia] === SANTA_TERESITA)
    assert.equal(teresita.length, CUPO_TERESITA, `Teresita el ${dia}`)
    assert.ok(teresita.some((id) => REGLAS.anclasTeresita.includes(id)))
  })
})

// ─── Rotación a mitad de semana ──────────────────────────────────────────────
// El admin rota un miércoles: lunes y martes quedan como se publicaron y lo
// que se sortea de miércoles en adelante tiene en cuenta lo que ya pasó.

const PUBLICADO_EJEMPLO = () => generarRotacion(EQUIPO)
const FIJOS_MIE = ['lun', 'mar']
const NUEVOS_MIE = ['mie', 'jue', 'vie', 'sab', 'dom']

const porCadaRotacionDelMiercoles = (fn) => {
  for (let i = 0; i < VECES; i++) {
    const publicado = PUBLICADO_EJEMPLO()
    fn(generarRotacion(EQUIPO, Math.random, { desde: 'mie', publicado }), publicado)
  }
}

test('a mitad de semana: lunes y martes quedan exactamente como se publicaron', () => {
  porCadaRotacionDelMiercoles(({ schedule, caja }, publicado) => {
    Object.keys(publicado.schedule).forEach((id) => {
      FIJOS_MIE.forEach((d) => assert.equal(schedule[id][d], publicado.schedule[id][d], `${id} el ${d}`))
    })
    FIJOS_MIE.forEach((d) => assert.deepEqual(caja[d], publicado.caja[d], `caja del ${d}`))
  })
})

test('a mitad de semana: quien ya descansó no vuelve a descansar y los demás sí descansan', () => {
  porCadaRotacionDelMiercoles(({ schedule, avisos }, publicado) => {
    assert.deepEqual(avisos, [])
    REGULARES.forEach((id) => {
      const yaDescanso = FIJOS_MIE.some((d) => publicado.schedule[id][d] === DESCANSO)
      const descansaDespues = NUEVOS_MIE.filter((d) => schedule[id][d] === DESCANSO)
      if (yaDescanso) assert.deepEqual(descansaDespues, [], `${id} descansó dos veces`)
      else assert.equal(descansaDespues.length, 1, `${id} se quedó sin descanso`)
    })
  })
})

test('a mitad de semana: a Andrés se le descuentan los días que ya entró', () => {
  porCadaRotacionDelMiercoles(({ schedule }) => {
    const diasAndres = DIAS.filter((d) => schedule.andres[d] === SANTA_TERESITA)
    assert.equal(diasAndres.length, 2, `Andrés entró ${diasAndres.join(', ')}`)
  })
})

test('a mitad de semana: se siguen cumpliendo las reglas de sede y caja', () => {
  porCadaRotacionDelMiercoles(({ schedule, caja }) => {
    NUEVOS_MIE.forEach((dia) => {
      const teresita = enSede(schedule, dia, SANTA_TERESITA)
      assert.equal(teresita.length, CUPO_TERESITA, `Teresita el ${dia}`)
      assert.ok(teresita.some((id) => REGLAS.anclasTeresita.includes(id)), `ancla el ${dia}`)
      ;[SANTA_LUCIA, SANTA_TERESITA].forEach((sede) => {
        assert.equal(schedule[caja[dia][sede]][dia], sede, `${dia}: caja de ${sede}`)
      })
    })
  })
})

test('a mitad de semana: quien ya no está en el equipo conserva sus días pasados', () => {
  const publicado = PUBLICADO_EJEMPLO()
  publicado.schedule.josemanuel = { lun: SANTA_LUCIA, mar: SANTA_LUCIA, mie: SANTA_LUCIA }
  const { schedule } = generarRotacion(EQUIPO, Math.random, { desde: 'mie', publicado })
  assert.deepEqual(schedule.josemanuel, { lun: SANTA_LUCIA, mar: SANTA_LUCIA })
})

test('si no quedan cupos, los que faltan quedan sin descanso y se avisa con nombres', () => {
  const equipo = EQUIPO.map((e) => ({ ...e, short: e.id[0].toUpperCase() + e.id.slice(1) }))
  // Lunes descansó Shirly; martes y miércoles nadie (lo cambiaron a mano). Se rota el jueves.
  const publicado = { schedule: {}, caja: {} }
  REGULARES.forEach((id) => {
    publicado.schedule[id] = { lun: SANTA_LUCIA, mar: SANTA_LUCIA, mie: SANTA_LUCIA }
  })
  publicado.schedule.shirly.lun = DESCANSO
  publicado.schedule.andres = { lun: '', mar: '', mie: '' }
  for (let i = 0; i < VECES; i++) {
    const { schedule, avisos } = generarRotacion(equipo, Math.random, { desde: 'jue', publicado })
    // Jueves: 1 cupo + 1 de Andrés (le quedan sus 2 días pero solo cabe uno).
    const descansanJueves = REGULARES.filter((id) => schedule[id].jue === DESCANSO)
    assert.equal(descansanJueves.length, 2)
    assert.equal(schedule.andres.jue, SANTA_TERESITA)
    assert.ok(!descansanJueves.includes('shirly') && !descansanJueves.includes('sara'))
    // Sara solo descansa miércoles, y ese día ya pasó.
    assert.ok(avisos.some((a) => a.startsWith('Sara descansa siempre el miércoles')), avisos.join(' | '))
    const sinCupo = avisos.find((a) => a.startsWith('No quedan cupos'))
    assert.ok(sinCupo, avisos.join(' | '))
    const faltan = REGULARES.filter((id) => !['shirly', 'sara'].includes(id) && !descansanJueves.includes(id))
    faltan.forEach((id) => assert.ok(sinCupo.includes(equipo.find((e) => e.id === id).short), sinCupo))
  }
})

test('si no hay nada publicado de los días anteriores, se avisa', () => {
  const { avisos, schedule } = generarRotacion(EQUIPO, Math.random, { desde: 'mie', publicado: { schedule: {}, caja: {} } })
  assert.ok(avisos.some((a) => a.includes('de lunes a martes')), avisos.join(' | '))
  assert.equal(schedule.joseluis.lun, undefined)
})

test('rotar un sábado solo rehace el finde, sin descansos', () => {
  for (let i = 0; i < VECES; i++) {
    const publicado = PUBLICADO_EJEMPLO()
    const { schedule, avisos } = generarRotacion(EQUIPO, Math.random, { desde: 'sab', publicado })
    assert.deepEqual(avisos, [])
    ;['sab', 'dom'].forEach((dia) => {
      REGULARES.forEach((id) => assert.notEqual(schedule[id][dia], DESCANSO))
      assert.equal(schedule.valentina[dia], SANTA_LUCIA)
      assert.equal(schedule.joseluis[dia], SANTA_TERESITA)
    })
    ;['lun', 'mar', 'mie', 'jue', 'vie'].forEach((dia) => {
      REGULARES.forEach((id) => assert.equal(schedule[id][dia], publicado.schedule[id][dia]))
    })
  }
})

// ─── Sara: miércoles fijo hasta el 25 de noviembre de 2026 ──────────────────

test('Sara descansa el miércoles hasta la semana del 25 de noviembre', () => {
  ;['2026-10-05', '2026-11-16', '2026-11-23'].forEach((semana) => {
    assert.deepEqual(descansosFijos(semana), { sara: 'mie' }, semana)
    for (let i = 0; i < 10; i++) {
      assert.equal(generarRotacion(EQUIPO, Math.random, { semana }).schedule.sara.mie, DESCANSO)
    }
  })
})

test('desde la semana siguiente al 25 de noviembre y hasta diciembre, Sara rota', () => {
  ;['2026-11-30', '2026-12-28'].forEach((semana) => {
    assert.deepEqual(descansosFijos(semana), {}, semana)
    const diasDeSara = new Set()
    for (let i = 0; i < 80; i++) {
      const { schedule, avisos } = generarRotacion(EQUIPO, Math.random, { semana })
      assert.deepEqual(avisos, [])
      const dias = DIAS.filter((d) => schedule.sara[d] === DESCANSO)
      assert.equal(dias.length, 1)
      diasDeSara.add(dias[0])
    }
    assert.ok(diasDeSara.size > 1, `${semana}: Sara siempre descansó ${[...diasDeSara]}`)
  })
  // En enero de 2027 vuelve el miércoles fijo.
  assert.deepEqual(descansosFijos('2027-01-04'), { sara: 'mie' })
})

// ─── Historial ───────────────────────────────────────────────────────────────

test('historial: etiquetas y rango de semanas', () => {
  assert.equal(etiquetaSemana('2026-10-05'), '5 al 11 de oct de 2026')
  assert.equal(etiquetaSemana('2026-09-28'), '28 de sep al 4 de oct de 2026')
  assert.equal(etiquetaSemana('2026-12-28'), '28 de dic de 2026 al 3 de ene de 2027')
  assert.deepEqual(semanasEntre('2026-09-21', '2026-10-05'), ['2026-09-21', '2026-09-28', '2026-10-05'])
  assert.deepEqual(semanasEntre('2026-10-05', '2026-09-21'), [])
  assert.equal(lunesDe(new Date(2026, 9, 7)), '2026-10-05')
  assert.equal(lunesDe(new Date(2026, 9, 11)), '2026-10-05')
  assert.equal(lunesDe(new Date(2026, 9, 12)), '2026-10-12')
  assert.equal(lunesDeRegistro('2026-W41', {}), '2026-10-05')
  assert.equal(lunesDeRegistro('2026-W01', {}), '2025-12-29')
  assert.equal(lunesDeRegistro('cualquiera', { weekStart: '2026-10-05' }), '2026-10-05')
  assert.equal(diaDeHoy(new Date(2026, 9, 7)), 'mie')
})

test('historial: filas con el equipo guardado, y con el directorio en semanas viejas', () => {
  const directorio = [
    { id: 'sara', short: 'Sara', type: 'regular' },
    { id: 'josemanuel', short: 'Jose Manuel', type: 'regular' },
    { id: 'sara', short: 'Repetida', type: 'regular' }, // repetidos: manda el primero
  ]
  const schedule = { josemanuel: { lun: SANTA_LUCIA }, sara: { lun: DESCANSO }, raro: { lun: SANTA_TERESITA } }
  const caja = { lun: { [SANTA_LUCIA]: 'josemanuel' } }

  const viejas = filasSemana({ schedule, caja }, directorio)
  assert.deepEqual(viejas.map((f) => f.short), ['Sara', 'Jose Manuel', 'raro'])
  assert.equal(viejas[1].dias.lun.etiqueta, 'Santa Lucía')
  assert.equal(viejas[1].dias.lun.caja, true)
  assert.equal(viejas[0].dias.lun.caja, false)
  assert.equal(viejas[0].dias.mar.etiqueta, '—')

  const equipo = [{ id: 'josemanuel', short: 'José M.', type: 'regular' }, { id: 'sara', short: 'Sara', type: 'regular' }]
  const nuevas = filasSemana({ schedule, caja, equipo }, directorio)
  assert.deepEqual(nuevas.map((f) => f.short), ['José M.', 'Sara', 'raro'])
})

test('al publicar se guarda el equipo, incluso quien ya salió pero trabajó esa semana', () => {
  const schedule = { sara: { lun: DESCANSO }, josemanuel: { lun: SANTA_LUCIA } }
  const empleados = [
    { id: 'sara', short: 'Sara', name: 'Sara Castaño Monsalve', type: 'regular' },
    { id: 'shirly', short: 'Shirly', name: 'Shirly Elena Rico Daza', type: 'regular' },
  ]
  const conocidos = [{ id: 'josemanuel', short: 'Jose Manuel', name: 'Jose Manuel Londoño Rivillas', type: 'regular' }]
  assert.deepEqual(equipoDelCuadro(schedule, empleados, conocidos), [
    { id: 'sara', short: 'Sara', name: 'Sara Castaño Monsalve', type: 'regular' },
    { id: 'josemanuel', short: 'Jose Manuel', name: 'Jose Manuel Londoño Rivillas', type: 'regular' },
  ])
})
