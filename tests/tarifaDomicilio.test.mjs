// Pruebas de la tarifa del domicilio. Los bordes de cada banda son lo que más
// importa: un kilómetro exacto tiene que cobrar la banda de abajo, y pasar de
// 5 km tiene que rechazar el domicilio, no cobrar el precio más alto.
// Corre con: npm test  (node --test, sin dependencias)
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { precioDomicilio, explicarTarifa, tablaTarifas, MAX_KM, TARIFAS } from '../src/utils/tarifaDomicilio.js'

const precio = km => precioDomicilio(km).precio

test('cada banda cobra lo suyo', () => {
  assert.equal(precio(0),    4000)
  assert.equal(precio(0.5),  4000)
  assert.equal(precio(1.5),  5000)
  assert.equal(precio(2.5),  6000)
  assert.equal(precio(3.5),  7000)
  assert.equal(precio(4.5),  8000)
})

test('el domicilio NUNCA es gratis, así el cliente esté al lado', () => {
  // Regla del negocio: aunque sean 50 metros, el domicilio vale $4.000.
  for (const km of [0, 0.001, 0.05, 0.1, 0.3]) {
    const r = precioDomicilio(km)
    assert.equal(r.estado, 'ok', `a ${km} km debería haber precio`)
    assert.equal(r.precio, 4000, `a ${km} km el domicilio no puede bajar de $4.000`)
  }
  // Y ninguna banda puede valer cero.
  for (const t of TARIFAS) assert.ok(t.precio > 0, 'hay una banda en cero')
})

test('los bordes exactos pagan la banda de abajo', () => {
  // "hasta 0,8 km son $4.000": 0.8 exacto es $4.000, no $5.000.
  assert.equal(precio(0.8), 4000)
  assert.equal(precio(2),   5000)
  assert.equal(precio(3),   6000)
  assert.equal(precio(4),   7000)
  assert.equal(precio(5),   8000)
})

test('un pelo por encima del borde sube de banda', () => {
  assert.equal(precio(0.801), 5000)
  assert.equal(precio(2.001), 6000)
  assert.equal(precio(5.001), null)
})

test('entre 0,8 y 1 km ya se cobra $5.000', () => {
  // El cambio que pidió el negocio: antes la primera banda llegaba a 1 km.
  // Un cliente a 900 metros pasa de $4.000 a $5.000.
  assert.equal(precio(0.85), 5000)
  assert.equal(precio(0.9),  5000)
  assert.equal(precio(1),    5000)
})

test('más de 5 km no se despacha: se ofrece recoger en sede', () => {
  const r = precioDomicilio(6)
  assert.equal(r.estado, 'fuera_de_rango')
  assert.equal(r.precio, null)
  assert.equal(r.maxKm, MAX_KM)
})

test('sin distancia no inventa precio: lo cotiza la caja', () => {
  for (const v of [null, undefined, NaN, -1, 'lejos', {}]) {
    const r = precioDomicilio(v)
    assert.equal(r.estado, 'desconocido', `falló con ${JSON.stringify(v)}`)
    assert.equal(r.precio, null)
  }
})

test('la tabla no deja huecos ni se solapa', () => {
  const filas = tablaTarifas()
  assert.equal(filas[0].desde, 0)
  for (let i = 1; i < filas.length; i++) {
    assert.equal(filas[i].desde, filas[i - 1].hasta, 'hay un hueco entre bandas')
  }
  assert.equal(filas[filas.length - 1].hasta, MAX_KM)
})

test('los precios suben con la distancia, nunca bajan', () => {
  for (let i = 1; i < TARIFAS.length; i++) {
    assert.ok(TARIFAS[i].precio > TARIFAS[i - 1].precio, 'una banda más lejana cobra menos')
  }
})

test('la explicación le dice al cliente por qué paga eso', () => {
  assert.match(explicarTarifa(precioDomicilio(1.4), 1.4), /1\.4 km/)
  assert.match(explicarTarifa(precioDomicilio(7), 7), /solo llegamos hasta 5 km/)
  assert.match(explicarTarifa(precioDomicilio(null), null), /No pudimos ubicar/)
})

test('la tabla es la que definió el negocio', () => {
  // Blindaje: si alguien cambia un precio sin querer, esta prueba lo canta.
  assert.deepEqual(TARIFAS, [
    { hasta: 0.8, precio: 4000 },
    { hasta: 2, precio: 5000 },
    { hasta: 3, precio: 6000 },
    { hasta: 4, precio: 7000 },
    { hasta: 5, precio: 8000 },
  ])
})
