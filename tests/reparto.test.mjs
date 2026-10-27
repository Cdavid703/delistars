// Pruebas del panel del domiciliario: orden de la ruta, paso y cobro.
// Corre con: npm test  (node --test, sin dependencias)
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { ordenarRuta, pasoReparto, etiquetaReparto, cobroDe } from '../src/utils/reparto.js'

const p = (id, status, seg, extra = {}) => ({ id, status, createdAt: { seconds: seg }, ...extra })

test('lo que ya está en la calle va primero, luego el orden del domiciliario y luego la hora', () => {
  const ruta = ordenarRuta([
    p('a', 'accepted', 1), p('b', 'preparing', 2), p('c', 'in_transit', 3), p('d', 'arrived', 4), p('e', 'accepted', 0),
  ], ['b'])
  assert.deepEqual(ruta.map((o) => o.id), ['d', 'c', 'b', 'e', 'a'])
})

test('sin hora de creación no se rompe el orden', () => {
  assert.deepEqual(ordenarRuta([p('a', 'accepted', 5), { id: 'b', status: 'accepted' }]).map((o) => o.id), ['b', 'a'])
})

test('paso del reparto', () => {
  assert.equal(pasoReparto({ status: 'preparing' }), 0)
  assert.equal(pasoReparto({ status: 'in_transit' }), 1)
  assert.equal(pasoReparto({ status: 'arrived' }), 2)
  assert.equal(pasoReparto({ status: 'pending_cuadre' }), 3)
})

test('etiquetas: cocina, en camino y no se pudo entregar', () => {
  assert.equal(etiquetaReparto({ status: 'preparing' }).texto, 'En cocina')
  assert.equal(etiquetaReparto({ status: 'in_transit' }).tono, 'calle')
  assert.equal(etiquetaReparto({ status: 'arrived', etapa: 'llego', excepcion: 'no_entregado' }).texto, 'No se pudo entregar')
})

test('cobro en efectivo con billete y cambio; manda lo que registró la caja', () => {
  const c = cobroDe({ payment: 'Efectivo', totalPrice: 66000, cashBillAmount: 50000, cashChange: 0, payAmount: 100000, change: 34000, payExact: false })
  assert.deepEqual([c.efectivo, c.monto, c.billete, c.cambio, c.exacto], [true, 66000, 100000, 34000, false])
})

test('cobro exacto y pago digital', () => {
  assert.equal(cobroDe({ payment: 'Efectivo', totalPrice: 20000 }).exacto, true)
  assert.equal(cobroDe({ payment: 'Nequi', transferValidated: true }).texto, 'Ya pagó')
  assert.equal(cobroDe({ payment: 'Nequi' }).pendiente, true)
  assert.equal(cobroDe({ payment: 'Mixto', totalPrice: 40000, mixtoEfectivo: 10000 }).monto, 10000)
})

import { estadoCocina, porCobrarTotal, kmDe, minutosParaLlegar, grupoReparto } from '../src/utils/reparto.js'

test('estado en la cocina y grupo', () => {
  assert.deepEqual(estadoCocina({ status: 'accepted', etapa: 'listo' }), { texto: 'Listo para llevar', listo: true })
  assert.equal(estadoCocina({ status: 'preparing' }).texto, 'En cocina')
  assert.equal(grupoReparto({ status: 'arrived' }), 'reparto')
  assert.equal(grupoReparto({ status: 'preparing' }), 'recoger')
})

test('por cobrar: efectivo y por definir cuentan, lo pagado no', () => {
  assert.equal(porCobrarTotal([
    { payment: 'Efectivo', totalPrice: 43500 }, { payment: 'Nequi', totalPrice: 30000 }, { totalPrice: 20000 },
  ]), 63500)
  assert.equal(cobroDe({ totalPrice: 20000 }).porDefinir, true)
})

test('km y minutos para llegar', () => {
  assert.equal(kmDe({ deliveryKm: 1.24 }), '1,2 km')
  assert.equal(kmDe({}), null)
  assert.equal(minutosParaLlegar({ status: 'in_transit', etaLlegadaAt: 600000 }, 0), 10)
  assert.equal(minutosParaLlegar({ status: 'arrived', etaLlegadaAt: 600000 }, 0), null)
})
