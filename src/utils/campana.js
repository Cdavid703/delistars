// Campaña de Mercadeo abierta en las últimas 24 h (la guarda el menú en
// ds_campana al tocar una notificación o la franja). Se manda con el pedido
// para atribuírselo (especificación §17.4); el servidor valida sede y fechas.
const H24 = 24 * 60 * 60 * 1000

export function campanaParaPedido(ahora = Date.now()) {
  try {
    const c = JSON.parse(localStorage.getItem('ds_campana') || 'null')
    return c?.id && ahora - Number(c.abiertaAt) < H24 ? { id: String(c.id), abiertaAt: Number(c.abiertaAt) } : null
  } catch { return null }
}

/** Llegó por un enlace de campaña directo a domicilios (destino «Mis premios»). */
export function recordarCampanaDeUrl() {
  try {
    const id = new URLSearchParams(window.location.search).get('campana')
    if (!id || !/^[A-Za-z0-9]{10,40}$/.test(id)) return null
    localStorage.setItem('ds_campana', JSON.stringify({ id, abiertaAt: Date.now() }))
    let v = localStorage.getItem('ds_visitante')
    if (!v) { v = (crypto.randomUUID?.() || `${Date.now()}-${Math.random().toString(36).slice(2)}`).replace(/[^A-Za-z0-9-]/g, ''); localStorage.setItem('ds_visitante', v) }
    fetch('/api/v1/mercadeo/eventos', {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ campanaId: id, tipo: 'apertura', visitante: v }), keepalive: true,
    }).catch(() => {})
    return id
  } catch { return null }
}
