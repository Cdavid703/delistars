// Indicadores para Mercadeo: SOLO números agregados por día y sede (decisión
// C3 del 18 oct 2026, especificación §17.1: Mercadeo no ve datos personales).
// El scheduler los calcula con la cuenta de servicio y los publica en
// mercadeo/indicadores/dias/{yyyy-mm-dd}; Mercadeo lee eso, nunca los pedidos.

const ENTREGADOS = ['delivered_paid', 'delivered_cash', 'pending_cuadre', 'completed']
const SEDES = ['santa_lucia', 'santa_teresita']
const OFFSET_MS = -5 * 60 * 60 * 1000 // Colombia, sin horario de verano

/** Fecha y hora de Colombia de un instante. */
const enColombia = (ms) => {
  const d = new Date(ms + OFFSET_MS)
  return { fecha: d.toISOString().slice(0, 10), hora: d.getUTCHours() }
}

// Productos de cada línea "2x Hamburguesa Especial (+ queso) | Salsas: …".
// Mismo criterio que Reportes del panel (admin/src/pages/Reportes.tsx).
function productos(items) {
  const out = []
  for (const raw of String(items || '').split('\n')) {
    const line = raw.trim()
    const m = line.match(/^(\d+)\s*x\s+(.+)$/i)
    if (!m) continue
    let name = m[2]
      .replace(/\(.*?\)/g, '')
      .replace(/\|[^|—]*/g, '')
      .replace(/—\s*".*?"/g, '')
      .replace(/\s+/g, ' ')
      .trim()
    if (!name || /premio fidelización/i.test(line)) name = 'Premio fidelización'
    out.push({ name, qty: Number(m[1]) || 1 })
  }
  return out
}

const vacia = () => ({
  pedidos: 0, ventas: 0, cancelados: 0, rechazados: 0, domicilios: 0, recoger: 0,
  porHora: Array(24).fill(0), productos: {},
})

/**
 * pedidos:   [{ createdAtMs, status, sedeId, totalPrice, deliveryMode, items, cashierId }]
 * checkouts: [{ atMs }]  (metrics_funnel: carritos que llegaron al checkout)
 * Devuelve { 'yyyy-mm-dd': { sedes: { santa_lucia: {...}, santa_teresita: {...} }, embudo } }
 */
function calcularDias(pedidos, checkouts = []) {
  const dias = {}
  const dia = (fecha) => dias[fecha] || (dias[fecha] = {
    sedes: Object.fromEntries(SEDES.map((s) => [s, vacia()])),
    embudo: { checkouts: 0, pedidosCliente: 0 },
  })
  for (const p of pedidos) {
    if (!p.createdAtMs) continue
    const { fecha, hora } = enColombia(p.createdAtMs)
    const d = dia(fecha)
    if (!p.cashierId) d.embudo.pedidosCliente++ // los que hizo el cliente (no la caja)
    const s = d.sedes[p.sedeId]
    if (!s) continue
    if (p.status === 'cancelled') s.cancelados++
    if (p.status === 'rejected') s.rechazados++
    if (!ENTREGADOS.includes(p.status)) continue
    s.pedidos++
    s.ventas += Number(p.totalPrice) || 0
    if (p.deliveryMode === 'pickup') s.recoger++
    else s.domicilios++
    s.porHora[hora]++
    for (const { name, qty } of productos(p.items)) s.productos[name] = (s.productos[name] || 0) + qty
  }
  for (const c of checkouts) {
    if (c.atMs) dia(enColombia(c.atMs).fecha).embudo.checkouts++
  }
  return dias
}

module.exports = { calcularDias, enColombia, productos, ENTREGADOS }
