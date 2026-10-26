// Pruebas de los recorridos de entregas (§12.1). Corre con: node --test
const { test } = require('node:test')
const assert = require('node:assert/strict')
const { puntoNuevo, decisionRetencion, resumen, RETENCION_MS } = require('./recorridos')

const T = 1_800_000_000_000
const ped = (x = {}) => ({ deliveryMode: 'delivery', etapa: 'en_camino', excepcion: null, driverLat: 6.25, driverLng: -75.6, driverUpdatedAt: T, ...x })

test('solo se graba en camino o llegó, nunca el resto del turno', () => {
  assert.ok(puntoNuevo(ped(), null))
  assert.ok(puntoNuevo(ped({ etapa: 'llego' }), null))
  assert.equal(puntoNuevo(ped({ etapa: 'listo' }), null), null)
  assert.equal(puntoNuevo(ped({ etapa: 'entregado' }), null), null)
  assert.equal(puntoNuevo(ped({ deliveryMode: 'pickup' }), null), null)
  assert.equal(puntoNuevo(ped({ excepcion: 'cancelado' }), null), null)
  assert.equal(puntoNuevo(ped({ driverLat: null }), null), null)
})

test('no guarda puntos repetidos: 10 s y 10 m, o 60 s aunque esté quieto', () => {
  const p0 = puntoNuevo(ped(), null)
  assert.equal(puntoNuevo(ped({ driverUpdatedAt: T + 5000, driverLat: 6.26 }), p0), null) // muy seguido
  assert.equal(puntoNuevo(ped({ driverUpdatedAt: T + 20000 }), p0), null) // quieto 20 s
  assert.ok(puntoNuevo(ped({ driverUpdatedAt: T + 20000, driverLat: 6.2502 }), p0)) // se movió ~22 m
  assert.ok(puntoNuevo(ped({ driverUpdatedAt: T + 61000 }), p0)) // quieto pero pasó 1 min
})

test('se borra 7 días después de la entrega; con reclamo abierto se retiene', () => {
  const entregado = { etapa: 'entregado', deliveredAt: T }
  assert.equal(decisionRetencion({}, entregado, T + RETENCION_MS - 1), 'esperar')
  assert.equal(decisionRetencion({}, entregado, T + RETENCION_MS + 1), 'borrar')
  assert.equal(decisionRetencion({}, { ...entregado, reclamoEstado: 'en_revision' }, T + RETENCION_MS + 1), 'retener')
  // Reclamo resuelto después de los 7 días: se borra en la siguiente revisión.
  assert.equal(decisionRetencion({}, { ...entregado, reclamoEstado: 'resuelto' }, T + 20 * 24 * 3600 * 1000), 'borrar')
  // Pedido cancelado en el camino o devuelto: también 7 días.
  assert.equal(decisionRetencion({}, { etapa: 'en_camino', excepcion: 'devuelto', devueltoAt: T }, T + RETENCION_MS + 1), 'borrar')
  // Sin pedido ni fin: 7 días sin moverse.
  assert.equal(decisionRetencion({ actualizadoAt: T }, null, T + RETENCION_MS + 1), 'borrar')
  assert.equal(decisionRetencion({ actualizadoAt: T }, { etapa: 'en_camino' }, T + 1000), 'esperar')
})

test('resumen: km y minutos', () => {
  const r = resumen([{ lat: 6.25, lng: -75.6, t: T }, { lat: 6.26, lng: -75.6, t: T + 10 * 60000 }])
  assert.equal(r.minutos, 10)
  assert.ok(r.km > 1.0 && r.km < 1.2, String(r.km))
})
