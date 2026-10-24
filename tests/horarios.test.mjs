import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { estadoSede, textoEstado, algunaAbierta, HORARIO_POR_DEFECTO, enColombia } from '../src/utils/horarios.js'

const t = (s) => Date.parse(s)
const turno = (desde, hasta) => [{ desde, hasta }]
const semana = (f) => Object.fromEntries(['dom', 'lun', 'mar', 'mie', 'jue', 'vie', 'sab'].map((d) => [d, f(d)]))

test('horario por defecto: abierta de 5:00 a 11:00 p. m. hora de Colombia', () => {
  assert.equal(estadoSede(null, t('2026-10-18T16:59:00-05:00')).abierta, false)
  const e = estadoSede(null, t('2026-10-18T17:00:00-05:00'))
  assert.equal(e.abierta, true)
  assert.equal(textoEstado(e), 'Abierta hasta las 11:00 p. m.')
  assert.equal(estadoSede(null, t('2026-10-18T22:59:00-05:00')).abierta, true)
  assert.equal(estadoSede(null, t('2026-10-18T23:00:00-05:00')).abierta, false)
})

test('cerrada: dice cuándo abre (hoy, mañana o el día)', () => {
  const ahora = t('2026-10-18T10:00:00-05:00')
  assert.equal(textoEstado(estadoSede(null, ahora), ahora), 'Cerrada · abre hoy a las 5:00 p. m.')
  const noche = t('2026-10-18T23:45:00-05:00')
  assert.equal(textoEstado(estadoSede(null, noche), noche), 'Cerrada · abre mañana a las 5:00 p. m.')
  const soloSabado = { ...HORARIO_POR_DEFECTO, semana: semana((d) => (d === 'sab' ? turno('12:00', '22:00') : [])) }
  const domingo = t('2026-10-18T12:00:00-05:00') // 18 oct 2026 es domingo
  assert.equal(textoEstado(estadoSede(soloSabado, domingo), domingo), 'Cerrada · abre el sábado a las 12:00 p. m.')
})

test('turno que cruza la medianoche cuenta en el día en que empieza', () => {
  const h = { ...HORARIO_POR_DEFECTO, semana: semana(() => turno('18:00', '01:00')) }
  assert.equal(estadoSede(h, t('2026-10-19T00:30:00-05:00')).abierta, true)
  assert.equal(estadoSede(h, t('2026-10-19T01:00:00-05:00')).abierta, false)
})

test('varios turnos el mismo día', () => {
  const h = { ...HORARIO_POR_DEFECTO, semana: semana(() => [{ desde: '11:00', hasta: '14:00' }, { desde: '17:30', hasta: '23:30' }]) }
  assert.equal(estadoSede(h, t('2026-10-18T12:00:00-05:00')).abierta, true)
  assert.equal(estadoSede(h, t('2026-10-18T15:00:00-05:00')).abierta, false)
  assert.equal(estadoSede(h, t('2026-10-18T18:00:00-05:00')).abierta, true)
})

test('excepción por fecha: cerrado el 24 de diciembre o con otro horario', () => {
  const h = { ...HORARIO_POR_DEFECTO, excepciones: { '2026-12-24': [], '2026-12-31': turno('12:00', '18:00') } }
  const e = estadoSede(h, t('2026-12-24T19:00:00-05:00'))
  assert.equal(e.abierta, false)
  assert.equal(e.motivo, 'excepcion')
  assert.equal(estadoSede(h, t('2026-12-31T13:00:00-05:00')).abierta, true)
  assert.equal(estadoSede(h, t('2026-12-31T19:00:00-05:00')).abierta, false)
})

test('modo manual con duración manda sobre el horario y vence solo', () => {
  const h = { ...HORARIO_POR_DEFECTO, manual: { modo: 'cerrada', hasta: '2026-10-18T20:00:00-05:00' } }
  const e = estadoSede(h, t('2026-10-18T19:00:00-05:00'))
  assert.equal(e.abierta, false)
  assert.equal(e.motivo, 'manual')
  // Al vencer vuelve el horario (no abre a ciegas: a las 20:00 el horario dice abierta).
  assert.equal(estadoSede(h, t('2026-10-18T20:01:00-05:00')).abierta, true)
  const indefinido = { ...HORARIO_POR_DEFECTO, manual: { modo: 'cerrada', hasta: null } }
  assert.equal(textoEstado(estadoSede(indefinido, t('2026-10-18T19:00:00-05:00'))), 'Cerrada por ahora')
  const abierta = { ...HORARIO_POR_DEFECTO, manual: { modo: 'abierta', hasta: null } }
  assert.equal(estadoSede(abierta, t('2026-10-18T10:00:00-05:00')).abierta, true)
})

test('la hora es la de Colombia aunque el servidor esté en UTC', () => {
  assert.deepEqual(enColombia(t('2026-10-19T03:00:00Z')), { fecha: '2026-10-18', dia: 'dom', minuto: 22 * 60 })
})

test('algunaAbierta: bandera vieja para apps sin actualizar', () => {
  const cerrada = { ...HORARIO_POR_DEFECTO, manual: { modo: 'cerrada', hasta: null } }
  assert.equal(algunaAbierta({ santa_lucia: cerrada, santa_teresita: cerrada }, t('2026-10-18T19:00:00-05:00')), false)
  assert.equal(algunaAbierta({ santa_lucia: cerrada }, t('2026-10-18T19:00:00-05:00')), true) // Teresita sin dato: horario por defecto
})

test('las copias en menú, panel y scheduler son idénticas a la original', () => {
  const original = readFileSync(new URL('../src/utils/horarios.js', import.meta.url), 'utf8')
  for (const copia of ['../delistars-menu-magic/front/src/lib/horarios.js', '../delistars-menu-magic/admin/src/lib/horarios.js', '../delistars-menu-magic/scheduler/horarios.mjs']) {
    assert.equal(readFileSync(new URL(copia, import.meta.url), 'utf8'), original, `${copia} quedó distinta`)
  }
})

test('sede con solo modo manual (sin semana guardada) vuelve al horario por defecto', () => {
  const h = { manual: { modo: 'cerrada', hasta: '2026-10-18T19:00:00-05:00', por: 'caja@x.com' } }
  assert.equal(estadoSede(h, t('2026-10-18T18:00:00-05:00')).abierta, false)
  assert.equal(estadoSede(h, t('2026-10-18T19:30:00-05:00')).abierta, true)
})

test('cerrada a mano por hoy: dice la hora real de apertura, no la medianoche', () => {
  const turno = [{ desde: '17:00', hasta: '23:00' }]
  const h = { semana: semana(() => turno), excepciones: {}, manual: { modo: 'cerrada', hasta: '2026-10-20T05:00:00.000Z' } }
  const ahora = t('2026-10-19T18:30:00-05:00')
  const e = estadoSede(h, ahora)
  assert.equal(e.abierta, false)
  assert.equal(textoEstado(e, ahora), 'Cerrada · abre mañana a las 5:00 p. m.')
  // Cierre corto en pleno turno: abre justo cuando vence.
  const corto = { ...h, manual: { modo: 'cerrada', hasta: '2026-10-19T19:00:00-05:00' } }
  assert.equal(textoEstado(estadoSede(corto, ahora), ahora), 'Cerrada · abre hoy a las 7:00 p. m.')
})
