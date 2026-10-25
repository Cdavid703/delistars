import { test } from 'node:test'
import assert from 'node:assert/strict'
import { opcionesCatalogo, vendibles, seleccionInicial, precioUnidad, faltantes, itemApi, resumenItem } from '../src/utils/catalogoCaja.js'

const ficha = (x = {}) => ({ bebidaCombo: null, porUnidad: false, opcion: null, admiteAdiciones: true, admiteSalsas: true, ...x })
const reglas = (x = {}) => ({ visible: true, esOpcion: false, soloSedes: null, promo: null, ficha: ficha(x.ficha), ...x, ficha: ficha(x.ficha) })
const perro = { id_producto: 1, nombre_producto: 'Perro', precio_venta: '17000', id_categoria: 2, presentations: [], reglas: reglas() }
const combo = { id_producto: 2, nombre_producto: 'Combo', precio_venta: '30000', id_categoria: 4, presentations: [], reglas: reglas({ ficha: { bebidaCombo: ['Coca Cola', 'Uva'], opcion: { titulo: 'queso o tocineta', items: ['Queso', 'Tocineta'] } } }) }
const jugo = { id_producto: 3, nombre_producto: 'Jugo', precio_venta: '0', id_categoria: 7, presentations: [{ id_presentacion: 30, sabor: 'Mora', tamano: 'Grande', precio_venta: 8000 }], reglas: reglas({ soloSedes: ['santa_teresita'] }) }
const queso = { id_producto: 9, nombre_producto: 'Queso', precio_venta: '2000', id_categoria: 5, presentations: [], reglas: reglas({ esOpcion: true }) }
const cebolla = { id_producto: 10, nombre_producto: 'Cebolla', precio_venta: '0', id_categoria: 5, presentations: [], reglas: reglas({ esOpcion: true }) }
const rosada = { id_producto: 20, nombre_producto: 'Rosada', precio_venta: '0', id_categoria: 8, presentations: [], reglas: reglas({ esOpcion: true }) }
const todos = [perro, combo, jugo, queso, cebolla, rosada]

test('catálogo de la caja: qué se vende en la sede y qué opciones hay', () => {
  assert.deepEqual(vendibles(todos, 'santa_lucia').map((p) => p.id_producto), [1, 2])
  assert.deepEqual(vendibles(todos, 'santa_teresita').map((p) => p.id_producto), [1, 2, 3])
  const o = opcionesCatalogo(todos, new Set([20]))
  assert.deepEqual([o.adiciones.map((x) => x.id_producto), o.cebollas.map((x) => x.id_producto), o.salsas.length], [[9], [10], 0])
})

test('armar un producto: precio, faltantes y formato de la API', () => {
  const s = { ...seleccionInicial(perro), adiciones: { 9: 2 }, salsas: [20], cebollas: [10], nota: ' sin pepino ' }
  assert.equal(precioUnidad(perro, s, [queso]), 21000)
  assert.deepEqual(faltantes(perro, s), [])
  assert.deepEqual(itemApi(perro, s), { id_producto: 1, cantidad: 1, adiciones: [{ id_producto: 9, cantidad: 2 }], salsas: [20], cebollas: [10], nota: 'sin pepino' })
  assert.equal(resumenItem(perro, s, { 9: 'Queso', 20: 'Rosada', 10: 'Cebolla' }), '+2× Queso · Rosada, Cebolla · «sin pepino»')
  const c = seleccionInicial(combo)
  assert.deepEqual([c.bebida, c.opcion], ['Coca Cola', 'Queso'])
  assert.deepEqual(itemApi(combo, c), { id_producto: 2, cantidad: 1, opcion: 'Queso', bebida: 'Coca Cola' })
  assert.deepEqual(faltantes(combo, { ...c, bebida: '' }), ['Elige la bebida del combo'])
  const j = seleccionInicial(jugo)
  assert.equal(precioUnidad(jugo, j), 8000)
  assert.equal(itemApi(jugo, j).id_presentacion, 30)
})

test('combo de promoción: cada unidad con su bebida', () => {
  const promo = { ...perro, id_producto: 5, reglas: reglas({ promo: { unidades: 2, unidad: 'Perro', bebidas: ['Coca Cola'] } }) }
  const s = seleccionInicial(promo)
  assert.equal(s.unidades.length, 2)
  assert.deepEqual(itemApi(promo, s).unidades, [{ salsas: [], cebollas: [], bebida: 'Coca Cola' }, { salsas: [], cebollas: [], bebida: 'Coca Cola' }])
  assert.deepEqual(faltantes(promo, { ...s, unidades: [{ salsas: [], cebollas: [], bebida: '' }, s.unidades[1]] }), ['Elige la bebida de cada unidad'])
})
