const { test } = require('node:test')
const assert = require('node:assert/strict')
const { mensajeDelDia, actividadesDelDia, hoyColombia } = require('./mercadeoAviso')

const acts = [
  { titulo: 'Promo 2x1 perros', tipo: 'promocion', inicio: '2026-10-13', fin: '2026-10-15', sede: 'ambas', estado: 'planeada', responsable: 'Valentina' },
  { titulo: 'Post Instagram', tipo: 'redes', inicio: '2026-10-13', fin: '2026-10-13', sede: 'santa_lucia', estado: 'en_curso' },
  { titulo: 'Volanteo', tipo: 'volanteo', inicio: '2026-10-13', fin: '2026-10-13', sede: 'santa_teresita', estado: 'cancelada' },
  { titulo: 'Ya hecha', tipo: 'otro', inicio: '2026-10-13', fin: '2026-10-13', sede: 'ambas', estado: 'hecha' },
  { titulo: 'Otro día', tipo: 'evento', inicio: '2026-10-20', fin: '2026-10-20', sede: 'ambas', estado: 'planeada' },
]

test('lista lo que hay hoy, sin canceladas ni hechas, con tipo, sede y responsable', () => {
  const m = mensajeDelDia(acts, '2026-10-13')
  assert.equal(m.title, '📣 Mercadeo hoy: 2 actividades')
  assert.equal(m.body, '• Post Instagram — Redes · Santa Lucía\n• Promo 2x1 perros (hasta el 15/10) — Promoción · ambas sedes · Valentina')
})

test('una actividad de varios días aparece cada día del rango', () => {
  assert.equal(actividadesDelDia(acts, '2026-10-14').map((a) => a.titulo).join(), 'Promo 2x1 perros')
  assert.equal(actividadesDelDia(acts, '2026-10-16').length, 0)
})

test('sin actividades no hay aviso', () => {
  assert.equal(mensajeDelDia(acts, '2026-10-01'), null)
})

test('el día es el de Colombia: 2 a. m. UTC del 14 sigue siendo el 13 allá', () => {
  assert.equal(hoyColombia(Date.parse('2026-10-14T02:00:00Z')), '2026-10-13')
  assert.equal(hoyColombia(Date.parse('2026-10-14T06:00:00Z')), '2026-10-14')
})
