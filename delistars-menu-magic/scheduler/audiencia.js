// Audiencia de Mercadeo: cuántos clientes hay en cada segmento y cuántos
// aceptaron recibir promociones. Solo CONTEOS: los correos nunca salen del
// servidor. Lo publica el scheduler en config/mercadeo_audiencia.
//
// Segmentos (mismos ids que admin/src/lib/mercadeo.ts):
//   todos, santa_lucia, santa_teresita (sede habitual), inactivos30 (último
//   pedido hace más de 30 días), frecuentes (5+ pedidos), nuevos (1 pedido),
//   cercaPremio (el próximo pedido les da el premio de fidelización).

const ENTREGADOS = ['delivered_paid', 'delivered_cash', 'pending_cuadre', 'completed']
const DIA_MS = 24 * 60 * 60 * 1000

/** ¿Aceptó promociones? (casilla del checkout: customers/{uid}.promociones.acepta) */
const acepta = (c) => c?.promociones?.acepta === true

/**
 * clientes: [{ uid, email, promociones, loyalty }]
 * pedidos:  [{ clientUid, status, sedeId, createdAtMs }]
 */
function calcularAudiencia(clientes, pedidos, ahoraMs = Date.now()) {
  const porCliente = new Map()
  for (const p of pedidos) {
    if (!p.clientUid || !ENTREGADOS.includes(p.status)) continue
    const r = porCliente.get(p.clientUid) || { pedidos: 0, ultimo: 0, sedes: {} }
    r.pedidos++
    r.ultimo = Math.max(r.ultimo, p.createdAtMs || 0)
    if (p.sedeId) r.sedes[p.sedeId] = (r.sedes[p.sedeId] || 0) + 1
    porCliente.set(p.clientUid, r)
  }

  const segmentos = {}
  const sumar = (id, c) => {
    const s = segmentos[id] || (segmentos[id] = { clientes: 0, aceptan: 0 })
    s.clientes++
    if (acepta(c)) s.aceptan++
  }

  let conCorreo = 0
  let aceptan = 0
  for (const c of clientes) {
    if (!c.email) continue
    conCorreo++
    if (acepta(c)) aceptan++
    sumar('todos', c)
    const r = porCliente.get(c.uid)
    if (r) {
      const habitual = Object.entries(r.sedes).sort((a, b) => b[1] - a[1])[0]?.[0]
      if (habitual) sumar(habitual, c)
      if (r.ultimo && ahoraMs - r.ultimo > 30 * DIA_MS) sumar('inactivos30', c)
      if (r.pedidos >= 5) sumar('frecuentes', c)
      if (r.pedidos === 1) sumar('nuevos', c)
    }
    // Ciclos de 10: con 9 sellos, el próximo pedido trae el premio.
    if (Object.values(c.loyalty || {}).some((l) => (Number(l?.count) || 0) % 10 === 9)) sumar('cercaPremio', c)
  }

  for (const id of ['todos', 'santa_lucia', 'santa_teresita', 'inactivos30', 'frecuentes', 'nuevos', 'cercaPremio']) {
    segmentos[id] = segmentos[id] || { clientes: 0, aceptan: 0 }
  }
  return { clientes: clientes.length, conCorreo, aceptan, segmentos }
}

module.exports = { calcularAudiencia }
