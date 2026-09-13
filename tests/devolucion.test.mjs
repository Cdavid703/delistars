// Pruebas de devoluciones y saldo a favor.
// Corre con: npm test  (node --test, sin dependencias)
import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  montoDevolucion, devolucionInicial, puedeElegirSaldo, erroresDatosDevolucion,
  saldoDisponible, aplicarSaldo,
} from '../src/utils/devolucion.js'

const pagado = { payment: 'Transferencia', totalPrice: 41000, transferReceiptUrl: 'x', sedeId: 'santa_lucia' }

test('transferencia con comprobante: se devuelve el total', () => {
  assert.equal(montoDevolucion(pagado), 41000)
})

test('mixto: solo se devuelve la parte transferida', () => {
  assert.equal(montoDevolucion({ ...pagado, payment: 'Mixto', mixtoTransferencia: '21000' }), 21000)
})

test('efectivo o sin comprobante: no hay nada que devolver', () => {
  assert.equal(montoDevolucion({ ...pagado, payment: 'Efectivo' }), 0)
  assert.equal(montoDevolucion({ ...pagado, transferReceiptUrl: null }), 0)
  assert.equal(devolucionInicial({ ...pagado, payment: 'Efectivo' }), null)
})

test('la devolución arranca esperando que el cliente elija', () => {
  assert.deepEqual(devolucionInicial(pagado), { estado: 'por_elegir', monto: 41000, sedeId: 'santa_lucia' })
})

test('saldo a favor solo para clientes con cuenta de Google', () => {
  assert.equal(puedeElegirSaldo({ clientEmail: 'a@b.com' }), true)
  assert.equal(puedeElegirSaldo({ clientEmail: null }), false)
})

test('datos de la transferencia de vuelta completos', () => {
  assert.deepEqual(erroresDatosDevolucion({ medio: 'Nequi', numero: '300 123 4567', titular: 'Ana' }), [])
  assert.equal(erroresDatosDevolucion({ medio: '', numero: '', titular: '' }).length, 3)
})

test('el saldo solo cuenta en su sede y si está disponible', () => {
  const c = [
    { estado: 'disponible', sedeId: 'santa_lucia', monto: 20000 },
    { estado: 'disponible', sedeId: 'santa_teresita', monto: 5000 },
    { estado: 'usado', sedeId: 'santa_lucia', monto: 9000 },
  ]
  assert.equal(saldoDisponible(c, 'santa_lucia'), 20000)
  assert.equal(saldoDisponible(c, 'santa_teresita'), 5000)
})

test('aplicar saldo menor al total: paga la diferencia', () => {
  assert.deepEqual(aplicarSaldo(41000, 20000), { usado: 20000, aPagar: 21000, sobrante: 0 })
})

test('aplicar saldo mayor al total: no paga y le sobra saldo', () => {
  assert.deepEqual(aplicarSaldo(30000, 41000), { usado: 30000, aPagar: 0, sobrante: 11000 })
})
