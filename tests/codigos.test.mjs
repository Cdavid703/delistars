import { test } from 'node:test'
import assert from 'node:assert/strict'
import { validarCodigo } from '../src/utils/codigos.js'

const AHORA = Date.parse('2026-10-16T20:00:00-05:00')
const conCombo = '1x Combo Quincena (= $52.900)\n   ↳ Hamburguesa 1 · Sin salsas · Bebida: Coca Cola Zero Pet 400 ml'

test('STAR con Combo Quincena o Parche, con cuenta y sin haberlo usado: vale', () => {
  assert.deepEqual(validarCodigo(' star ', { items: conCombo, tieneCuenta: true, ahora: AHORA }), { ok: true, codigo: 'STAR' })
  assert.equal(validarCodigo('STAR', { items: '1x Combo Parche', tieneCuenta: true, ahora: AHORA }).ok, true)
})

test('una sola vez por cuenta', () => {
  assert.match(validarCodigo('STAR', { items: conCombo, tieneCuenta: true, yaLoUso: true, ahora: AHORA }).motivo, /una sola vez/)
})

test('como invitado no se puede (no hay cuenta para controlar el uso)', () => {
  assert.match(validarCodigo('STAR', { items: conCombo, tieneCuenta: false, ahora: AHORA }).motivo, /Inicia sesión/)
})

test('sin los combos de la campaña no aplica', () => {
  assert.match(validarCodigo('STAR', { items: '1x Combo Hamburguesa Especial', tieneCuenta: true, ahora: AHORA }).motivo, /Combo Quincena o el Combo Parche/)
})

test('vence después del 25 de octubre (hora de Colombia)', () => {
  assert.equal(validarCodigo('STAR', { items: conCombo, tieneCuenta: true, ahora: Date.parse('2026-10-25T23:00:00-05:00') }).ok, true)
  assert.match(validarCodigo('STAR', { items: conCombo, tieneCuenta: true, ahora: Date.parse('2026-10-26T00:00:00-05:00') }).motivo, /venció/)
})

test('un código inventado no existe', () => {
  assert.match(validarCodigo('GRATIS', { items: conCombo, tieneCuenta: true, ahora: AHORA }).motivo, /no existe/)
})
