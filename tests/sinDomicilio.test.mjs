// Días sin domicilios (lunes: pico y placa del domiciliario).
// Corre con: npm test  (node --test, sin dependencias)
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { sinDomicilioHoy } from '../src/utils/sinDomicilio.js'

test('los lunes en Colombia no hay domicilios', () => {
  const lunes = Date.parse('2026-10-26T18:00:00-05:00')
  const r = sinDomicilioHoy(lunes)
  assert.equal(r.dia, 'lun')
  assert.match(r.texto, /Hoy lunes no hay domicilios: nuestro domiciliario tiene pico y placa/)
})

test('cuenta la hora de Colombia, no la del aparato', () => {
  // Domingo 11:30 p. m. en Colombia (ya lunes en UTC): sí hay domicilios.
  assert.equal(sinDomicilioHoy(Date.parse('2026-10-25T23:30:00-05:00')), null)
  // Lunes 11:59 p. m.: todavía no hay; martes 12:01 a. m.: ya hay.
  assert.ok(sinDomicilioHoy(Date.parse('2026-10-26T23:59:00-05:00')))
  assert.equal(sinDomicilioHoy(Date.parse('2026-10-27T00:01:00-05:00')), null)
})

test('la copia del menú es igual', () => {
  assert.equal(
    readFileSync(new URL('../delistars-menu-magic/front/src/lib/sinDomicilio.js', import.meta.url), 'utf8'),
    readFileSync(new URL('../src/utils/sinDomicilio.js', import.meta.url), 'utf8'),
  )
})
