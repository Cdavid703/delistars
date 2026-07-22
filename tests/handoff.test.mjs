// Pruebas del parseo del handoff (menú → domicilios). Cubren los bugs reales
// que llegaron a producción: totales viejos precargados en la caja y totales
// pre-agregados en los que se confiaba a ciegas.
// Corre con: npm test  (node --test, sin dependencias)
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { parseHandoff, handoffItemLine, HANDOFF_TTL_MS } from '../src/utils/handoff.js'

const NOW = 1_800_000_000_000

const freshHandoff = (extra = {}) => JSON.stringify({
  savedAt: NOW - 60_000, // hace 1 minuto
  total: 999,            // total "sospechoso": NUNCA debe usarse si hay unitPrice
  items: [
    { name: 'Perro DeliStar', quantity: 2, unitPrice: 14900, addons: [], salsas: [], cebollas: [], notes: '' },
    { name: 'Hamburguesa Sencilla', quantity: 1, unitPrice: 17000, addons: ['Adición + queso'], salsas: [], cebollas: [], notes: '' },
  ],
  ...extra,
})

test('handoff fresco: total RECALCULADO de los ítems, no el guardado', () => {
  const r = parseHandoff(freshHandoff(), NOW)
  assert.equal(r.total, 2 * 14900 + 17000) // 46.800 — ignora el 999
})

test('handoff fresco: cada línea lleva su precio para la caja', () => {
  const r = parseHandoff(freshHandoff(), NOW)
  assert.match(r.lines[0], /^2x Perro DeliStar \(= \$29.800\)$/)
  assert.match(r.lines[1], /Adición \+ queso.*\(= \$17.000\)/)
})

test('handoff caducado (más de 6h): se marca stale para que el llamador lo borre', () => {
  const old = freshHandoff({ savedAt: NOW - HANDOFF_TTL_MS - 1 })
  assert.deepEqual(parseHandoff(old, NOW), { stale: true })
})

test('handoff sin savedAt (formato viejo pre-deploy): también stale', () => {
  const legacy = freshHandoff({ savedAt: undefined })
  assert.deepEqual(parseHandoff(legacy, NOW), { stale: true })
})

test('sin unitPrice en los ítems: cae al total guardado y no inventa precios', () => {
  const raw = JSON.stringify({
    savedAt: NOW,
    total: 52000,
    items: [{ name: 'Combo', quantity: 1, addons: [], salsas: [], cebollas: [], notes: '' }],
  })
  const r = parseHandoff(raw, NOW)
  assert.equal(r.total, 52000)
  assert.equal(r.lines[0], '1x Combo') // sin sufijo de precio
})

test('entradas inválidas devuelven null (ausente, corrupto, vacío)', () => {
  assert.equal(parseHandoff(null, NOW), null)
  assert.equal(parseHandoff('{corrupto', NOW), null)
  assert.equal(parseHandoff(JSON.stringify({ savedAt: NOW, items: [] }), NOW), null)
})

test('la línea conserva salsas, cebolla y notas en el orden que ve la caja', () => {
  const line = handoffItemLine({
    name: 'Perro Mexicano', quantity: 1, unitPrice: 15900,
    addons: ['Adición + tocineta'], salsas: ['BBQ', 'Rosada'], cebollas: ['Caramelizada'],
    notes: 'sin jalapeños',
  })
  assert.equal(
    line,
    '1x Perro Mexicano (Adición + tocineta) | Salsas: BBQ, Rosada | Cebolla: Caramelizada — "sin jalapeños" (= $15.900)',
  )
})
