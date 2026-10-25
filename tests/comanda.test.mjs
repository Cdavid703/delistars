import { test } from 'node:test'
import assert from 'node:assert/strict'
import { contenidoComanda, textoComanda, lineasProductos, estadoComanda, ambiguo, AMBIGUO_MS } from '../src/utils/comanda.js'

const T = Date.UTC(2026, 9, 24, 17, 30) // 12:30 en Colombia
const pedido = {
  orderNumber: '042', version: 1, deliveryMode: 'delivery', name: 'Ana', phone: '3001234567', fullAddress: 'Cra 80 #45-10',
  items: '2x Perro Clásico (Queso extra) | Salsas: Rosada — "sin cebolla" (= $34.000)\n1x Combo Dúo (= $30.000)\n   ↳ Hamburguesa sencilla\n   ↳ Perro sencillo',
  quotedPrice: 64000, deliveryPrice: 5000, totalPrice: 69000, payment: 'Efectivo', notes: 'Bien tostado',
  createdAt: T - 10 * 60000,
}

test('los productos van sin el precio de cada línea y conservan opciones, notas y combos', () => {
  assert.deepEqual(lineasProductos(pedido.items), [
    '2x Perro Clásico (Queso extra) | Salsas: Rosada — "sin cebolla"',
    '1x Combo Dúo',
    '   ↳ Hamburguesa sencilla',
    '   ↳ Perro sencillo',
  ])
})

test('la comanda lleva número, modalidad, horas, productos y totales, sin dirección, teléfono ni pago (§19.1)', () => {
  const txt = textoComanda(contenidoComanda(pedido, { ahora: T }))
  for (const parte of ['#042', 'DOMICILIO', 'Pedido 12:20 · Impresa 12:30', 'Perro Clásico', '↳ Perro sencillo', 'Nota: Bien tostado', 'Subtotal  $64.000', 'Domicilio  $5.000', 'TOTAL  $69.000']) {
    assert.ok(txt.includes(parte), `falta ${parte}`)
  }
  for (const nada of ['Cra 80', '3001234567', 'Efectivo', '$34.000']) assert.ok(!txt.includes(nada), `sobra ${nada}`)
  const recoge = textoComanda(contenidoComanda({ ...pedido, deliveryMode: 'pickup', totalPrice: 64000 }, { ahora: T }))
  assert.ok(recoge.includes('RECOGE EN SEDE') && !recoge.includes('Domicilio  '))
})

test('copias, versiones nuevas y pruebas quedan identificadas', () => {
  assert.equal(contenidoComanda(pedido, { tipo: 'copia', motivo: 'Se manchó', ahora: T })[0].t, 'COPIA — Se manchó')
  assert.match(contenidoComanda({ ...pedido, version: 3 }, { tipo: 'actualizada', ahora: T })[0].t, /ACTUALIZADA — versión 3/)
  assert.equal(contenidoComanda(pedido, { prueba: true, ahora: T })[0].t, '*** PRUEBA — NO PREPARAR ***')
  assert.ok(textoComanda(contenidoComanda({}, { tipo: 'prueba', ahora: T })).includes('Página de prueba'))
  const premio = textoComanda(contenidoComanda({ ...pedido, loyaltyRedemption: { count: 1 } }, { ahora: T }))
  assert.ok(premio.includes('Premios  1 gratis (no cobrar)'))
})

test('el estado de la comanda en el pedido, y cuándo un envío queda en duda', () => {
  assert.equal(estadoComanda(pedido), 'sin_imprimir')
  assert.equal(estadoComanda({ ...pedido, comanda: { estado: 'enviada', version: 1 } }), 'enviada')
  assert.equal(estadoComanda({ ...pedido, version: 2, comanda: { estado: 'enviada', version: 1 } }), 'desactualizada')
  assert.equal(estadoComanda({ ...pedido, comanda: { estado: 'descartada', version: 1 } }), 'sin_imprimir')
  assert.equal(ambiguo({ estado: 'enviando', tomadaAt: T }, T + AMBIGUO_MS + 1), true)
  assert.equal(ambiguo({ estado: 'enviando', tomadaAt: T }, T + 1000), false)
})
