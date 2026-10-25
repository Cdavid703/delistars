import { test } from 'node:test'
import assert from 'node:assert/strict'
import { agotadosDelCarrito, nombresAgotados } from '../src/utils/agotados.js'

test('agotado por sede: encuentra el producto o sus opciones agotadas en el carrito', () => {
  const items = [
    { id_producto: 1, cantidad: 1, adiciones: [{ id_producto: 9, cantidad: 1 }], salsas: [20] },
    { id_producto: 2, cantidad: 2, unidades: [{ salsas: [21], cebollas: [30] }] },
  ]
  assert.deepEqual(agotadosDelCarrito(items, new Set()), [])
  assert.deepEqual(agotadosDelCarrito(items, new Set([1])), [1])
  assert.deepEqual(agotadosDelCarrito(items, new Set([9, 30, 99])).sort(), [30, 9].sort())
  assert.deepEqual(agotadosDelCarrito(items, new Set([20, 21])).sort(), [20, 21])
  assert.equal(nombresAgotados([1, 7], { 1: 'Perro Clásico' }), 'Perro Clásico, un producto')
})
