// Corre con: node --test   (desde delistars-menu-magic/scheduler)
const { test } = require('node:test')
const assert = require('node:assert/strict')
const { calcularAudiencia } = require('./audiencia')

const AHORA = Date.parse('2026-10-09T20:00:00Z')
const hace = (dias) => AHORA - dias * 24 * 60 * 60 * 1000

test('cuenta clientes con correo y los que aceptan, por segmento', () => {
  const clientes = [
    { uid: 'a', email: 'a@x.com', promociones: { acepta: true }, loyalty: { santa_lucia: { count: 9 } } },
    { uid: 'b', email: 'b@x.com', promociones: { acepta: false } },
    { uid: 'c', email: '' },                // anónimo: no cuenta
    { uid: 'd', email: 'd@x.com' },          // nunca respondió: no acepta
  ]
  const pedidos = [
    ...Array.from({ length: 5 }, () => ({ clientUid: 'a', status: 'completed', sedeId: 'santa_lucia', createdAtMs: hace(2) })),
    { clientUid: 'b', status: 'delivered_paid', sedeId: 'santa_teresita', createdAtMs: hace(40) },
    { clientUid: 'b', status: 'cancelled', sedeId: 'santa_lucia', createdAtMs: hace(1) }, // no cuenta
    { clientUid: 'd', status: 'pending_cuadre', sedeId: 'santa_teresita', createdAtMs: hace(3) },
  ]
  const r = calcularAudiencia(clientes, pedidos, AHORA)
  assert.equal(r.clientes, 4)
  assert.equal(r.conCorreo, 3)
  assert.equal(r.aceptan, 1)
  assert.deepEqual(r.segmentos.todos, { clientes: 3, aceptan: 1 })
  assert.deepEqual(r.segmentos.santa_lucia, { clientes: 1, aceptan: 1 })
  assert.deepEqual(r.segmentos.santa_teresita, { clientes: 2, aceptan: 0 })
  assert.deepEqual(r.segmentos.inactivos30, { clientes: 1, aceptan: 0 })
  assert.deepEqual(r.segmentos.frecuentes, { clientes: 1, aceptan: 1 })
  assert.deepEqual(r.segmentos.nuevos, { clientes: 2, aceptan: 0 })
  assert.deepEqual(r.segmentos.cercaPremio, { clientes: 1, aceptan: 1 })
})

test('sin datos, todos los segmentos existen en cero', () => {
  const r = calcularAudiencia([], [], AHORA)
  assert.equal(Object.keys(r.segmentos).length, 7)
  assert.deepEqual(r.segmentos.frecuentes, { clientes: 0, aceptan: 0 })
})
