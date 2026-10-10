import { test } from 'node:test'
import assert from 'node:assert/strict'
import { debeOfrecerPromos } from '../src/utils/promociones.js'

const AHORA = Date.parse('2026-10-09T20:00:00Z')
const hace = dias => ({ toMillis: () => AHORA - dias * 86400000 })

test('a quien nunca respondió se le ofrece', () => {
  assert.equal(debeOfrecerPromos(undefined, AHORA), true)
  assert.equal(debeOfrecerPromos(null, AHORA), true)
})

test('a quien ya aceptó no se le vuelve a preguntar', () => {
  assert.equal(debeOfrecerPromos({ acepta: true, fecha: hace(400) }, AHORA), false)
})

test('a quien dijo que no se le respeta 90 días', () => {
  assert.equal(debeOfrecerPromos({ acepta: false, fecha: hace(10) }, AHORA), false)
  assert.equal(debeOfrecerPromos({ acepta: false, fecha: hace(91) }, AHORA), true)
})

test('si acaba de decir que no (fecha del servidor aún pendiente), no se insiste', () => {
  assert.equal(debeOfrecerPromos({ acepta: false, fecha: null }, AHORA), false)
})
