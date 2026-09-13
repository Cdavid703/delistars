// Pruebas del pago al enviar el pedido.
// Corre con: npm test  (node --test, sin dependencias)
import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  aplicaPagoAdelantado, totalAPagar, erroresPago, camposPago, llevaComprobante,
} from '../src/utils/pagoAdelantado.js'

test('aplica con domicilio automático y productos del menú', () => {
  assert.equal(aplicaPagoAdelantado({ fromMenu: true, menuTotal: 36000, deliveryMode: 'delivery', domicilioAutomatico: true }), true)
})

test('recoger en sede también paga de una vez (no hay domicilio que cotizar)', () => {
  assert.equal(aplicaPagoAdelantado({ fromMenu: true, menuTotal: 17000, deliveryMode: 'pickup', domicilioAutomatico: false }), true)
})

test('sin precio automático (sin mapa o pidió revisión) la caja cotiza', () => {
  assert.equal(aplicaPagoAdelantado({ fromMenu: true, menuTotal: 36000, deliveryMode: 'delivery', domicilioAutomatico: false }), false)
})

test('sin precio de productos (pedido escrito a mano) la caja cotiza', () => {
  assert.equal(aplicaPagoAdelantado({ fromMenu: false, menuTotal: 0, deliveryMode: 'pickup', domicilioAutomatico: false }), false)
  assert.equal(aplicaPagoAdelantado({ fromMenu: true, menuTotal: 0, deliveryMode: 'delivery', domicilioAutomatico: true }), false)
})

test('el total suma el domicilio solo si es a domicilio', () => {
  assert.equal(totalAPagar({ menuTotal: 36000, deliveryMode: 'delivery', precioDomicilio: 5000 }), 41000)
  assert.equal(totalAPagar({ menuTotal: 36000, deliveryMode: 'pickup', precioDomicilio: 5000 }), 36000)
})

test('efectivo: exige billete que alcance', () => {
  assert.deepEqual(erroresPago({ metodo: 'Efectivo', total: 41000, billete: 50000 }), [])
  assert.deepEqual(erroresPago({ metodo: 'Efectivo', total: 41000, billete: 41000 }), [])
  assert.equal(erroresPago({ metodo: 'Efectivo', total: 41000, billete: null }).length, 1)
  assert.match(erroresPago({ metodo: 'Efectivo', total: 41000, billete: 20000 })[0], /no alcanza/)
})

test('transferencia y Nequi: comprobante obligatorio', () => {
  assert.match(erroresPago({ metodo: 'Transferencia', total: 41000 })[0], /comprobante/)
  assert.deepEqual(erroresPago({ metodo: 'Nequi', total: 41000, comprobante: { name: 'x.jpg' } }), [])
})

test('mixto: las dos partes suman el total y lleva comprobante', () => {
  const ok = { metodo: 'Mixto', total: 41000, mixtoEfectivo: '20000', mixtoTransferencia: '21000', comprobante: {} }
  assert.deepEqual(erroresPago(ok), [])
  assert.match(erroresPago({ ...ok, mixtoTransferencia: '10000' })[0], /sumar el total/)
  assert.match(erroresPago({ ...ok, comprobante: null })[0], /comprobante/)
})

test('sin método no deja enviar', () => {
  assert.deepEqual(erroresPago({ metodo: '', total: 41000 }), ['Elige cómo vas a pagar'])
})

test('campos de efectivo: billete y cambio listos para el domiciliario', () => {
  const c = camposPago({ metodo: 'Efectivo', total: 41000, precioProductos: 36000, precioDomicilio: 5000, billete: 50000 })
  assert.equal(c.pagoAdelantado, true)
  assert.equal(c.cashOnDelivery, true)
  assert.equal(c.totalPrice, 41000)
  assert.equal(c.cashBillAmount, 50000)
  assert.equal(c.cashChange, 9000)
  assert.equal(c.mixtoEfectivo, undefined)
})

test('campos de transferencia: sin efectivo ni cambio', () => {
  const c = camposPago({ metodo: 'Transferencia', total: 36000, precioProductos: 36000, precioDomicilio: 0 })
  assert.equal(c.cashOnDelivery, false)
  assert.equal(c.cashBillAmount, undefined)
  assert.equal(llevaComprobante('Transferencia'), true)
  assert.equal(llevaComprobante('Efectivo'), false)
})
