import { test } from 'node:test'
import assert from 'node:assert/strict'
import { sugerirOtraSede, minutosHastaLlegar } from '../src/utils/checkoutRuta.js'

test('sugiere la otra sede si queda al menos 500 m más cerca por calle', () => {
  assert.deepEqual(
    sugerirOtraSede({ kmPropia: 3.1, precioPropio: 7000 }, { km: 1.8, min: 6 }),
    { km: 1.8, min: 6, precio: 5000, ahorro: 2000 },
  )
})

test('no sugiere por diferencias pequeñas', () => {
  assert.equal(sugerirOtraSede({ kmPropia: 2.2, precioPropio: 6000 }, { km: 1.9, min: 6 }), null)
  assert.equal(sugerirOtraSede({ kmPropia: 2.0, precioPropio: 5000 }, { km: 2.5, min: 8 }), null)
})

test('no sugiere una sede que tampoco despacha hasta allá, ni sin datos', () => {
  assert.equal(sugerirOtraSede({ kmPropia: 12, precioPropio: null }, { km: 8, min: 20 }), null)
  assert.equal(sugerirOtraSede({ kmPropia: 3, precioPropio: 6000 }, null), null)
  assert.equal(sugerirOtraSede({ kmPropia: null, precioPropio: 6000 }, { km: 1, min: 3 }), null)
})

test('el ahorro nunca es negativo (misma franja por estar cerca del borde)', () => {
  assert.equal(sugerirOtraSede({ kmPropia: 2.6, precioPropio: 6000 }, { km: 2.05, min: 7 }).ahorro, 0)
})

test('minutos: lo que tarda en salir + el recorrido, redondeado a 5', () => {
  assert.equal(minutosHastaLlegar({ salidaMedianMin: 31, medianMin: 45 }, 9), 40)
  assert.equal(minutosHastaLlegar({ salidaMedianMin: 28, medianMin: 45 }, 4), 30)
})

test('minutos: sin mediana de salida usa la total; sin nada, null; nunca menos de 10', () => {
  assert.equal(minutosHastaLlegar({ medianMin: 42 }, 9), 40)
  assert.equal(minutosHastaLlegar(null, 9), null)
  assert.equal(minutosHastaLlegar({ salidaMedianMin: 2 }, 1), 10)
})
