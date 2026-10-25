// Pruebas de los cuadres de efectivo (§13). Corre con: npm test (node --test)
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { efectivoCobrado, cuentasDelTurno, diferenciaDe, textoDiferencia, montoValido, montoEfectivo, PENDIENTES } from '../src/utils/cuadres.js'

const pedido = (extra) => ({ status: 'pending_cuadre', payment: 'Efectivo', totalPrice: 21000, ...extra })

test('el efectivo cobrado es solo la parte en efectivo', () => {
  assert.equal(efectivoCobrado(pedido()), 21000)
  assert.equal(efectivoCobrado(pedido({ payment: 'Mixto', mixtoEfectivo: '9000' })), 9000)
  assert.equal(efectivoCobrado(pedido({ payment: 'Mixto' })), 21000) // sin desglose: todo, por si acaso
  assert.equal(efectivoCobrado(pedido({ payment: 'Nequi' })), 0)
  assert.equal(efectivoCobrado(pedido({ payment: 'Transferencia', cashOnDelivery: true })), 21000)
})

test('las cuentas del turno: fondos + cobrado − entregado, sin contar lo propuesto', () => {
  const pedidos = [pedido(), pedido({ status: 'completed', totalPrice: 10000 }), pedido({ payment: 'Nequi' })]
  const movimientos = [
    { tipo: 'fondo', estado: 'confirmado', monto: 50000, montoRecibido: 50000 },
    { tipo: 'fondo', estado: 'propuesto', monto: 20000 },
    { tipo: 'entrega', estado: 'confirmado', monto: 10000, montoRecibido: 10000 },
    { tipo: 'entrega', estado: 'con_diferencia', monto: 15000, montoRecibido: 14000 },
    { tipo: 'entrega', estado: 'propuesto', monto: 7000 },
  ]
  assert.deepEqual(cuentasDelTurno(pedidos, movimientos), {
    cobrado: 31000, fondos: 50000, entregado: 24000, enMano: 57000, porCuadrar: 21000, propuesto: 7000,
    parciales: 24000, parcialesIds: [], faltaPorCuadrar: 0,
  })
  assert.equal(montoEfectivo({ tipo: 'entrega', estado: 'confirmado', monto: 10000 }), 10000)
  assert.equal(montoEfectivo({ tipo: 'entrega', estado: 'rechazado', monto: 10000 }), 0)
})

test('la diferencia dice si faltó o sobró, y los montos se validan', () => {
  assert.equal(diferenciaDe(15000, 14000), -1000)
  assert.equal(textoDiferencia(-1000), 'Faltaron $1.000')
  assert.equal(textoDiferencia(500), 'Sobraron $500')
  assert.equal(textoDiferencia(0), 'Cuadra exacto')
  assert.equal(montoValido('$ 21.000'), 21000)
  assert.equal(montoValido(0), null)
  assert.equal(montoValido('abc'), null)
  assert.deepEqual(PENDIENTES, ['propuesto', 'rechazado', 'con_diferencia'])
})

test('las parciales descuentan de lo por cuadrar hasta que una entrega de cierre las usa', () => {
  const pedidos = [pedido(), pedido({ totalPrice: 15000 })]
  const parcial = { id: 'p1', tipo: 'entrega', estado: 'confirmado', monto: 10000, montoRecibido: 10000, pedidos: [] }
  const antes = cuentasDelTurno(pedidos, [parcial])
  assert.equal(antes.parciales, 10000)
  assert.deepEqual(antes.parcialesIds, ['p1'])
  assert.equal(antes.faltaPorCuadrar, 26000)
  const cierre = { id: 'c1', tipo: 'entrega', estado: 'propuesto', monto: 26000, pedidos: ['a', 'b'], parciales: ['p1'] }
  const despues = cuentasDelTurno(pedidos, [parcial, cierre])
  assert.equal(despues.parciales, 0)
  assert.equal(despues.propuesto, 26000)
})
