// Pide al backend la distancia por calle (Google Maps) entre la sede y el
// cliente. La llave de Google vive en el servidor, nunca en el navegador.
// Devuelve los km, o null si no se pudo medir (sin llave, tope, Google caído,
// sin conexión): quien llama cobra en línea recta como respaldo.

const TIMEOUT_MS = 6000

export async function medirRecorrido(origen, destino) {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS)
  try {
    const res = await fetch('/api/v1/rutas/recorrido', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        origen: { lat: Number(origen.lat), lng: Number(origen.lng) },
        destino: { lat: Number(destino.lat), lng: Number(destino.lng) },
      }),
      signal: controller.signal,
    })
    if (!res.ok) return null
    const { km } = await res.json()
    return Number.isFinite(km) ? km : null
  } catch {
    return null
  } finally {
    clearTimeout(timer)
  }
}
