// Pruebas de la matemática de pagos usada por el cuadre de caja.
// Un error aquí descuadra el efectivo del día — por eso se prueba aparte.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { cashAmount } from '../src/utils/payments.js'

test('Efectivo: el efectivo cobrado es el total', () => {
  assert.equal(cashAmount({ payment: 'Efectivo', totalPrice: 46800 }), 46800)
})

test('Mixto con desglose: solo la porción en efectivo cuenta', () => {
  assert.equal(
    cashAmount({ payment: 'Mixto', totalPrice: 50000, mixtoEfectivo: 20000, mixtoTransferencia: 30000 }),
    20000,
  )
})

test('Mixto con desglose en texto (viene de un input): se convierte a número', () => {
  assert.equal(cashAmount({ payment: 'Mixto', totalPrice: 50000, mixtoEfectivo: '20000' }), 20000)
})

test('Mixto SIN desglose: respaldo conservador al total (mejor sobrestimar el cuadre)', () => {
  assert.equal(cashAmount({ payment: 'Mixto', totalPrice: 50000 }), 50000)
  assert.equal(cashAmount({ payment: 'Mixto', totalPrice: 50000, mixtoEfectivo: '' }), 50000)
})

test('desglose ilegible no revienta: cae a 0, no a NaN', () => {
  assert.equal(cashAmount({ payment: 'Mixto', totalPrice: 50000, mixtoEfectivo: 'abc' }), 0)
})

test('pedido sin total: 0, nunca undefined/NaN', () => {
  assert.equal(cashAmount({ payment: 'Efectivo' }), 0)
})
