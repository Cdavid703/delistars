// Corre con: node --test   (desde delistars-menu-magic/scheduler)
const { test } = require('node:test')
const assert = require('node:assert/strict')
const { pushActiva, franjaActiva, vencida, cupoLibre, siguiente, enlaceDestino, faltantesProgramar, H24 } = require('./promos')

const T = Date.parse('2026-10-24T20:00:00Z')
const camp = (extra = {}) => ({
  canales: { push: true }, programada: true, pausada: false,
  vigencia: { inicio: T - 3600000, fin: T + 2 * 3600000 }, push: { titulo: 'Martes de perros', texto: '2x1 hoy' }, ...extra,
})

test('solo se envía dentro de la vigencia, programada y sin pausa', () => {
  assert.equal(pushActiva(camp(), T), true)
  assert.equal(pushActiva(camp({ pausada: true }), T), false)
  assert.equal(pushActiva(camp({ programada: false }), T), false)
  assert.equal(pushActiva(camp(), T + 3 * 3600000), false)
  assert.equal(pushActiva(camp(), T - 2 * 3600000), false)
  assert.equal(pushActiva(camp({ canales: { franja: true } }), T), false)
  assert.equal(vencida(camp(), T + 2 * 3600000), true)
})

test('la franja va por sede y no necesita notificación', () => {
  const f = camp({ canales: { franja: true }, sedeId: 'santa_lucia', franja: { texto: 'Hoy 2x1' } })
  assert.equal(franjaActiva(f, 'santa_lucia', T), true)
  assert.equal(franjaActiva(f, 'santa_teresita', T), false)
  assert.equal(franjaActiva({ ...f, sedeId: '' }, 'santa_teresita', T), true)
})

test('una promoción cada 24 h por cuenta (ventana, no medianoche)', () => {
  assert.equal(cupoLibre(null, T), true)
  assert.equal(cupoLibre(T - H24 + 60000, T), false)
  assert.equal(cupoLibre(T - H24, T), true)
})

test('en cola: primero la que vence antes; empate, la que más lleva esperando; nada vencido ni pausado', () => {
  const campanas = {
    a: camp({ vigencia: { inicio: T - 1, fin: T + 5 * 3600000 } }),
    b: camp({ vigencia: { inicio: T - 1, fin: T + 1 * 3600000 } }),
    c: camp({ vigencia: { inicio: T - 1, fin: T + 1 * 3600000 } }),
    d: camp({ pausada: true, vigencia: { inicio: T - 1, fin: T + 600000 } }),
  }
  const items = [{ campanaId: 'a', creadoAt: 1 }, { campanaId: 'c', creadoAt: 5 }, { campanaId: 'b', creadoAt: 9 }, { campanaId: 'd', creadoAt: 0 }]
  assert.equal(siguiente(items, campanas, T).campanaId, 'c')
  assert.equal(siguiente([{ campanaId: 'd' }], campanas, T), null)
})

test('enlace del destino y lo que falta para programar', () => {
  assert.equal(enlaceDestino({ sedeId: 'santa_lucia', destino: { tipo: 'producto', id: 12 } }, 'x1'), 'https://delistars.com/?campana=x1&sede=santa_lucia&producto=12')
  assert.equal(enlaceDestino({ destino: { tipo: 'premios' } }, 'x2'), 'https://delistars.com/domicilios/?campana=x2&premios=1')
  assert.equal(enlaceDestino({ destino: { tipo: 'menu' } }, 'x3'), 'https://delistars.com/?campana=x3')
  assert.deepEqual(faltantesProgramar(camp()), [])
  assert.deepEqual(faltantesProgramar({ canales: { push: true } }), ['la fecha y hora de inicio y de fin', 'el título de la notificación', 'el texto de la notificación'])
  assert.ok(faltantesProgramar(camp({ destino: { tipo: 'producto' } })).includes('el producto del destino'))
})
