// Pruebas del aviso de cercanía del domiciliario.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { pedidosCerca, geoDelPedido, RADIO_AVISO_M } from '../src/utils/cercania.js'

// ~0,0009° de latitud ≈ 100 m.
const AQUI = { lat: 6.2500, lng: -75.6000 }
const aMetros = m => ({ addrLat: AQUI.lat + m / 111195, addrLng: AQUI.lng })

test('avisa del pedido en manos que está a menos de 250 m', () => {
  const orders = [
    { id: 'a', status: 'in_transit', ...aMetros(180) },
    { id: 'b', status: 'in_transit', ...aMetros(900) },
  ]
  const cerca = pedidosCerca(AQUI, orders)
  assert.deepEqual(cerca.map(c => c.order.id), ['a'])
  assert.ok(Math.abs(cerca[0].metros - 180) <= 2)
})

test('solo pedidos que ya lleva: asignados o en preparación no cuentan', () => {
  const orders = ['assigned', 'accepted', 'preparing', 'arrived', 'delivered_paid']
    .map((status, i) => ({ id: String(i), status, ...aMetros(50) }))
  assert.deepEqual(pedidosCerca(AQUI, orders), [])
})

test('no repite el aviso de un pedido ya avisado', () => {
  const orders = [{ id: 'a', status: 'in_transit', ...aMetros(100) }]
  assert.deepEqual(pedidosCerca(AQUI, orders, { avisados: new Set(['a']) }), [])
})

test('ordena del más cercano al más lejano', () => {
  const orders = [
    { id: 'lejos', status: 'in_transit', ...aMetros(240) },
    { id: 'cerca', status: 'in_transit', ...aMetros(60) },
  ]
  assert.deepEqual(pedidosCerca(AQUI, orders).map(c => c.order.id), ['cerca', 'lejos'])
})

test('sin pin usa lo que encontró el buscador; sin nada, no avisa', () => {
  const geoCache = { 'Cra 1 #2-3': { lat: AQUI.lat + 0.001, lng: AQUI.lng } }
  const orders = [
    { id: 'texto', status: 'in_transit', fullAddress: 'Cra 1 #2-3' },
    { id: 'nada', status: 'in_transit', fullAddress: 'Calle sin ubicar' },
  ]
  assert.deepEqual(pedidosCerca(AQUI, orders, { geoCache }).map(c => c.order.id), ['texto'])
})

test('el pin exacto manda sobre el texto', () => {
  const geoCache = { 'Cra 1': { lat: 1, lng: 1 } }
  assert.deepEqual(geoDelPedido({ fullAddress: 'Cra 1', addrLat: '6.25', addrLng: '-75.6' }, geoCache),
    { lat: 6.25, lng: -75.6, exacto: true })
  assert.deepEqual(geoDelPedido({ fullAddress: 'Cra 1' }, geoCache), { lat: 1, lng: 1, exacto: false })
  assert.equal(geoDelPedido({ fullAddress: 'otra' }, geoCache), null)
})

test('sin posición del GPS no avisa nada', () => {
  const orders = [{ id: 'a', status: 'in_transit', ...aMetros(10) }]
  assert.deepEqual(pedidosCerca(null, orders), [])
  assert.deepEqual(pedidosCerca({ lat: NaN, lng: 1 }, orders), [])
  assert.equal(RADIO_AVISO_M, 250)
})
