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

export interface Parada extends Punto { id: string }

export type ResultadoRuta =
  | { ok: true; orden: string[]; km: number; min: number | null; tramos: { km: number; min: number | null }[] }
  | { ok: false; motivo: 'invalido' | 'sin_llave' | 'tope_diario' | 'tope_ip' | 'google' }

/** Máximo de paradas por ruta optimizada (Google admite hasta 25). */
export const MAX_PARADAS = 10

export type Resultado =
  | { ok: true; km: number; min: number | null; cache: boolean }
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
  private cache = new Map<string, { km: number; min: number | null; hasta: number }>()
  private dia = ''
  private usadasHoy = 0
  private porIp = new Map<string, number[]>()
  private usadasOptHoy = 0
  private cacheOpt = new Map<string, { r: ResultadoRuta; hasta: number }>()

  constructor(
    private readonly opts: {
      apiKey?: string
      maxDiarias?: number
      maxOptimizarDiarias?: number
      fetchFn?: Fetch
      ahora?: () => number
    } = {},
  ) {}

  private get apiKey() { return this.opts.apiKey ?? process.env.GOOGLE_MAPS_API_KEY ?? '' }
  private get maxDiarias() { return this.opts.maxDiarias ?? Number(process.env.RUTAS_MAX_DIARIAS ?? 500) }
  // Optimizar el orden se cobra en una tarifa más alta (Pro): tope aparte y más bajo.
  private get maxOptimizarDiarias() {
    return this.opts.maxOptimizarDiarias ?? Number(process.env.RUTAS_MAX_OPTIMIZAR_DIARIAS ?? 100)
  }
  private get ahora() { return (this.opts.ahora ?? Date.now)() }

  async medir(origen: unknown, destino: unknown, ip = ''): Promise<Resultado> {
    if (!puntoValido(origen) || !puntoValido(destino)) return { ok: false, motivo: 'invalido' }
    if (!this.apiKey) return { ok: false, motivo: 'sin_llave' }

    const ahora = this.ahora
    const clave = [origen.lat, origen.lng, destino.lat, destino.lng].map((n) => n.toFixed(4)).join(',')
    const enCache = this.cache.get(clave)
    if (enCache && enCache.hasta > ahora) return { ok: true, km: enCache.km, min: enCache.min, cache: true }

    // Topes: solo cuentan las consultas que de verdad van a Google.
    const tope = this.gastar('basica', ip)
    if (tope) return { ok: false, motivo: tope }

    const ruta = await this.consultarGoogle(origen, destino)
    if (ruta === null) return { ok: false, motivo: 'google' }

    if (this.cache.size >= CACHE_MAX) this.cache.delete(this.cache.keys().next().value as string)
    this.cache.set(clave, { ...ruta, hasta: ahora + CACHE_MS })
    return { ok: true, ...ruta, cache: false }
  }

  /** Cuenta una consulta contra los topes; devuelve el motivo si ya no se puede. */
  private gastar(tipo: 'basica' | 'optimizar', ip: string): 'tope_diario' | 'tope_ip' | null {
    const ahora = this.ahora
    const hoy = diaColombia(ahora)
    if (hoy !== this.dia) { this.dia = hoy; this.usadasHoy = 0; this.usadasOptHoy = 0 }
    if (tipo === 'basica' && this.usadasHoy >= this.maxDiarias) return 'tope_diario'
    if (tipo === 'optimizar' && this.usadasOptHoy >= this.maxOptimizarDiarias) return 'tope_diario'
    const recientes = (this.porIp.get(ip) ?? []).filter((t) => t > ahora - 3600 * 1000)
    if (recientes.length >= POR_IP_HORA) return 'tope_ip'
    recientes.push(ahora)
    this.porIp.set(ip, recientes)
    if (tipo === 'basica') this.usadasHoy++
    else this.usadasOptHoy++
    return null
  }

  /**
   * Mejor orden para entregar `paradas` saliendo de `origen` y volviendo a él
   * (el domiciliario regresa a la sede). Usa optimizeWaypointOrder de Google.
   */
  async optimizar(origen: unknown, paradas: unknown, ip = ''): Promise<ResultadoRuta> {
    if (!puntoValido(origen) || !Array.isArray(paradas) || paradas.length < 2 || paradas.length > MAX_PARADAS ||
        !paradas.every((p) => puntoValido(p) && typeof (p as Parada).id === 'string')) {
      return { ok: false, motivo: 'invalido' }
    }
    if (!this.apiKey) return { ok: false, motivo: 'sin_llave' }
    const lista = paradas as Parada[]

    const ahora = this.ahora
    const clave = [origen, ...[...lista].sort((a, b) => a.id.localeCompare(b.id))]
      .map((p) => `${(p as Parada).id ?? ''}@${p.lat.toFixed(4)},${p.lng.toFixed(4)}`).join('|')
    const enCache = this.cacheOpt.get(clave)
    if (enCache && enCache.hasta > ahora) return enCache.r

    const tope = this.gastar('optimizar', ip)
    if (tope) return { ok: false, motivo: tope }

    const fetchFn: Fetch = this.opts.fetchFn ?? (globalThis as any).fetch
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), 8000)
    const latLng = (p: Punto) => ({ location: { latLng: { latitude: p.lat, longitude: p.lng } } })
    const minutos = (d: unknown) => {
      const seg = parseFloat(String(d ?? '0s'))
      return Number.isFinite(seg) ? Math.max(1, Math.round(seg / 60)) : null
    }
    try {
      const res = await fetchFn('https://routes.googleapis.com/directions/v2:computeRoutes', {
        method: 'POST',
        signal: controller.signal,
        headers: {
          'Content-Type': 'application/json',
          'X-Goog-Api-Key': this.apiKey,
          'X-Goog-FieldMask': [
            'routes.optimizedIntermediateWaypointIndex', 'routes.distanceMeters', 'routes.duration',
            'routes.legs.distanceMeters', 'routes.legs.duration',
          ].join(','),
        },
        body: JSON.stringify({
          origin: latLng(origen),
          destination: latLng(origen),
          intermediates: lista.map(latLng),
          travelMode: 'DRIVE',
          routingPreference: 'TRAFFIC_UNAWARE',
          optimizeWaypointOrder: true,
        }),
      })
      if (!res.ok) {
        console.warn(`Routes API (optimizar) respondió ${res.status}`)
        return { ok: false, motivo: 'google' }
      }
      const ruta = (await res.json())?.routes?.[0]
      const idx: number[] | undefined = ruta?.optimizedIntermediateWaypointIndex
      if (!ruta || !Array.isArray(idx) || idx.length !== lista.length) return { ok: false, motivo: 'google' }
      const r: ResultadoRuta = {
        ok: true,
        orden: idx.map((i) => lista[i].id),
        km: Math.round(ruta.distanceMeters ?? 0) / 1000,
        min: minutos(ruta.duration),
        // Un tramo por parada, más el regreso a la sede al final.
        tramos: (ruta.legs ?? []).map((l: any) => ({ km: Math.round(l.distanceMeters ?? 0) / 1000, min: minutos(l.duration) })),
      }
      this.cacheOpt.set(clave, { r, hasta: ahora + 10 * 60 * 1000 })
      return r
    } catch (err) {
      console.warn('Routes API (optimizar) falló:', err instanceof Error ? err.message : err)
      return { ok: false, motivo: 'google' }
    } finally {
      clearTimeout(timer)
    }
  }

  /** km y minutos del recorrido, o null si Google no dio una ruta. */
  private async consultarGoogle(origen: Punto, destino: Punto): Promise<{ km: number; min: number | null } | null> {
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
          // Solo distancia y duración (campos básicos): pedir campos
          // avanzados sí podría subir la consulta de tarifa.
          'X-Goog-FieldMask': 'routes.distanceMeters,routes.duration',
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
      const ruta = data?.routes?.[0]
      if (!ruta) return null
      // Mismo punto: Google devuelve la ruta sin distanceMeters ni duration.
      const metros = ruta.distanceMeters ?? 0
      if (!Number.isFinite(metros)) return null
      // La duración viene como texto en segundos: "754s".
      const seg = parseFloat(String(ruta.duration ?? '0s'))
      return { km: Math.round(metros) / 1000, min: Number.isFinite(seg) ? Math.max(1, Math.round(seg / 60)) : null }
    } catch (err) {
      console.warn('Routes API falló:', err instanceof Error ? err.message : err)
      return null
    } finally {
      clearTimeout(timer)
    }
  }
}
