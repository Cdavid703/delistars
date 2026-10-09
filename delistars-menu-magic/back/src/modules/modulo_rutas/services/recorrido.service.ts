// Distancia del domicilio por RECORRIDO (lo que se maneja por calle), con
// Google Maps Routes API. La llave vive solo en el servidor (GOOGLE_MAPS_API_KEY
// en el .env): el navegador del cliente nunca la ve.
//
// Se pide la ruta básica en carro, sin tráfico (TRAFFIC_UNAWARE): es la que
// Google cobra como "Compute Routes Essentials", con 10.000 consultas gratis
// al mes. Con tráfico pasaría a la tarifa Pro, y para cobrar un domicilio la
// distancia es la misma.
//
// Protecciones de costo, para que una falla o un abuso no genere cobros:
//   · Solo puntos dentro del área de Medellín.
//   · Caché: el mismo par de puntos (a ~11 m) no se vuelve a consultar en 24 h.
//   · Tope diario (RUTAS_MAX_DIARIAS, 500 por defecto) y tope por IP por hora.
// Si algo de esto corta, o Google falla, se responde sin distancia y la app
// cobra en línea recta como antes: nunca se bloquea un pedido por esto.

export interface Punto { lat: number; lng: number }

export type Resultado =
  | { ok: true; km: number; cache: boolean }
  | { ok: false; motivo: 'invalido' | 'sin_llave' | 'tope_diario' | 'tope_ip' | 'google' }

// Área metropolitana de Medellín, con margen.
const AREA = { latMin: 6.0, latMax: 6.5, lngMin: -75.8, lngMax: -75.3 }

export const puntoValido = (p: unknown): p is Punto => {
  const q = p as Punto
  return !!q && Number.isFinite(q.lat) && Number.isFinite(q.lng) &&
    q.lat >= AREA.latMin && q.lat <= AREA.latMax &&
    q.lng >= AREA.lngMin && q.lng <= AREA.lngMax
}

const CACHE_MS = 24 * 60 * 60 * 1000
const CACHE_MAX = 5000
const POR_IP_HORA = 60

/** Día calendario en Colombia (UTC-5), para reiniciar el tope a medianoche local. */
const diaColombia = (ahora: number) => new Date(ahora - 5 * 3600 * 1000).toISOString().slice(0, 10)

type Fetch = (url: string, init: any) => Promise<{ ok: boolean; status: number; json(): Promise<any> }>

export class RecorridoService {
  private cache = new Map<string, { km: number; hasta: number }>()
  private dia = ''
  private usadasHoy = 0
  private porIp = new Map<string, number[]>()

  constructor(
    private readonly opts: {
      apiKey?: string
      maxDiarias?: number
      fetchFn?: Fetch
      ahora?: () => number
    } = {},
  ) {}

  private get apiKey() { return this.opts.apiKey ?? process.env.GOOGLE_MAPS_API_KEY ?? '' }
  private get maxDiarias() { return this.opts.maxDiarias ?? Number(process.env.RUTAS_MAX_DIARIAS ?? 500) }
  private get ahora() { return (this.opts.ahora ?? Date.now)() }

  async medir(origen: unknown, destino: unknown, ip = ''): Promise<Resultado> {
    if (!puntoValido(origen) || !puntoValido(destino)) return { ok: false, motivo: 'invalido' }
    if (!this.apiKey) return { ok: false, motivo: 'sin_llave' }

    const ahora = this.ahora
    const clave = [origen.lat, origen.lng, destino.lat, destino.lng].map((n) => n.toFixed(4)).join(',')
    const enCache = this.cache.get(clave)
    if (enCache && enCache.hasta > ahora) return { ok: true, km: enCache.km, cache: true }

    // Topes: solo cuentan las consultas que de verdad van a Google.
    const hoy = diaColombia(ahora)
    if (hoy !== this.dia) { this.dia = hoy; this.usadasHoy = 0 }
    if (this.usadasHoy >= this.maxDiarias) return { ok: false, motivo: 'tope_diario' }
    const recientes = (this.porIp.get(ip) ?? []).filter((t) => t > ahora - 3600 * 1000)
    if (recientes.length >= POR_IP_HORA) return { ok: false, motivo: 'tope_ip' }
    recientes.push(ahora)
    this.porIp.set(ip, recientes)
    this.usadasHoy++

    const km = await this.consultarGoogle(origen, destino)
    if (km === null) return { ok: false, motivo: 'google' }

    if (this.cache.size >= CACHE_MAX) this.cache.delete(this.cache.keys().next().value as string)
    this.cache.set(clave, { km, hasta: ahora + CACHE_MS })
    return { ok: true, km, cache: false }
  }

  private async consultarGoogle(origen: Punto, destino: Punto): Promise<number | null> {
    const fetchFn: Fetch = this.opts.fetchFn ?? (globalThis as any).fetch
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), 5000)
    const latLng = (p: Punto) => ({ location: { latLng: { latitude: p.lat, longitude: p.lng } } })
    try {
      const res = await fetchFn('https://routes.googleapis.com/directions/v2:computeRoutes', {
        method: 'POST',
        signal: controller.signal,
        headers: {
          'Content-Type': 'application/json',
          'X-Goog-Api-Key': this.apiKey,
          // Solo la distancia: pedir menos campos no cambia el precio, pero
          // pedir campos avanzados sí podría subirlo de tarifa.
          'X-Goog-FieldMask': 'routes.distanceMeters',
        },
        body: JSON.stringify({
          origin: latLng(origen),
          destination: latLng(destino),
          travelMode: 'DRIVE',
          routingPreference: 'TRAFFIC_UNAWARE',
        }),
      })
      if (!res.ok) {
        console.warn(`Routes API respondió ${res.status}`)
        return null
      }
      const data = await res.json()
      const metros = data?.routes?.[0]?.distanceMeters
      // Mismo punto: Google devuelve la ruta sin distanceMeters.
      if (data?.routes?.[0] && metros === undefined) return 0
      return Number.isFinite(metros) ? Math.round(metros) / 1000 : null
    } catch (err) {
      console.warn('Routes API falló:', err instanceof Error ? err.message : err)
      return null
    } finally {
      clearTimeout(timer)
    }
  }
}
