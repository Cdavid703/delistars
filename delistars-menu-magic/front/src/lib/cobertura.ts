// "¿Llegamos a tu casa?": con la dirección del visitante, cuánto vale el
// domicilio y cuánto tarda desde cada sede, por calle (Google, vía backend).
//
// ESPEJO de src/utils/tarifaDomicilio.js (TARIFAS_RECORRIDO) y de las
// coordenadas de src/services/roles.js (SEDES): mantener sincronizados. Una
// prueba de la app de domicilios compara esta tabla con la suya.

const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:3000/api/v1'

export const TARIFAS_RECORRIDO = [
  { hasta: 1, precio: 4000 },
  { hasta: 2, precio: 5000 },
  { hasta: 3, precio: 6000 },
  { hasta: 4, precio: 7000 },
  { hasta: 5, precio: 8000 },
  { hasta: 6, precio: 9000 },
  { hasta: 7, precio: 10000 },
]

// slug → coordenadas de la sede (id = el de data/menu.ts y la API de sedes).
export const SEDES_COORDS: Record<string, { id: number; lat: number; lng: number }> = {
  santa_lucia:    { id: 1, lat: 6.260435, lng: -75.604912 },
  santa_teresita: { id: 2, lat: 6.244691, lng: -75.613159 },
}

export const precioPorCalle = (km: number): number | null =>
  TARIFAS_RECORRIDO.find((t) => km <= t.hasta)?.precio ?? null

export interface OpcionSede {
  slug: string
  id: number
  km: number
  min: number | null
  /** null = no llega a domicilio desde esa sede (más de 7 km por calle). */
  precio: number | null
}

export interface Cobertura {
  direccion: string
  /** De la más conveniente a la menos (más barata y, a igual precio, más cerca). */
  opciones: OpcionSede[]
}

async function post<T>(ruta: string, cuerpo: unknown): Promise<T | null> {
  try {
    const res = await fetch(`${API_BASE_URL}/rutas/${ruta}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(cuerpo),
      signal: AbortSignal.timeout(8000),
    })
    return res.ok ? ((await res.json()) as T) : null
  } catch {
    return null
  }
}

/**
 * Ubica la dirección y mide desde cada sede. Devuelve null si no se pudo
 * consultar, o { direccion, opciones } (opciones vacías si no la encontró).
 */
export async function consultarCobertura(texto: string): Promise<Cobertura | null> {
  const ub = await post<{ lugares: { lat: number; lng: number; direccion: string }[] }>('ubicar', { texto })
  if (!ub) return null
  const lugar = ub.lugares?.[0]
  if (!lugar) return { direccion: '', opciones: [] }
  const medidas = await Promise.all(Object.entries(SEDES_COORDS).map(async ([slug, s]) => {
    const r = await post<{ km: number; min: number | null }>('recorrido', {
      origen: { lat: s.lat, lng: s.lng }, destino: { lat: lugar.lat, lng: lugar.lng },
    })
    return r && Number.isFinite(r.km) ? { slug, id: s.id, km: r.km, min: r.min, precio: precioPorCalle(r.km) } : null
  }))
  const opciones = medidas.filter((m): m is OpcionSede => m !== null)
    .sort((a, b) => (a.precio ?? Infinity) - (b.precio ?? Infinity) || a.km - b.km)
  return { direccion: lugar.direccion, opciones }
}
