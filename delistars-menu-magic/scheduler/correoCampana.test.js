const { test } = require('node:test')
const assert = require('node:assert/strict')
const { armarCorreo, firmar, personalizar } = require('./correoCampana')

const campana = {
  asunto: '🍔 ¡Llegó la quincena, {nombre}!',
  mensaje: 'Hola, {nombre} 👋\n\n2 hamburguesas <especiales> por $52.900.\nSolo del 15 al 17.',
  imagenUrl: 'https://firebasestorage.googleapis.com/x.jpg',
  botonTexto: '¡QUIERO MI COMBO!',
  botonUrl: 'https://delistars.com/?combo=combo-quincena',
}
const cliente = { uid: 'uid123', email: 'ana@x.com', name: 'Ana María Pérez' }

test('arma el correo con nombre, imagen, botón y enlace de baja firmado', () => {
  const m = armarCorreo(campana, cliente, 'clave')
  assert.equal(m.to, 'ana@x.com')
  assert.equal(m.subject, '🍔 ¡Llegó la quincena, Ana!')
  assert.match(m.html, /Hola, Ana 👋/)
  assert.match(m.html, /&lt;especiales&gt;/)               // el texto se escapa
  assert.match(m.html, /\$52\.900\.<br>Solo del 15 al 17/)  // saltos de línea
  assert.match(m.html, /href="https:\/\/delistars\.com\/\?combo=combo-quincena"/)
  assert.match(m.html, /firebasestorage\.googleapis\.com\/x\.jpg/)
  const baja = `https://delistars.com/api/v1/mercadeo/baja?u=uid123&t=${firmar('uid123', 'clave')}`
  assert.ok(m.html.includes(baja) && m.text.includes(baja))
  assert.equal(m.headers['List-Unsubscribe-Post'], 'List-Unsubscribe=One-Click')
  assert.match(m.headers['List-Unsubscribe'], /mercadeo\/baja/)
})

test('sin nombre del cliente, {nombre} desaparece sin dejar coma suelta', () => {
  assert.equal(personalizar('Hola, {nombre} 👋', { name: '' }), 'Hola 👋')
  assert.equal(personalizar('¡Llegó la quincena, {nombre}!', {}), '¡Llegó la quincena!')
})

test('sin imagen ni botón válidos, no los pone', () => {
  const m = armarCorreo({ ...campana, imagenUrl: '', botonUrl: 'javascript:alert(1)' }, cliente, 'clave')
  assert.doesNotMatch(m.html, /firebasestorage/)
  assert.doesNotMatch(m.html, /javascript:/)
})
