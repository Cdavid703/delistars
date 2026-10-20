const { test } = require('node:test')
const assert = require('node:assert/strict')
const { mensajeSolicitud, claveSolicitud } = require('./solicitudAviso')

test('mensaje claro para el admin, con enlace a Usuarios', () => {
  const m = mensajeSolicitud({ nombre: 'Ana Pérez', rol: 'domiciliario', sedeId: 'santa_lucia' })
  assert.equal(m.title, '🙋 Nueva solicitud de acceso')
  assert.equal(m.body, 'Ana Pérez pide acceso de domiciliario en Santa Lucía. Ábrela en Usuarios para aprobarla o rechazarla.')
  assert.equal(m.url, 'https://delistars.com/admin/usuarios')
})

test('cambiar de rol o sede es una solicitud nueva; reescribir la misma no', () => {
  const t = { toMillis: () => 1 }
  const a = claveSolicitud('u1', { rol: 'caja', sedeId: 'santa_lucia', creadaAt: t })
  assert.equal(a, claveSolicitud('u1', { rol: 'caja', sedeId: 'santa_lucia', creadaAt: t }))
  assert.notEqual(a, claveSolicitud('u1', { rol: 'caja', sedeId: 'santa_teresita', creadaAt: t }))
})
