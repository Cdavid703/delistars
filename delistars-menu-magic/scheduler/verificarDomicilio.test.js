// Corre con: node --test   (desde delistars-menu-magic/scheduler)
const { test } = require('node:test')
const assert = require('node:assert/strict')
const { revisarPrecio, mensajeDescuadre, debeRevisarse } = require('./verificarDomicilio')

const pedido = (extra = {}) => ({
  deliveryMode: 'delivery', deliveryPriceAuto: true, sedeId: 'santa_teresita',
  addrLat: 6.257, addrLng: -75.6227, deliveryPrice: 7000, orderNumber: '001', name: 'Ana María',
  ...extra,
})
const medirA = (km) => async () => ({ km })

test('cuadra cuando el precio es el de la franja por calle', async () => {
  assert.deepEqual(await revisarPrecio(pedido(), medirA(3.07)),
    { cuadra: true, km: 3.07, precioCorrecto: 7000, precioPedido: 7000 })
})

test('detecta el pedido que cobró de menos (p. ej. en línea recta)', async () => {
  const r = await revisarPrecio(pedido({ deliveryPrice: 5000 }), medirA(3.07))
  assert.equal(r.cuadra, false)
  const m = mensajeDescuadre(pedido({ deliveryPrice: 5000 }), r)
  assert.equal(m.rol, 'cashier')
  assert.match(m.body, /Pedido #001 de Ana: trae domicilio de \$5\.000, pero por 3\.1 km por calle corresponde \$7\.000/)
})

test('avisa si por calle queda fuera de cobertura', async () => {
  const r = await revisarPrecio(pedido({ deliveryPrice: 8000 }), medirA(7.4))
  assert.equal(r.precioCorrecto, null)
  assert.match(mensajeDescuadre(pedido(), r).body, /fuera de cobertura/)
})

test('no revisa recoger en sede, precios de la caja, pedidos sin pin o de otra sede', () => {
  assert.equal(debeRevisarse(pedido({ deliveryMode: 'pickup' })), false)
  assert.equal(debeRevisarse(pedido({ deliveryPriceAuto: false })), false)
  assert.equal(debeRevisarse(pedido({ addrLat: null })), false)
  assert.equal(debeRevisarse(pedido({ sedeId: 'otra' })), false)
  assert.equal(debeRevisarse(pedido()), true)
})

test('si no se pudo medir, no avisa nada', async () => {
  assert.equal(await revisarPrecio(pedido(), async () => null), null)
})
