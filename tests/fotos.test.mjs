// Pruebas de las fotos de chats y reclamos.
// Corre con: npm test  (node --test, sin dependencias)
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { revisarFoto, revisarFotos, rutaFoto, textoDeMensaje } from '../src/utils/fotos.js'

const B = 'delistars-pruebas.firebasestorage.app'
const foto = (path, bucket = B) => ({ path, url: `https://firebasestorage.googleapis.com/v0/b/${bucket}/o/${encodeURIComponent(path)}?alt=media&token=abc` })

test('una foto de la carpeta del pedido es válida', () => {
  const f = foto(rutaFoto('o1', '1729900000-ab12.jpg'))
  assert.deepEqual(revisarFoto(f, 'o1', B), { foto: { url: f.url, path: f.path } })
})

test('rechaza fotos de otro pedido, otro proyecto o enlaces de afuera', () => {
  assert.deepEqual(revisarFoto(foto('fotos/o2/x.jpg'), 'o1', B), { error: 'foto' })
  assert.deepEqual(revisarFoto(foto('fotos/o1/x.jpg', 'otro-bucket'), 'o1', B), { error: 'foto' })
  assert.deepEqual(revisarFoto({ path: 'fotos/o1/x.jpg', url: 'https://malo.com/x.jpg' }, 'o1', B), { error: 'foto' })
  assert.deepEqual(revisarFoto(foto('fotos/o1/../o2/x.jpg'), 'o1', B), { error: 'foto' })
  assert.deepEqual(revisarFoto(foto('receipts/o1/x.jpg'), 'o1', B), { error: 'foto' })
  assert.deepEqual(revisarFoto(null, 'o1', B), { error: 'foto' })
})

test('reclamo: hasta 3 fotos', () => {
  const tres = [1, 2, 3].map((n) => foto(`fotos/o1/${n}.jpg`))
  assert.equal(revisarFotos(tres, 'o1', B).fotos.length, 3)
  assert.deepEqual(revisarFotos([...tres, foto('fotos/o1/4.jpg')], 'o1', B), { error: 'muchas_fotos' })
  assert.deepEqual(revisarFotos(undefined, 'o1', B), { fotos: [] })
})

test('texto de aviso de un mensaje con foto', () => {
  assert.equal(textoDeMensaje({ text: '', foto: {} }), '📷 Foto')
  assert.equal(textoDeMensaje({ text: 'mira', foto: {} }), '📷 mira')
  assert.equal(textoDeMensaje({ text: 'hola' }), 'hola')
})
