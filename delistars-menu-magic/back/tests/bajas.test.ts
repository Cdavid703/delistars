import { describe, it, expect } from 'vitest'
import { firmar, firmaValida } from '../src/modules/modulo_mercadeo/services/bajas.service'

describe('firma de los enlaces para darse de baja', () => {
  const clave = 'secreto-de-prueba'
  it('la firma del uid es válida y corta', () => {
    const f = firmar('uid_ABC123', clave)
    expect(f).toHaveLength(22)
    expect(firmaValida('uid_ABC123', f, clave)).toBe(true)
  })
  it('no sirve para otro uid ni con otra clave', () => {
    const f = firmar('uid_ABC123', clave)
    expect(firmaValida('uid_OTRO99', f, clave)).toBe(false)
    expect(firmaValida('uid_ABC123', f, 'otra-clave')).toBe(false)
  })
  it('sin clave configurada o con datos raros, nunca es válida', () => {
    expect(firmaValida('uid_ABC123', firmar('uid_ABC123', ''), '')).toBe(false)
    expect(firmaValida(undefined, 'x', clave)).toBe(false)
    expect(firmaValida('uid con espacios', firmar('uid con espacios', clave), clave)).toBe(false)
  })
})
