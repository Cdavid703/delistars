// Pruebas del catálogo de sonidos y del mapa evento → sonido.
// Lo que de verdad importa acá: que cada evento tenga sonido, que no se
// parezcan entre sí (si suenan igual, no sirve de nada tenerlos separados) y
// que un panel no suene por cosas que no le tocan.
// La reproducción en sí (Web Audio) no se prueba: no existe en node.
// Corre con: npm test  (node --test, sin dependencias)
import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  SONIDOS, SONIDO_CLIENTE, SONIDO_CAJA, SONIDO_DOMICILIARIO, sonidoDeEstado,
} from '../src/utils/sonidos.js'

test('cada sonido está bien formado', () => {
  for (const [nombre, s] of Object.entries(SONIDOS)) {
    assert.ok(Array.isArray(s.seq) && s.seq.length > 0, `${nombre}: sin notas`)
    assert.ok(s.seq.every(f => f > 50 && f < 5000), `${nombre}: frecuencia fuera de lo audible`)
    assert.ok(s.vol > 0 && s.vol <= 1, `${nombre}: volumen raro`)
    assert.ok(s.paso > 0 && s.dur > 0, `${nombre}: tiempos inválidos`)
    assert.ok(['sine', 'square', 'triangle', 'sawtooth'].includes(s.tipo), `${nombre}: timbre inválido`)
  }
})

test('no hay dos eventos que suenen igual', () => {
  // La firma es la melodía + el timbre: si dos eventos coinciden en las dos
  // cosas, el usuario no los puede distinguir de oído.
  const firmas = new Map()
  for (const [nombre, s] of Object.entries(SONIDOS)) {
    const firma = s.tipo + '|' + s.seq.join(',')
    assert.ok(!firmas.has(firma), `${nombre} suena igual que ${firmas.get(firma)}`)
    firmas.set(firma, nombre)
  }
})

test('el aviso de "llegó" es el más largo: el cliente tiene que salir', () => {
  const largo = s => s.seq.length * s.paso
  assert.ok(largo(SONIDOS.llego) > largo(SONIDOS.aceptado))
  assert.ok(largo(SONIDOS.llego) > largo(SONIDOS.entregado))
})

test('los estados que importan tienen sonido en el panel del cliente', () => {
  // Justo los que el negocio reportó como mudos.
  for (const estado of ['quoted', 'in_transit', 'arrived', 'cancelled']) {
    assert.ok(sonidoDeEstado('cliente', estado), `al cliente no le suena ${estado}`)
  }
})

test('todo sonido mapeado existe en el catálogo', () => {
  for (const mapa of [SONIDO_CLIENTE, SONIDO_CAJA, SONIDO_DOMICILIARIO]) {
    for (const [estado, nombre] of Object.entries(mapa)) {
      assert.ok(SONIDOS[nombre], `${estado} apunta a un sonido inexistente: ${nombre}`)
    }
  }
})

test('cada panel suena solo por lo suyo', () => {
  // Al cliente no le importa que el domiciliario acepte la asignación.
  assert.equal(sonidoDeEstado('cliente', 'assigned'), null)
  // A la caja no le suena que el pedido pase a preparación: lo hizo ella misma.
  assert.equal(sonidoDeEstado('caja', 'preparing'), null)
  // Al domiciliario no le importa que le coticen el pedido al cliente.
  assert.equal(sonidoDeEstado('domiciliario', 'quoted'), null)
})

test('un estado desconocido no suena y no revienta', () => {
  assert.equal(sonidoDeEstado('cliente', 'estado_inventado'), null)
  assert.equal(sonidoDeEstado('panel_inventado', 'quoted'), null)
  assert.equal(sonidoDeEstado('cliente', undefined), null)
})

test('cancelar suena distinto de entregar', () => {
  // Son los dos finales de un pedido y no se pueden confundir.
  assert.notEqual(SONIDO_CLIENTE.cancelled, SONIDO_CLIENTE.completed)
  const cancel = SONIDOS[SONIDO_CLIENTE.cancelled]
  const ok = SONIDOS[SONIDO_CLIENTE.completed]
  assert.notEqual(cancel.tipo, ok.tipo, 'deberían tener timbres distintos')
})
