// Pruebas del armado de la dirección estructurada.
// El bug real: la letra pegada al número ("Calle 44B") le sale a Waze y a
// Google Maps como otra dirección, pero es justo la forma que OpenStreetMap
// necesita para devolver el pin correcto. Por eso hay dos textos distintos y
// estas pruebas fijan cuál es cuál.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { LETRAS, buildFormatted, geocodeQuery, fullAddressOf, textoDireccion, barrioDeGoogle } from '../src/utils/address.js'

const dir = (extra = {}) => ({
  tipoVia: 'Calle', viaNum: '44', viaLetra: '', viaOrient: '',
  cruceNum: '70', cruceLetra: '', placa: '23', complemento: '',
  ...extra,
})

test('sin letras: la dirección se arma igual que siempre', () => {
  assert.equal(buildFormatted(dir()), 'Calle 44 #70-23')
})

test('el texto para la caja y el domiciliario separa la letra del número', () => {
  assert.equal(
    buildFormatted(dir({ viaLetra: 'B', cruceLetra: 'A' })),
    'Calle 44 B #70 A-23',
  )
})

test('la consulta al geocodificador SÍ pega la letra (así la indexa OSM)', () => {
  assert.equal(
    geocodeQuery(dir({ viaLetra: 'B', cruceLetra: 'A' })),
    'Calle 44B #70A-23',
  )
})

test('letras dobles: se separan en el texto y se pegan al geocodificar', () => {
  const p = dir({ tipoVia: 'Carrera', viaNum: '80', viaLetra: 'AA', cruceNum: '32', cruceLetra: 'BB', placa: '15' })
  assert.equal(buildFormatted(p), 'Carrera 80 AA #32 BB-15')
  assert.equal(geocodeQuery(p),   'Carrera 80AA #32BB-15')
})

test('la orientación va después de la letra, no pegada a ella', () => {
  assert.equal(
    buildFormatted(dir({ viaLetra: 'B', viaOrient: 'Sur' })),
    'Calle 44 B Sur #70-23',
  )
})

test('las letras dobles que pidió el cliente están disponibles', () => {
  for (const l of ['AA', 'BB', 'AB', 'AC', 'AD']) assert.ok(LETRAS.includes(l), `falta ${l}`)
  assert.equal(LETRAS[0], '', 'la primera opción debe ser "sin letra"')
})

test('el complemento se anexa después de la dirección', () => {
  assert.equal(
    fullAddressOf(dir({ viaLetra: 'B', complemento: ' Apto 501 ' })),
    'Calle 44 B #70-23, Apto 501',
  )
})

test('la dirección escrita en un solo campo manda; las viejas se arman por partes', () => {
  assert.equal(textoDireccion({ texto: ' Calle 44B #70A-23 ' }), 'Calle 44B #70A-23')
  assert.equal(fullAddressOf({ texto: 'Calle 44B #70A-23', complemento: 'Apto 502' }), 'Calle 44B #70A-23, Apto 502')
  assert.equal(textoDireccion(dir()), 'Calle 44 #70-23')
  assert.equal(textoDireccion({ formatted: 'Cra 80 #45-10' }), 'Cra 80 #45-10')
  assert.equal(textoDireccion({}), '')
})

test('el barrio sale de la dirección de Google cuando viene', () => {
  assert.equal(barrioDeGoogle('Cl. 44B #70a-23, San Javier, Medellín, Antioquia, Colombia'), 'San Javier')
  assert.equal(barrioDeGoogle('Cl. 44B #70a-23, Medellín, Antioquia'), '')
  assert.equal(barrioDeGoogle('Medellín, Antioquia'), '')
})

import { marcarFavorita, ordenarLugares } from '../src/utils/address.js'

test('una sola favorita y sale primero', () => {
  const lista = [{ id: 'a', favorita: true }, { id: 'b' }, { id: 'c' }]
  const nueva = marcarFavorita(lista, 'c')
  assert.deepEqual(nueva.map((x) => !!x.favorita), [false, false, true])
  assert.deepEqual(ordenarLugares(nueva).map((x) => x.id), ['c', 'a', 'b'])
  assert.deepEqual(ordenarLugares([{ id: 'a' }, { id: 'b' }]).map((x) => x.id), ['a', 'b'])
})
