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
    { clientUid: 'b', status: 'delivered_paid', sedeId: 'santa_teresita', createdAtMs: hace(100) }, // inactivo: más de 90 días
    { clientUid: 'b', status: 'cancelled', sedeId: 'santa_lucia', createdAtMs: hace(1) }, // no cuenta
    { clientUid: 'd', status: 'pending_cuadre', sedeId: 'santa_teresita', createdAtMs: hace(3) },
  ]
  const r = calcularAudiencia(clientes, pedidos, AHORA)
  assert.equal(r.clientes, 4)
  assert.equal(r.conCorreo, 3)
  assert.equal(r.aceptan, 1)
  assert.deepEqual(r.segmentos.todos, { clientes: 3, aceptan: 1, notificables: 0 })
  assert.deepEqual(r.segmentos.santa_lucia, { clientes: 1, aceptan: 1, notificables: 0 })
  assert.deepEqual(r.segmentos.santa_teresita, { clientes: 2, aceptan: 0, notificables: 0 })
  assert.deepEqual(r.segmentos.inactivos30, { clientes: 1, aceptan: 0, notificables: 0 })
  assert.deepEqual(r.segmentos.frecuentes, { clientes: 1, aceptan: 1, notificables: 0 })
  assert.deepEqual(r.segmentos.nuevos, { clientes: 2, aceptan: 0, notificables: 0 })
  assert.deepEqual(r.segmentos.cercaPremio, { clientes: 1, aceptan: 1, notificables: 0 })
})

test('inactivo es más de 90 días sin pedir: 40 días todavía no', () => {
  const r = calcularAudiencia([{ uid: 'e', email: 'e@x.com' }], [{ clientUid: 'e', status: 'completed', sedeId: 'santa_lucia', createdAtMs: hace(40) }], AHORA)
  assert.equal(r.segmentos.inactivos30.clientes, 0)
})

test('sin datos, todos los segmentos existen en cero', () => {
  const r = calcularAudiencia([], [], AHORA)
  assert.equal(Object.keys(r.segmentos).length, 7)
  assert.deepEqual(r.segmentos.frecuentes, { clientes: 0, aceptan: 0, notificables: 0 })
})

const { destinatarios } = require('./audiencia')

test('destinatarios: solo los que aceptan, del segmento, sin bajas y sin correos repetidos', () => {
  const clientes = [
    { uid: 'a', email: 'a@x.com', promociones: { acepta: true } },
    { uid: 'a2', email: 'A@x.com', promociones: { acepta: true } },   // mismo correo, otra cuenta
    { uid: 'b', email: 'b@x.com', promociones: { acepta: true } },    // se dio de baja
    { uid: 'c', email: 'c@x.com', promociones: { acepta: false } },
    { uid: 'd', email: 'd@x.com', promociones: { acepta: true } },
  ]
  const pedidos = [{ clientUid: 'd', status: 'completed', sedeId: 'santa_teresita', createdAtMs: AHORA - 864e5 }]
  const bajas = new Set(['b'])
  assert.deepEqual(destinatarios('todos', clientes, pedidos, AHORA, bajas).map((c) => c.uid), ['a', 'd'])
  assert.deepEqual(destinatarios('santa_teresita', clientes, pedidos, AHORA, bajas).map((c) => c.uid), ['d'])
})

test('la audiencia tampoco cuenta como "aceptan" a quien se dio de baja', () => {
  const clientes = [{ uid: 'a', email: 'a@x.com', promociones: { acepta: true } }]
  assert.equal(calcularAudiencia(clientes, [], AHORA, new Set(['a'])).aceptan, 0)
})

test('notificables: aceptan y tienen aparato; la promoción por notificación respeta la sede habitual', () => {
  const { calcularAudiencia, destinatariosPush } = require('./audiencia')
  const clientes = [
    { uid: 'a', email: 'a@x.co', promociones: { acepta: true } },
    { uid: 'b', promociones: { acepta: true } },              // sin correo, con aparato
    { uid: 'c', email: 'c@x.co', promociones: { acepta: false } },
    { uid: 'd', email: 'd@x.co', promociones: { acepta: true } }, // sin aparato
  ]
  const pedidos = [
    { clientUid: 'a', status: 'completed', sedeId: 'santa_lucia', createdAtMs: AHORA - 1000 },
    { clientUid: 'b', status: 'completed', sedeId: 'santa_teresita', createdAtMs: AHORA - 1000 },
  ]
  const aparatos = new Set(['a', 'b', 'c'])
  const aud = calcularAudiencia(clientes, pedidos, AHORA, new Set(), aparatos)
  assert.equal(aud.notificables, 2)
  assert.equal(aud.segmentos.todos.notificables, 2)
  assert.equal(aud.segmentos.santa_lucia.notificables, 1)
  assert.deepEqual(destinatariosPush('todos', clientes, pedidos, AHORA, new Set(), aparatos, 'santa_lucia').map((c) => c.uid), ['a'])
  assert.deepEqual(destinatariosPush('todos', clientes, pedidos, AHORA, new Set(['b']), aparatos, '').map((c) => c.uid), ['a'])
})
