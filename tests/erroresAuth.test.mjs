import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mensajeAuth, esCancelacion, erroresRegistro, faltaVerificarCorreo } from '../src/utils/erroresAuth.js'

test('mensajes en español y uno genérico para lo desconocido', () => {
  assert.equal(mensajeAuth({ code: 'auth/invalid-credential' }), 'El correo o la contraseña no coinciden.')
  assert.match(mensajeAuth({ code: 'auth/email-already-in-use' }), /ya tiene cuenta/)
  assert.equal(mensajeAuth({ code: 'auth/raro' }), 'No se pudo completar. Intenta de nuevo.')
  assert.equal(esCancelacion({ code: 'auth/popup-closed-by-user' }), true)
  assert.equal(esCancelacion({ code: 'auth/invalid-email' }), false)
})

test('registro: nombre, teléfono de 10 dígitos, correo y contraseña de 6+', () => {
  assert.deepEqual(erroresRegistro({ nombre: 'Ana Pérez', telefono: '300 123 4567', email: 'ana@x.com', password: '123456' }), [])
  const e = erroresRegistro({ nombre: 'A', telefono: '123', email: 'ana@', password: '12' })
  assert.equal(e.length, 4)
})

test('verificación: solo las cuentas de correo y contraseña sin confirmar', () => {
  const correo = { isAnonymous: false, emailVerified: false, providerData: [{ providerId: 'password' }] }
  assert.equal(faltaVerificarCorreo(correo), true)
  assert.equal(faltaVerificarCorreo({ ...correo, emailVerified: true }), false)
  assert.equal(faltaVerificarCorreo({ isAnonymous: false, emailVerified: false, providerData: [{ providerId: 'google.com' }] }), false)
  assert.equal(faltaVerificarCorreo({ isAnonymous: true, providerData: [] }), false)
})
