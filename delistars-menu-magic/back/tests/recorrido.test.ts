// Pruebas del cálculo por recorrido. Google se simula: nunca se llama de verdad.
import { describe, it, expect } from 'vitest'
import { RecorridoService, puntoValido } from '../src/modules/modulo_rutas/services/recorrido.service'

const TERESITA = { lat: 6.2508, lng: -75.6069 }
const CLIENTE = { lat: 6.2559, lng: -75.6164 }

/** fetch falso que cuenta llamadas y responde `metros`. */
function googleFalso(metros: number | null = 2880, status = 200) {
  const llamadas: any[] = []
  const fetchFn = async (url: string, init: any) => {
    llamadas.push({ url, init })
    return {
      ok: status === 200,
      status,
      json: async () => (metros === null ? { routes: [] } : { routes: [{ distanceMeters: metros }] }),
    }
  }
  return { fetchFn, llamadas }
}

describe('recorrido por Google', () => {
  it('devuelve los km por calle', async () => {
    const g = googleFalso(2880)
    const s = new RecorridoService({ apiKey: 'k', fetchFn: g.fetchFn })
    expect(await s.medir(TERESITA, CLIENTE)).toEqual({ ok: true, km: 2.88, cache: false })
  })

  it('pide la ruta básica en carro sin tráfico y solo la distancia (tarifa Essentials)', async () => {
    const g = googleFalso()
    await new RecorridoService({ apiKey: 'k', fetchFn: g.fetchFn }).medir(TERESITA, CLIENTE)
    const { init } = g.llamadas[0]
    const body = JSON.parse(init.body)
    expect(body.travelMode).toBe('DRIVE')
    expect(body.routingPreference).toBe('TRAFFIC_UNAWARE')
    expect(init.headers['X-Goog-FieldMask']).toBe('routes.distanceMeters')
    expect(init.headers['X-Goog-Api-Key']).toBe('k')
  })

  it('el mismo par de puntos no se vuelve a consultar (caché)', async () => {
    const g = googleFalso()
    const s = new RecorridoService({ apiKey: 'k', fetchFn: g.fetchFn })
    await s.medir(TERESITA, CLIENTE)
    const r = await s.medir({ ...TERESITA }, { lat: CLIENTE.lat + 0.00001, lng: CLIENTE.lng })
    expect(r).toEqual({ ok: true, km: 2.88, cache: true })
    expect(g.llamadas).toHaveLength(1)
  })

  it('sin llave no llama a Google', async () => {
    const g = googleFalso()
    const s = new RecorridoService({ apiKey: '', fetchFn: g.fetchFn })
    expect(await s.medir(TERESITA, CLIENTE)).toEqual({ ok: false, motivo: 'sin_llave' })
    expect(g.llamadas).toHaveLength(0)
  })

  it('rechaza puntos fuera de Medellín o mal formados', async () => {
    const g = googleFalso()
    const s = new RecorridoService({ apiKey: 'k', fetchFn: g.fetchFn })
    for (const malo of [null, {}, { lat: 'a', lng: 1 }, { lat: 4.6, lng: -74.08 } /* Bogotá */]) {
      expect(await s.medir(TERESITA, malo)).toEqual({ ok: false, motivo: 'invalido' })
    }
    expect(g.llamadas).toHaveLength(0)
    expect(puntoValido(CLIENTE)).toBe(true)
  })

  it('respeta el tope diario y lo reinicia al día siguiente en Colombia', async () => {
    const g = googleFalso()
    let ahora = Date.parse('2026-10-09T12:00:00Z')
    const s = new RecorridoService({ apiKey: 'k', fetchFn: g.fetchFn, maxDiarias: 2, ahora: () => ahora })
    const punto = (i: number) => ({ lat: 6.25 + i * 0.001, lng: -75.6 })
    expect((await s.medir(TERESITA, punto(1), 'a')).ok).toBe(true)
    expect((await s.medir(TERESITA, punto(2), 'b')).ok).toBe(true)
    expect(await s.medir(TERESITA, punto(3), 'c')).toEqual({ ok: false, motivo: 'tope_diario' })
    // Lo que ya está en caché sigue sirviendo aunque se llegó al tope.
    expect((await s.medir(TERESITA, punto(1), 'c')).ok).toBe(true)
    // 4:59 a. m. UTC del 10 = 11:59 p. m. del 9 en Colombia: sigue el tope.
    ahora = Date.parse('2026-10-10T04:59:00Z')
    expect((await s.medir(TERESITA, punto(3), 'c')).ok).toBe(false)
    ahora = Date.parse('2026-10-10T05:01:00Z')
    expect((await s.medir(TERESITA, punto(3), 'c')).ok).toBe(true)
    expect(g.llamadas).toHaveLength(3)
  })

  it('una sola IP no puede gastarse el tope del día', async () => {
    const g = googleFalso()
    const s = new RecorridoService({ apiKey: 'k', fetchFn: g.fetchFn })
    let ultimo: any
    for (let i = 0; i < 61; i++) ultimo = await s.medir(TERESITA, { lat: 6.2 + i * 0.001, lng: -75.6 }, '1.2.3.4')
    expect(ultimo).toEqual({ ok: false, motivo: 'tope_ip' })
    expect((await s.medir(TERESITA, CLIENTE, '5.6.7.8')).ok).toBe(true)
  })

  it('si Google falla o no encuentra ruta, responde sin distancia', async () => {
    expect(await new RecorridoService({ apiKey: 'k', fetchFn: googleFalso(2880, 403).fetchFn }).medir(TERESITA, CLIENTE))
      .toEqual({ ok: false, motivo: 'google' })
    expect(await new RecorridoService({ apiKey: 'k', fetchFn: googleFalso(null).fetchFn }).medir(TERESITA, CLIENTE))
      .toEqual({ ok: false, motivo: 'google' })
    const caido = async () => { throw new Error('ECONNRESET') }
    expect(await new RecorridoService({ apiKey: 'k', fetchFn: caido }).medir(TERESITA, CLIENTE))
      .toEqual({ ok: false, motivo: 'google' })
  })
})
