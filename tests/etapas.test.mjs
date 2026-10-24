import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync, existsSync } from 'node:fs'
import {
  ETAPAS, EXCEPCIONES, DESDE_ESTADO_VIEJO, etapaDe, progreso, terminado, masAvanzada, TRANSICIONES,
} from '../src/utils/etapas.js'

test('domicilio tiene 7 etapas y recoger 5 (P-11)', () => {
  assert.deepEqual(ETAPAS.domicilio.map((e) => e.id),
    ['enviado', 'confirmado', 'en_preparacion', 'listo', 'en_camino', 'llego', 'entregado'])
  assert.deepEqual(ETAPAS.recoger.map((e) => e.texto),
    ['Enviado', 'Confirmado', 'En preparación', 'Listo para recoger', 'Entregado'])
})

test('estados viejos se traducen según la tabla aprobada', () => {
  const casos = {
    pending: 'enviado', quoted: 'confirmado', assigned: 'confirmado', accepted: 'confirmado',
    preparing: 'en_preparacion', in_transit: 'en_camino', arrived: 'llego',
    delivered_paid: 'entregado', delivered_cash: 'entregado', pending_cuadre: 'entregado', completed: 'entregado',
  }
  for (const [status, etapa] of Object.entries(casos)) {
    assert.equal(etapaDe({ status }).etapa, etapa, status)
    assert.equal(etapaDe({ status }).excepcion, null)
  }
  assert.equal(Object.keys(DESDE_ESTADO_VIEJO).length, Object.keys(casos).length)
})

test('rechazado y cancelado viejos: excepción con la etapa que alcanzaron y su motivo', () => {
  assert.deepEqual(etapaDe({ status: 'rejected', rejectionReason: 'Sin cobertura' }),
    { tipo: 'domicilio', etapa: 'enviado', excepcion: 'rechazado', motivo: 'Sin cobertura' })
  const c = etapaDe({ status: 'cancelled', quotedPrice: 20000, preparingAt: 1, cancelReason: 'Cancelado por el cliente' })
  assert.equal(c.etapa, 'en_preparacion')
  assert.equal(c.excepcion, 'cancelado')
  assert.equal(c.motivo, 'Cancelado por el cliente')
})

test('recoger en sede nunca queda en camino ni llegó', () => {
  assert.equal(etapaDe({ status: 'in_transit', deliveryMode: 'pickup' }).etapa, 'listo')
  assert.equal(etapaDe({ status: 'completed', deliveryMode: 'pickup' }).etapa, 'entregado')
})

test('si el pedido trae etapa nueva, manda sobre el status viejo', () => {
  const o = { status: 'preparing', etapa: 'listo', excepcion: 'cambio_pendiente', excepcionMotivo: 'Sin tocineta' }
  assert.deepEqual(etapaDe(o), { tipo: 'domicilio', etapa: 'listo', excepcion: 'cambio_pendiente', motivo: 'Sin tocineta' })
})

test('progreso marca hechas, actual y pendientes; la excepción va aparte', () => {
  const p = progreso({ status: 'preparing', deliveryMode: 'pickup' })
  assert.deepEqual(p.pasos.map((x) => x.estado), ['hecha', 'hecha', 'actual', 'pendiente', 'pendiente'])
  assert.equal(p.excepcion, null)
  const fin = progreso({ status: 'completed' })
  assert.ok(fin.pasos.every((x) => x.estado === 'hecha'))
  const r = progreso({ status: 'rejected', rejectionReason: 'Cerrado' })
  assert.deepEqual(r.excepcion, { id: 'rechazado', texto: 'Rechazado', final: true, motivo: 'Cerrado' })
  assert.equal(r.pasos[0].estado, 'actual')
})

test('terminado: entregado o excepción final; las temporales no terminan', () => {
  assert.equal(terminado({ status: 'completed' }), true)
  assert.equal(terminado({ status: 'cancelled' }), true)
  assert.equal(terminado({ etapa: 'llego', excepcion: 'no_entregado' }), false)
  assert.equal(terminado({ etapa: 'llego', excepcion: 'devuelto' }), true)
})

test('la etapa nunca retrocede', () => {
  assert.equal(masAvanzada('domicilio', 'en_preparacion', 'confirmado'), 'en_preparacion')
  assert.equal(masAvanzada('domicilio', 'listo', 'en_camino'), 'en_camino')
})

test('transiciones: solo etapas y excepciones que existen', () => {
  for (const t of TRANSICIONES) {
    const [clase, id] = t.a.startsWith('excepcion:') ? ['exc', t.a.slice(10)] : ['etapa', t.a]
    if (clase === 'exc') assert.ok(EXCEPCIONES[id], t.a)
    // 'seguir' no mueve la etapa: solo quita una excepción temporal.
    else assert.ok(id === 'seguir' || ETAPAS.domicilio.some((e) => e.id === id), t.a)
    for (const d of t.desde) assert.ok(ETAPAS.domicilio.some((e) => e.id === d), d)
    for (const x of t.solo ?? []) assert.ok(EXCEPCIONES[x] && !EXCEPCIONES[x].final, x)
  }
})

test('las copias de los módulos compartidos en este repo son idénticas', () => {
  for (const nombre of ['etapas', 'chat', 'reclamos', 'cuadres']) {
    const fuente = readFileSync(new URL(`../src/utils/${nombre}.js`, import.meta.url), 'utf8')
    const url = new URL(`../delistars-menu-magic/back/src/shared/${nombre}.js`, import.meta.url)
    if (existsSync(url)) assert.equal(readFileSync(url, 'utf8'), fuente, nombre)
  }
})
