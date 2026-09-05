// Pruebas del pin que llega por WhatsApp y del mensaje para pedirlo.
// Los formatos de aquí son los reales: lo que manda WhatsApp al compartir
// ubicación, lo que copia el domiciliario de Google Maps en el celular, y lo
// que pega mal (enlace corto, coordenadas de otra ciudad).
// Corre con: npm test  (node --test, sin dependencias)
import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  parseUbicacion, revisarUbicacion, dentroDeMedellin, esEnlaceCorto,
  mensajePedirUbicacion, waNumero, linkPedirUbicacion,
} from '../src/utils/geoLink.js'

const cerca = (a, b) => Math.abs(a - b) < 0.0001

test('ubicación compartida por WhatsApp', () => {
  const c = parseUbicacion('https://maps.google.com/?q=6.244203,-75.581215')
  assert.ok(c && cerca(c.lat, 6.244203) && cerca(c.lng, -75.581215))
})

test('enlace de búsqueda de Google Maps', () => {
  const c = parseUbicacion('https://www.google.com/maps/search/?api=1&query=6.2510,-75.5900')
  assert.ok(c && cerca(c.lat, 6.251) && cerca(c.lng, -75.59))
})

test('enlace con las coordenadas en la ruta (/@lat,lng,zoom)', () => {
  const c = parseUbicacion('https://www.google.com/maps/place/Delistars/@6.2397,-75.6111,17z/data=!3m1')
  assert.ok(c && cerca(c.lat, 6.2397) && cerca(c.lng, -75.6111))
})

test('Apple Maps (iPhone)', () => {
  const c = parseUbicacion('https://maps.apple.com/?ll=6.2442,-75.5812&q=Ubicaci%C3%B3n')
  assert.ok(c && cerca(c.lat, 6.2442) && cerca(c.lng, -75.5812))
})

test('geo: de Android', () => {
  const c = parseUbicacion('geo:6.2442,-75.5812')
  assert.ok(c && cerca(c.lat, 6.2442))
})

test('coordenadas pegadas sueltas', () => {
  const c = parseUbicacion('6.244203, -75.581215')
  assert.ok(c && cerca(c.lat, 6.244203) && cerca(c.lng, -75.581215))
})

test('texto con el mensaje completo alrededor del enlace', () => {
  const pegado = 'Mi ubicación: https://maps.google.com/?q=6.2500,-75.5700 gracias!'
  const c = parseUbicacion(pegado)
  assert.ok(c && cerca(c.lat, 6.25))
})

test('una dirección escrita no trae coordenadas', () => {
  assert.equal(parseUbicacion('Calle 44 B #70 A-23, Laureles'), null)
  assert.equal(parseUbicacion(''), null)
  assert.equal(parseUbicacion(null), null)
})

test('el enlace corto se detecta y se explica cómo arreglarlo', () => {
  assert.ok(esEnlaceCorto('https://maps.app.goo.gl/AbCdEf123'))
  const r = revisarUbicacion('https://maps.app.goo.gl/AbCdEf123')
  assert.equal(r.nivel, 'error')
  assert.equal(r.coords, null)
  assert.match(r.mensaje, /corto/i)
})

test('un pin fuera de Medellín pasa pero con aviso', () => {
  // Bogotá
  const r = revisarUbicacion('https://maps.google.com/?q=4.7110,-74.0721')
  assert.equal(r.nivel, 'aviso')
  assert.ok(r.coords)
  assert.match(r.mensaje, /fuera de Medell/i)
})

test('un pin de Medellín queda listo', () => {
  const r = revisarUbicacion('https://maps.google.com/?q=6.2442,-75.5812')
  assert.equal(r.nivel, 'ok')
  assert.ok(dentroDeMedellin(r.coords))
})

test('lat/lng invertidas caen fuera del rango y avisan', () => {
  // -75.58, 6.24 en vez de 6.24, -75.58
  const r = revisarUbicacion('-75.5812, 6.2442')
  assert.equal(r.nivel, 'aviso')
})

test('el mensaje saluda por el nombre y dice quién escribe', () => {
  const m = mensajePedirUbicacion({ cliente: 'maría gonzález', domiciliario: 'José Luis Martínez', pedido: 142 })
  assert.match(m, /¡Hola María!/)
  assert.match(m, /Soy José, del equipo de domicilios de DeliStars\./)
  assert.match(m, /pedido #142/)
  assert.match(m, /ubicación/i)
  assert.match(m, /Ubicación\*/) // la instrucción de cómo mandarla
})

test('el mensaje aguanta que falten datos', () => {
  const m = mensajePedirUbicacion({})
  assert.match(m, /¡Hola!/)
  assert.match(m, /DeliStars/)
  assert.ok(!m.includes('#'), 'no debe quedar un "#" suelto sin número')
  assert.ok(!m.includes('undefined'))
})

test('el número queda en el formato de wa.me', () => {
  assert.equal(waNumero('3135065720'), '573135065720')
  assert.equal(waNumero('313 506 5720'), '573135065720')
  assert.equal(waNumero('+57 313 506 5720'), '573135065720')
  assert.equal(waNumero('573135065720'), '573135065720')
  assert.equal(waNumero(''), '')
})

test('el enlace de WhatsApp lleva número y mensaje', () => {
  const url = linkPedirUbicacion({ telefono: '3135065720', cliente: 'Carlos', domiciliario: 'Valentina', pedido: 7 })
  assert.ok(url.startsWith('https://wa.me/573135065720?text='))
  const texto = decodeURIComponent(url.split('text=')[1])
  assert.match(texto, /¡Hola Carlos!/)
  assert.match(texto, /Soy Valentina/)
})
