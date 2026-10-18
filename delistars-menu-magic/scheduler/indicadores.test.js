const { test } = require('node:test')
const assert = require('node:assert/strict')
const { calcularDias, productos } = require('./indicadores')

const t = (s) => Date.parse(s)

test('agrupa por día y sede de Colombia, solo números', () => {
  const dias = calcularDias([
    { createdAtMs: t('2026-10-17T19:30:00-05:00'), status: 'completed', sedeId: 'santa_lucia', totalPrice: 30000, deliveryMode: 'delivery', items: '2x Hamburguesa Especial (Adición + queso) | Salsas: Rosada' },
    { createdAtMs: t('2026-10-17T21:10:00-05:00'), status: 'pending_cuadre', sedeId: 'santa_lucia', totalPrice: 20000, deliveryMode: 'pickup', items: '1x Perro Grande — "sin cebolla"' },
    { createdAtMs: t('2026-10-17T21:15:00-05:00'), status: 'cancelled', sedeId: 'santa_lucia', totalPrice: 99999 },
    { createdAtMs: t('2026-10-17T22:00:00-05:00'), status: 'rejected', sedeId: 'santa_teresita', cashierId: 'caja1' },
    // 11:30 p. m. del 17 en Colombia = 18 en UTC: debe contar el 17.
    { createdAtMs: t('2026-10-18T04:30:00Z'), status: 'completed', sedeId: 'santa_teresita', totalPrice: 10000, items: '1x Perro Grande' },
  ], [{ atMs: t('2026-10-17T19:00:00-05:00') }, { atMs: t('2026-10-17T20:00:00-05:00') }])

  assert.deepEqual(Object.keys(dias), ['2026-10-17'])
  const sl = dias['2026-10-17'].sedes.santa_lucia
  assert.equal(sl.pedidos, 2)
  assert.equal(sl.ventas, 50000)
  assert.equal(sl.cancelados, 1)
  assert.equal(sl.domicilios, 1)
  assert.equal(sl.recoger, 1)
  assert.equal(sl.porHora[19], 1)
  assert.equal(sl.porHora[21], 1)
  assert.deepEqual(sl.productos, { 'Hamburguesa Especial': 2, 'Perro Grande': 1 })
  const st = dias['2026-10-17'].sedes.santa_teresita
  assert.equal(st.rechazados, 1)
  assert.equal(st.pedidos, 1)
  assert.equal(st.porHora[23], 1)
  assert.deepEqual(dias['2026-10-17'].embudo, { checkouts: 2, pedidosCliente: 4 })
})

test('ningún dato personal llega a los indicadores', () => {
  const dias = calcularDias([{ createdAtMs: t('2026-10-17T19:30:00-05:00'), status: 'completed', sedeId: 'santa_lucia', totalPrice: 1, name: 'Ana', phone: '300', fullAddress: 'Cra 1', clientUid: 'u1' }])
  const texto = JSON.stringify(dias)
  for (const dato of ['Ana', '"300"', 'Cra 1', 'u1']) assert.ok(!texto.includes(dato), dato)
})

test('líneas de combo (↳) y premio de fidelización', () => {
  assert.deepEqual(productos('1x Combo Quincena (= $52.900)\n   ↳ Hamburguesa 1 · Bebida: Coca Cola Zero\n1x Premio fidelización — GRATIS'),
    [{ name: 'Combo Quincena', qty: 1 }, { name: 'Premio fidelización', qty: 1 }])
})
