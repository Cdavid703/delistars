// Pruebas del cálculo por recorrido. Google se simula: nunca se llama de verdad.
import { describe, it, expect } from 'vitest'
import { RecorridoService, puntoValido } from '../src/modules/modulo_rutas/services/recorrido.service'

const TERESITA = { lat: 6.2508, lng: -75.6069 }
const CLIENTE = { lat: 6.2559, lng: -75.6164 }

/** fetch falso que cuenta llamadas y responde `metros`. */
function googleFalso(metros: number | null = 2880, status = 200, duration = '754s') {
  const llamadas: any[] = []
  const fetchFn = async (url: string, init: any) => {
    llamadas.push({ url, init })
    return {
      ok: status === 200,
      status,
      json: async () => (metros === null ? { routes: [] } : { routes: [{ distanceMeters: metros, duration }] }),
    }
  }
  return { fetchFn, llamadas }
}

describe('recorrido por Google', () => {
  it('devuelve los km por calle y los minutos', async () => {
    const g = googleFalso(2880)
    const s = new RecorridoService({ apiKey: 'k', fetchFn: g.fetchFn })
    expect(await s.medir(TERESITA, CLIENTE)).toEqual({ ok: true, km: 2.88, min: 13, cache: false })
  })

  it('mismo punto: 0 km y al menos 1 minuto', async () => {
    const fetchFn = async () => ({ ok: true, status: 200, json: async () => ({ routes: [{}] }) })
    expect(await new RecorridoService({ apiKey: 'k', fetchFn }).medir(TERESITA, TERESITA))
      .toEqual({ ok: true, km: 0, min: 1, cache: false })
  })

  it('pide la ruta básica en carro sin tráfico y solo la distancia (tarifa Essentials)', async () => {
    const g = googleFalso()
    await new RecorridoService({ apiKey: 'k', fetchFn: g.fetchFn }).medir(TERESITA, CLIENTE)
    const { init } = g.llamadas[0]
    const body = JSON.parse(init.body)
    expect(body.travelMode).toBe('DRIVE')
    expect(body.routingPreference).toBe('TRAFFIC_UNAWARE')
    expect(init.headers['X-Goog-FieldMask']).toBe('routes.distanceMeters,routes.duration')
    expect(init.headers['X-Goog-Api-Key']).toBe('k')
  })

  it('el mismo par de puntos no se vuelve a consultar (caché)', async () => {
    const g = googleFalso()
    const s = new RecorridoService({ apiKey: 'k', fetchFn: g.fetchFn })
    await s.medir(TERESITA, CLIENTE)
    const r = await s.medir({ ...TERESITA }, { lat: CLIENTE.lat + 0.00001, lng: CLIENTE.lng })
    expect(r).toEqual({ ok: true, km: 2.88, min: 13, cache: true })
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

describe('orden óptimo de entregas', () => {
  const paradas = [
    { id: 'p1', lat: 6.255, lng: -75.61 },
    { id: 'p2', lat: 6.24, lng: -75.6 },
    { id: 'p3', lat: 6.26, lng: -75.62 },
  ]
  const googleOpt = (indices = [2, 0, 1]) => {
    const llamadas: any[] = []
    const fetchFn = async (_url: string, init: any) => {
      llamadas.push(init)
      return {
        ok: true, status: 200,
        json: async () => ({ routes: [{
          optimizedIntermediateWaypointIndex: indices,
          distanceMeters: 8400, duration: '1500s',
          legs: [1, 2, 3, 4].map((i) => ({ distanceMeters: i * 1000, duration: `${i * 120}s` })),
        }] }),
      }
    }
    return { fetchFn, llamadas }
  }

  it('devuelve los pedidos en el orden que propone Google, ida y vuelta a la sede', async () => {
    const g = googleOpt()
    const r = await new RecorridoService({ apiKey: 'k', fetchFn: g.fetchFn }).optimizar(TERESITA, paradas)
    expect(r).toEqual({
      ok: true, orden: ['p3', 'p1', 'p2'], km: 8.4, min: 25,
      tramos: [{ km: 1, min: 2 }, { km: 2, min: 4 }, { km: 3, min: 6 }, { km: 4, min: 8 }],
    })
    const body = JSON.parse(g.llamadas[0].body)
    expect(body.optimizeWaypointOrder).toBe(true)
    expect(body.destination).toEqual(body.origin)
    expect(body.intermediates).toHaveLength(3)
  })

  it('el mismo grupo de pedidos no se vuelve a consultar en 10 minutos', async () => {
    const g = googleOpt()
    const s = new RecorridoService({ apiKey: 'k', fetchFn: g.fetchFn })
    await s.optimizar(TERESITA, paradas)
    await s.optimizar(TERESITA, [...paradas].reverse())
    expect(g.llamadas).toHaveLength(1)
  })

  it('valida: entre 2 y 10 paradas, con id y dentro de Medellín', async () => {
    const g = googleOpt()
    const s = new RecorridoService({ apiKey: 'k', fetchFn: g.fetchFn })
    const mala = (p: unknown) => s.optimizar(TERESITA, p)
    expect(await mala([paradas[0]])).toEqual({ ok: false, motivo: 'invalido' })
    expect(await mala(Array.from({ length: 11 }, (_, i) => ({ id: String(i), lat: 6.25, lng: -75.6 }))))
      .toEqual({ ok: false, motivo: 'invalido' })
    expect(await mala([{ lat: 6.25, lng: -75.6 }, paradas[1]])).toEqual({ ok: false, motivo: 'invalido' })
    expect(await mala([{ id: 'x', lat: 4.6, lng: -74.08 }, paradas[1]])).toEqual({ ok: false, motivo: 'invalido' })
    expect(g.llamadas).toHaveLength(0)
  })

  it('tiene su propio tope diario, aparte del de las consultas básicas', async () => {
    const g = googleOpt()
    const s = new RecorridoService({ apiKey: 'k', fetchFn: g.fetchFn, maxOptimizarDiarias: 1 })
    expect((await s.optimizar(TERESITA, paradas)).ok).toBe(true)
    expect(await s.optimizar(TERESITA, paradas.slice(0, 2))).toEqual({ ok: false, motivo: 'tope_diario' })
  })
})

describe('ubicar direcciones (Geocoding)', () => {
  const googleGeo = (results: any[] = [{
    formatted_address: 'Cra. 109 # 43-7, Antonio Narino, Medellín, Antioquia, Colombia',
    geometry: { location: { lat: 6.256999, lng: -75.622705 }, location_type: 'ROOFTOP' },
  }], status = 'OK') => {
    const urls: string[] = []
    const fetchFn = async (url: string) => {
      urls.push(url)
      return { ok: true, status: 200, json: async () => ({ status, results }) }
    }
    return { fetchFn, urls }
  }

  it('ubica la Cra 109 #43-7 en la casa exacta, sin el ", Colombia"', async () => {
    const g = googleGeo()
    const r = await new RecorridoService({ apiKey: 'k', fetchFn: g.fetchFn }).ubicar('Carrera 109 #43-7')
    expect(r).toEqual({ ok: true, lugares: [{
      lat: 6.256999, lng: -75.622705, precision: 'ROOFTOP',
      direccion: 'Cra. 109 # 43-7, Antonio Narino, Medellín, Antioquia',
    }] })
    const params = new URL(g.urls[0]).searchParams
    expect(params.get('address')).toBe('Carrera 109 #43-7, Medellín, Antioquia')
    expect(params.get('components')).toBe('country:CO')
  })

  it('no repite "Medellín" si ya viene en el texto', async () => {
    const g = googleGeo()
    await new RecorridoService({ apiKey: 'k', fetchFn: g.fetchFn }).ubicar('Calle 50 #40-10, Medellín')
    expect(new URL(g.urls[0]).searchParams.get('address')).toBe('Calle 50 #40-10, Medellín')
  })

  it('descarta lo que cae fuera de Medellín y responde vacío si no encuentra', async () => {
    const fuera = [{ formatted_address: 'Bogotá', geometry: { location: { lat: 4.6, lng: -74.08 }, location_type: 'ROOFTOP' } }]
    expect(await new RecorridoService({ apiKey: 'k', fetchFn: googleGeo(fuera).fetchFn }).ubicar('Calle 1 #2-3'))
      .toEqual({ ok: true, lugares: [] })
    expect(await new RecorridoService({ apiKey: 'k', fetchFn: googleGeo([], 'ZERO_RESULTS').fetchFn }).ubicar('xyz abc'))
      .toEqual({ ok: true, lugares: [] })
  })

  it('la misma dirección no se vuelve a consultar', async () => {
    const g = googleGeo()
    const s = new RecorridoService({ apiKey: 'k', fetchFn: g.fetchFn })
    await s.ubicar('Carrera 109 #43-7')
    await s.ubicar('  carrera 109   #43-7 ')
    expect(g.urls).toHaveLength(1)
  })

  it('valida el texto y avisa si Google rechaza la llave', async () => {
    const s = new RecorridoService({ apiKey: 'k', fetchFn: googleGeo([], 'REQUEST_DENIED').fetchFn })
    expect(await s.ubicar('')).toEqual({ ok: false, motivo: 'invalido' })
    expect(await s.ubicar(42)).toEqual({ ok: false, motivo: 'invalido' })
    expect(await s.ubicar('Calle 10 #20-30')).toEqual({ ok: false, motivo: 'google' })
  })
})

describe('ubicar por la referencia (Places)', () => {
  // Geocoding responde con `geo`; Places con `lugar`.
  const google = (geo: any[], lugar: any = null) => {
    const llamadas: string[] = []
    const fetchFn = async (url: string) => {
      llamadas.push(url)
      const json = url.includes('places.googleapis.com')
        ? { places: lugar ? [lugar] : [] }
        : { status: geo.length ? 'OK' : 'ZERO_RESULTS', results: geo }
      return { ok: true, status: 200, json: async () => json }
    }
    return { fetchFn, llamadas }
  }
  const calle = { formatted_address: 'Cra. 109, Veinte de Julio, Medellín, Antioquia, Colombia',
    geometry: { location: { lat: 6.2525, lng: -75.6195 }, location_type: 'GEOMETRIC_CENTER' } }
  const casa = { ...calle, geometry: { ...calle.geometry, location_type: 'ROOFTOP' } }
  const urbanizacion = {
    location: { latitude: 6.257, longitude: -75.6227 },
    formattedAddress: 'Cra. 109 #43-7, Antonio Narino, Medellín, Antioquia',
    displayName: { text: 'Urbanización altos de San Javier' },
  }

  it('si la dirección cae en la mitad de la calle, usa el lugar de la referencia primero', async () => {
    const g = google([calle], urbanizacion)
    const r = await new RecorridoService({ apiKey: 'k', fetchFn: g.fetchFn })
      .ubicar('Carrera 109 #43-7', '', 'Urbanización Altos de San Javier')
    expect(r.ok && r.lugares[0]).toEqual({
      lat: 6.257, lng: -75.6227, precision: 'LUGAR', nombre: 'Urbanización altos de San Javier',
      direccion: 'Cra. 109 #43-7, Antonio Narino, Medellín, Antioquia',
    })
    expect(r.ok && r.lugares[1].precision).toBe('GEOMETRIC_CENTER')
  })

  it('si la dirección ya da la casa, no gasta la consulta de Places', async () => {
    const g = google([casa], urbanizacion)
    await new RecorridoService({ apiKey: 'k', fetchFn: g.fetchFn }).ubicar('Carrera 109 #43-7', '', 'Altos de San Javier')
    expect(g.llamadas.some((u) => u.includes('places.googleapis.com'))).toBe(false)
  })

  it('sin referencia, o si Places no encuentra nada, queda lo de la dirección', async () => {
    const sinRef = await new RecorridoService({ apiKey: 'k', fetchFn: google([calle], urbanizacion).fetchFn }).ubicar('Carrera 109 #43-7')
    expect(sinRef.ok && sinRef.lugares[0].precision).toBe('GEOMETRIC_CENTER')
    const nada = await new RecorridoService({ apiKey: 'k', fetchFn: google([calle], null).fetchFn }).ubicar('Carrera 109 #43-7', '', 'casa azul')
    expect(nada.ok && nada.lugares.map((l) => l.precision)).toEqual(['GEOMETRIC_CENTER'])
  })

  it('si Geocoding no encuentra la dirección, la referencia igual puede ubicarla', async () => {
    const r = await new RecorridoService({ apiKey: 'k', fetchFn: google([], urbanizacion).fetchFn })
      .ubicar('Cra 109 sin numero', '', 'Altos de San Javier')
    expect(r.ok && r.lugares.map((l) => l.precision)).toEqual(['LUGAR'])
  })
})
