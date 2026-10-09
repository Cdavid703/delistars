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

// ─── Cambio al corregir el total ─────────────────────────────────────────────
import { cambioParaTotal } from '../src/utils/payments.js'

test('si la caja sube el domicilio, el cambio del cliente se recalcula', () => {
  // Pedido 001 de Santa Teresita: total 51.000 → 53.000, paga con 100.000.
  const order = { payment: 'Efectivo', totalPrice: 51000, cashBillAmount: 100000, cashChange: 49000 }
  assert.deepEqual(cambioParaTotal(order, 53000), { cashChange: 47000 })
})

test('también se recalcula el cambio que registró la caja al asignar', () => {
  const order = { payment: 'Efectivo', totalPrice: 51000, payExact: false, payAmount: 60000, change: 9000 }
  assert.deepEqual(cambioParaTotal(order, 53000), { change: 7000 })
})

test('si el billete ya no alcanza, se borra en vez de dejar un cambio negativo', () => {
  const order = { payment: 'Efectivo', totalPrice: 49000, cashBillAmount: 50000, cashChange: 1000 }
  assert.deepEqual(cambioParaTotal(order, 53000), { cashBillAmount: null, cashChange: null })
})

test('en Mixto el cambio es sobre la parte en efectivo, que no cambia con el total', () => {
  const order = { payment: 'Mixto', totalPrice: 50000, mixtoEfectivo: 20000, cashBillAmount: 50000, cashChange: 30000 }
  assert.deepEqual(cambioParaTotal(order, 52000), { cashChange: 30000 })
})

test('si paga exacto o por transferencia no hay cambio que tocar', () => {
  assert.deepEqual(cambioParaTotal({ payment: 'Transferencia', totalPrice: 51000 }, 53000), {})
  assert.deepEqual(cambioParaTotal({ payment: 'Efectivo', totalPrice: 51000, payExact: true, payAmount: null }, 53000), {})
})
