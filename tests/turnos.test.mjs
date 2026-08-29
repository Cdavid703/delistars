// Pruebas de las reglas del cuadro de turnos. El generador sortea, así que
// cada prueba corre muchas semanas seguidas: una regla que se rompe una vez
// cada veinte sorteos igual llega al cuadro publicado.
// Corre con: npm test  (node --test, sin dependencias)
import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  generarRotacion, DIAS, DIAS_CON_DESCANSO, CUPO_TERESITA, esFinde,
  SANTA_LUCIA, SANTA_TERESITA, DESCANSO, REGLAS,
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
