// Pruebas de "recuperar mi pedido con el teléfono".
// Corre con: npm test  (node --test, sin dependencias)
import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  normalizarTelefono, telefonoValido, reclamable, VENTANA_RECLAMO_MS,
} from '../src/utils/recuperarPedido.js'

test('el mismo número escrito de varias formas es el mismo cliente', () => {
  for (const t of ['3001234567', '300 123 4567', '+57 300 123 4567', '57 3001234567', '(300) 123-4567']) {
    assert.equal(normalizarTelefono(t), '3001234567', t)
  }
})

test('un número incompleto no sirve para buscar', () => {
  assert.equal(normalizarTelefono('300123'), '')
  assert.equal(telefonoValido('300123'), false)
  assert.equal(telefonoValido(''), false)
  assert.equal(telefonoValido('3001234567'), true)
})

const ahora = Date.now()
const enCurso = { status: 'quoted', createdAt: ahora - 20 * 60 * 1000 }

test('un pedido en curso de hoy se puede recuperar', () => {
  assert.equal(reclamable(enCurso, ahora), true)
})

test('el historial NO se puede recuperar con solo el teléfono', () => {
  for (const s of ['completed', 'delivered_paid', 'pending_cuadre', 'rejected', 'cancelled']) {
    assert.equal(reclamable({ ...enCurso, status: s }, ahora), false, s)
  }
})

test('un pedido viejo tampoco: la ventana es de 24 horas', () => {
  assert.equal(reclamable({ ...enCurso, createdAt: ahora - VENTANA_RECLAMO_MS - 1 }, ahora), false)
  assert.equal(reclamable({ ...enCurso, createdAt: ahora - VENTANA_RECLAMO_MS + 60000 }, ahora), true)
})

test('acepta la fecha como Timestamp de Firestore', () => {
  const t = ahora - 60000
  assert.equal(reclamable({ status: 'pending', createdAt: { toMillis: () => t } }, ahora), true)
})

test('sin fecha no se reclama', () => {
  assert.equal(reclamable({ status: 'pending' }, ahora), false)
  assert.equal(reclamable(null, ahora), false)
})
