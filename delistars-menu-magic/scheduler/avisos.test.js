const { test } = require('node:test')
const assert = require('node:assert/strict')
const { enlacePedido, destinoCaja, idEvento, mensajeNuevo, sinDomiciliarioDemasiado, sinRespuestaDemasiado, mensajesExpo, expoMuertos } = require('./avisos')

test('enlace del pedido, destino de caja e id de evento estable', () => {
  assert.equal(enlacePedido('abc123'), 'https://delistars.com/p/abc123')
  assert.equal(destinoCaja('santa_lucia'), 'caja_santa_lucia')
  assert.equal(destinoCaja(''), null)
  assert.equal(idEvento('pedido', 'AbC', 'etapa', 'en_camino'), 'pedido_abc_etapa_en_camino')
  assert.equal(idEvento('x', 'a b/c'), 'x_a-b-c')
})

test('mensaje nuevo del chat: quién escribió', () => {
  const o = { clientMessages: [{ role: 'client', text: 'hola' }, { role: 'cashier', text: 'ya va' }] }
  assert.deepEqual(mensajeNuevo(1, o), { de: 'caja', n: 2, texto: 'ya va' })
  assert.equal(mensajeNuevo(2, o), null)
  assert.equal(mensajeNuevo(null, o), null) // primera vez que se ve el pedido: no se avisa
  assert.equal(mensajeNuevo(0, { clientMessages: [{ role: 'client', text: 'x'.repeat(200) }] }).texto.length, 118)
})

test('domicilio sin domiciliario: aviso al admin a los 10 minutos', () => {
  const ahora = 1_000_000_000
  const o = { status: 'quoted', sinDomiciliario: true, deliveryMode: 'delivery', quotedAt: ahora - 11 * 60000 }
  assert.equal(sinDomiciliarioDemasiado(o, ahora), true)
  assert.equal(sinDomiciliarioDemasiado({ ...o, quotedAt: ahora - 5 * 60000 }, ahora), false)
  assert.equal(sinDomiciliarioDemasiado({ ...o, driverEmail: 'j@x.com' }, ahora), false)
  assert.equal(sinDomiciliarioDemasiado({ ...o, deliveryMode: 'pickup' }, ahora), false)
})

test('push de Expo: mensajes y tokens muertos', () => {
  const m = mensajesExpo(['ExponentPushToken[a]'], { title: 'T', body: 'B' }, 'https://delistars.com/p/1')
  // Sin datos: aviso de pedido con su categoría.
  assert.deepEqual(m[0], { to: 'ExponentPushToken[a]', title: 'T', body: 'B', sound: 'default', data: { url: 'https://delistars.com/p/1', tipo: 'pedido' }, categoryId: 'estado_pedido' })
  // W-8: pedido, tipo, propuesta y categoría para la notificación propia del reloj.
  const c = mensajesExpo(['x'], { title: 'T', body: 'B', tipo: 'cambio' }, 'u', { orderId: 'o1', tipo: 'cambio', propuestaId: 'prop_1' })
  assert.deepEqual(c[0].data, { url: 'u', tipo: 'cambio', orderId: 'o1', propuestaId: 'prop_1' })
  assert.equal(c[0].categoryId, 'cambio_pedido')
  const r = mensajesExpo(['x'], { title: 'T', body: 'B' }, 'u', { orderId: 'o1', reclamoId: 'r1', tipo: 'reclamo' })
  assert.deepEqual([r[0].data.reclamoId, r[0].categoryId], ['r1', 'reclamo'])
  // Promoción: sin categoría.
  assert.equal(mensajesExpo(['x'], { title: 'T', body: 'B' }, 'u', { tipo: 'promo' })[0].categoryId, undefined)
  assert.deepEqual(expoMuertos(['a', 'b'], { data: [{ status: 'ok' }, { status: 'error', details: { error: 'DeviceNotRegistered' } }] }), ['b'])
})

test('cambio propuesto sin respuesta: aviso a la caja a los 10 minutos', () => {
  const ahora = 1_000_000_000
  const o = { excepcion: 'cambio_pendiente', cambioPropuesto: { estado: 'pendiente', propuestoAt: ahora - 11 * 60000 } }
  assert.equal(sinRespuestaDemasiado(o, ahora), true)
  assert.equal(sinRespuestaDemasiado(o, ahora, 15), false)
  assert.equal(sinRespuestaDemasiado({ ...o, excepcion: null, cambioPropuesto: { ...o.cambioPropuesto, estado: 'aceptado' } }, ahora), false)
})
