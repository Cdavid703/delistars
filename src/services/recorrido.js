// Consultas de rutas por calle (Google Maps) a través del backend. La llave de
// Google vive en el servidor, nunca en el navegador. Si algo falla (sin llave,
// tope, Google caído, sin conexión) se devuelve null y quien llama sigue con
// su respaldo: línea recta, mediana histórica o vecino más cercano.

async function post(ruta, cuerpo, timeoutMs) {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)
  try {
    const res = await fetch(`/api/v1/rutas/${ruta}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(cuerpo),
      signal: controller.signal,
    })
    return res.ok ? await res.json() : null
  } catch {
    return null
  } finally {
    clearTimeout(timer)
  }
}

const punto = p => ({ lat: Number(p.lat), lng: Number(p.lng) })

/** { km, min } del recorrido en carro entre dos puntos, o null. */
export async function medirRuta(origen, destino) {
  const r = await post('recorrido', { origen: punto(origen), destino: punto(destino) }, 6000)
  return r && Number.isFinite(r.km) ? { km: r.km, min: Number.isFinite(r.min) ? r.min : null } : null
}

/** Solo los km por calle, o null. */
export async function medirRecorrido(origen, destino) {
  return (await medirRuta(origen, destino))?.km ?? null
}

/**
 * Mejor orden para entregar `paradas` ([{ id, lat, lng }], de 2 a 10) saliendo
 * de `origen` y volviendo a él. Devuelve { orden: [ids], km, min, tramos } o null.
 */
export async function optimizarRuta(origen, paradas) {
  const r = await post('optimizar', {
    origen: punto(origen),
    paradas: paradas.map(p => ({ id: String(p.id), ...punto(p) })),
  }, 9000)
  return r && Array.isArray(r.orden) ? r : null
}

/**
 * Ubica una dirección escrita con Google (entiende el "#43-7"). Con
 * `referencia` ("Urbanización Altos de San Javier"), si la dirección no da la
 * casa exacta se busca también el lugar por su nombre.
 * Devuelve [{ lat, lng, direccion, precision, nombre? }] (vacío si no la
 * encontró) o null si no se pudo consultar: ahí quien llama usa su respaldo.
 */
export async function ubicarDireccion(texto, referencia) {
  const r = await post('ubicar', { texto, ...(referencia ? { referencia } : {}) }, 8000)
  return r && Array.isArray(r.lugares) ? r.lugares : null
}
