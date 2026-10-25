// Pruebas del pedido para otra persona (§7.3).
// Corre con: npm test  (node --test, sin dependencias)
import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  revisarDestinatario, metodosPermitidos, pagaQuienRecibe, enlaceVigente, vistaDestinatario,
  mensajeParaQuienRecibe, enlaceDestinatario, VIGENCIA_ENLACE_MS,
} from '../src/utils/destinatario.js'

const datos = { nombre: '  Ana   María ', telefono: '+57 300 123 4567', paga: 'destinatario' }

test('sin destinatario el pedido es para quien lo pide', () => {
  assert.deepEqual(revisarDestinatario(null, { deliveryMode: 'delivery' }), { ok: true, destinatario: null })
})

test('limpia nombre y teléfono', () => {
  const r = revisarDestinatario(datos, { deliveryMode: 'delivery' })
  assert.deepEqual(r, { ok: true, destinatario: { nombre: 'Ana María', telefono: '3001234567', paga: 'destinatario' } })
})

test('solo para domicilio', () => {
  assert.equal(revisarDestinatario(datos, { deliveryMode: 'pickup' }).campo, 'modo')
})

test('pide nombre, teléfono de 10 dígitos y quién paga', () => {
  assert.equal(revisarDestinatario({ ...datos, nombre: 'A' }, { deliveryMode: 'delivery' }).campo, 'nombre')
  assert.equal(revisarDestinatario({ ...datos, telefono: '300123' }, { deliveryMode: 'delivery' }).campo, 'telefono')
  assert.equal(revisarDestinatario({ ...datos, paga: 'otro' }, { deliveryMode: 'delivery' }).campo, 'paga')
})

test('medios de pago según quién paga', () => {
  assert.equal(metodosPermitidos({}), null)
  assert.deepEqual(metodosPermitidos({ destinatario: { nombre: 'Ana', paga: 'comprador' } }), ['Transferencia', 'Nequi'])
  assert.deepEqual(metodosPermitidos({ destinatario: { nombre: 'Ana', paga: 'destinatario' } }), ['Efectivo'])
})

const ahora = Date.UTC(2026, 9, 25, 22)
const pedido = {
  name: 'Carlos Pérez', phone: '3110000000', sedeName: 'Santa Lucía', orderNumber: '012',
  deliveryMode: 'delivery', fullAddress: 'Cra 80 #45-10', addrLat: 6.25, addrLng: -75.6,
  destinatario: { nombre: 'Ana María', telefono: '3001234567', paga: 'destinatario', token: 't' },
  etapa: 'en_camino', excepcion: null, status: 'in_transit',
  driverName: 'Juan Gómez', driverLat: 6.26, driverLng: -75.59, driverUpdatedAt: ahora - 5000,
  quotedPrice: 30000, deliveryPrice: 5000, totalPrice: 35000, payment: 'Efectivo',
  cashBillAmount: 50000, cashChange: 15000, items: 'Hamburguesa', transferReceiptUrl: null,
}

test('quien recibe y paga ve solo lo que tiene que pagar, billete y cambio', () => {
  const v = vistaDestinatario('o1', pedido, ahora)
  assert.equal(v.recibe, 'Ana')
  assert.equal(v.envia, 'Carlos')
  assert.equal(v.domiciliario, 'Juan')
  assert.equal(v.noPaga, false)
  assert.equal(v.aPagar, 35000)
  assert.equal(v.billete, 50000)
  assert.equal(v.cambio, 15000)
  assert.deepEqual(v.ubicacion, { lat: 6.26, lng: -75.59, at: ahora - 5000 })
  // Nada del comprador ni del desglose.
  for (const k of ['items', 'payment', 'phone', 'quotedPrice', 'deliveryPrice', 'clientEmail']) assert.ok(!(k in v), k)
})

test('si paga el comprador: «No tienes que pagar» y nada de plata', () => {
  const v = vistaDestinatario('o1', { ...pedido, destinatario: { ...pedido.destinatario, paga: 'comprador' }, payment: 'Nequi' }, ahora)
  assert.equal(v.noPaga, true)
  assert.equal(v.aPagar, null)
  assert.equal(v.billete, null)
  assert.equal(pagaQuienRecibe({ destinatario: { nombre: 'Ana', paga: 'comprador' } }), false)
})

test('el mapa solo mientras va en camino', () => {
  const v = vistaDestinatario('o1', { ...pedido, etapa: 'en_preparacion', status: 'preparing' }, ahora)
  assert.equal(v.ubicacion, null)
  assert.equal(v.destino, null)
})

test('el enlace vence 3 horas después de entregar', () => {
  const entregado = { ...pedido, etapa: 'entregado', status: 'completed', deliveredAt: ahora }
  assert.equal(enlaceVigente(pedido, ahora), true)
  assert.equal(enlaceVigente(entregado, ahora + VIGENCIA_ENLACE_MS - 1), true)
  assert.equal(enlaceVigente(entregado, ahora + VIGENCIA_ENLACE_MS + 1), false)
  assert.equal(vistaDestinatario('o1', entregado, ahora).venceAt, ahora + VIGENCIA_ENLACE_MS)
  assert.equal(enlaceVigente({ ...pedido, destinatario: null }, ahora), false)
})

test('cancelado: también vence a las 3 horas', () => {
  const cancelado = { ...pedido, excepcion: 'cancelado', cancelledAt: ahora }
  assert.equal(enlaceVigente(cancelado, ahora + 1000), true)
  assert.equal(enlaceVigente(cancelado, ahora + VIGENCIA_ENLACE_MS + 1), false)
})

test('mensaje y enlace para compartir', () => {
  const url = enlaceDestinatario('https://delistars.com', 'abc_123')
  assert.equal(url, 'https://delistars.com/domicilios/?recibe=abc_123')
  const m = mensajeParaQuienRecibe(pedido, url)
  assert.match(m, /^Hola Ana, Carlos te mandó un pedido de DeliStars Santa Lucía\./)
  assert.match(m, /Lo pagas tú en efectivo/)
  assert.ok(m.endsWith(url))
})
