// Pruebas del borrador del pedido de la caja (§21.1).
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { lineasParaGuardar, recuperarLineas, borradorVigente, VIGENCIA_BORRADOR_MS } from '../src/utils/borradorCaja.js'

const perro = { id_producto: 1, nombre_producto: 'Perro', precio_venta: '17000', id_categoria: 2, presentations: [] }
const combo = { id_producto: 2, nombre_producto: 'Combo', precio_venta: '30000', id_categoria: 4, presentations: [] }
const sel = { cantidad: 2, adiciones: {} }

test('guarda id, cómo se armó y el precio por unidad de ese momento', () => {
  assert.deepEqual(lineasParaGuardar([{ p: perro, sel }], []), [{ id: 1, nombre: 'Perro', sel, unidad: 17000 }])
})

test('al recuperarlo señala cambios de precio, agotados y lo que ya no está', () => {
  const guardadas = lineasParaGuardar([{ p: perro, sel }, { p: combo, sel }], [])
  const menuNuevo = [{ ...perro, precio_venta: '18000' }]
  const r = recuperarLineas([...guardadas], menuNuevo, [], new Set([1]))
  assert.equal(r.lineas.length, 1)
  assert.equal(r.lineas[0].p.precio_venta, '18000') // con el menú de ahora
  assert.deepEqual(r.cambios, ['Perro: $17.000 → $18.000', 'Se agotó: Perro', 'Ya no está en el menú: Combo (lo quitamos)'].sort((a, b) => r.cambios.indexOf(a) - r.cambios.indexOf(b)))
  assert.equal(r.cambios.length, 3)
})

test('sin cambios no avisa nada; el borrador vence a las 12 h', () => {
  assert.deepEqual(recuperarLineas(lineasParaGuardar([{ p: perro, sel }], []), [perro], []).cambios, [])
  const b = { at: 1000, lineas: [{}] }
  assert.equal(borradorVigente(b, 1000 + VIGENCIA_BORRADOR_MS - 1), true)
  assert.equal(borradorVigente(b, 1000 + VIGENCIA_BORRADOR_MS + 1), false)
  assert.equal(borradorVigente({ at: 1000, lineas: [], cliente: { nombre: '' } }, 2000), false)
})
