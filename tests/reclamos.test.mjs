// Pruebas de las reglas de reclamos (§14). Corre con: npm test (node --test)
import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  PLAZO_RECLAMO_MS, CATEGORIAS, ABIERTOS, motivoNoReclamable, puedeReclamar, revisarReclamo, textoParaCliente,
} from '../src/utils/reclamos.js'

const T = 1_700_000_000_000
const entregado = { clientUid: 'u1', status: 'completed', etapa: 'entregado', deliveredAt: T }

test('solo se reclama un pedido entregado, con cuenta y dentro de las 24 horas', () => {
  assert.equal(motivoNoReclamable(entregado, T + 1000), null)
  assert.equal(motivoNoReclamable(entregado, T + PLAZO_RECLAMO_MS - 1), null)
  assert.equal(motivoNoReclamable(entregado, T + PLAZO_RECLAMO_MS + 1), 'vencido')
  assert.equal(motivoNoReclamable({ ...entregado, deliveredAt: undefined }, T), 'vencido')
  assert.equal(motivoNoReclamable({ ...entregado, status: 'in_transit', etapa: 'en_camino' }, T), 'no_entregado')
  assert.equal(motivoNoReclamable({ ...entregado, clientUid: null }, T), 'sin_cuenta')
  assert.equal(puedeReclamar(entregado, T), true)
})

test('la ficha exige categoría conocida, motivo de la lista y una descripción con sustancia', () => {
  assert.deepEqual(revisarReclamo({ categoria: 'producto', motivo: 'Faltó un producto', descripcion: '  Faltó la   gaseosa del combo ' }),
    { categoria: 'producto', motivo: 'Faltó un producto', descripcion: 'Faltó la gaseosa del combo', atiende: 'caja' })
  assert.equal(revisarReclamo({ categoria: 'entrega', motivo: 'Se demoró demasiado', descripcion: 'Llegó una hora tarde y frío' }).atiende, 'admin')
  assert.equal(revisarReclamo({ categoria: 'otra', motivo: 'x', descripcion: 'algo largo aquí' }).error, 'categoria')
  assert.equal(revisarReclamo({ categoria: 'producto', motivo: 'Inventado', descripcion: 'algo largo aquí' }).error, 'motivo')
  assert.equal(revisarReclamo({ categoria: 'producto', motivo: 'Otro', descripcion: 'corto' }).error, 'descripcion')
  assert.equal(revisarReclamo({ categoria: 'producto', motivo: 'Otro', descripcion: 'x'.repeat(801) }).error, 'largo')
})

test('cada categoría tiene quién la atiende y los estados abiertos son los que no terminaron', () => {
  assert.equal(CATEGORIAS.producto.atiende, 'caja')
  assert.equal(CATEGORIAS.entrega.atiende, 'admin')
  assert.deepEqual(ABIERTOS, ['recibido', 'en_revision', 'propuesta'])
  assert.match(textoParaCliente({ estado: 'propuesta' }), /solución/)
})
