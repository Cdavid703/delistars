// Audiencia de Mercadeo: cuántos clientes hay en cada segmento y cuántos
// aceptaron recibir promociones. Solo CONTEOS: los correos nunca salen del
// servidor. Lo publica el scheduler en config/mercadeo_audiencia.
//
// Segmentos (mismos ids que admin/src/lib/mercadeo.ts):
//   todos, santa_lucia, santa_teresita (sede habitual), inactivos30 (último
//   pedido hace más de 90 días; el id conserva el 30), frecuentes (5+ pedidos), nuevos (1 pedido),
//   cercaPremio (el próximo pedido les da el premio de fidelización).

const ENTREGADOS = ['delivered_paid', 'delivered_cash', 'pending_cuadre', 'completed']
const DIA_MS = 24 * 60 * 60 * 1000
const SEGMENTOS = ['todos', 'santa_lucia', 'santa_teresita', 'inactivos30', 'frecuentes', 'nuevos', 'cercaPremio']

/**
 * ¿Aceptó promociones? (casilla del checkout o tarjeta de la app:
 * customers/{uid}.promociones.acepta) y no se dio de baja desde un correo.
 */
const acepta = (c, bajas) => c?.promociones?.acepta === true && !bajas?.has(c.uid)

/** Resumen de pedidos entregados por cliente: { pedidos, ultimo, sedes }. */
function resumenPorCliente(pedidos) {
  const m = new Map()
  for (const p of pedidos) {
    if (!p.clientUid || !ENTREGADOS.includes(p.status)) continue
    const r = m.get(p.clientUid) || { pedidos: 0, ultimo: 0, sedes: {} }
    r.pedidos++
    r.ultimo = Math.max(r.ultimo, p.createdAtMs || 0)
    if (p.sedeId) r.sedes[p.sedeId] = (r.sedes[p.sedeId] || 0) + 1
    m.set(p.clientUid, r)
  }
  return m
}

/** Segmentos a los que pertenece un cliente con correo. */
function segmentosDe(c, r, ahoraMs = Date.now()) {
  const s = ['todos']
  if (r) {
    const habitual = Object.entries(r.sedes).sort((a, b) => b[1] - a[1])[0]?.[0]
    if (habitual) s.push(habitual)
    // Inactivo = 90 días sin pedir (decisión del 25 oct 2026; antes 30). El id
    // sigue siendo 'inactivos30' porque las campañas guardadas lo usan.
    if (r.ultimo && ahoraMs - r.ultimo > 90 * DIA_MS) s.push('inactivos30')
    if (r.pedidos >= 5) s.push('frecuentes')
    if (r.pedidos === 1) s.push('nuevos')
  }
  // Ciclos de 10: con 9 sellos, el próximo pedido trae el premio.
  if (Object.values(c.loyalty || {}).some((l) => (Number(l?.count) || 0) % 10 === 9)) s.push('cercaPremio')
  return s
}

/**
 * clientes: [{ uid, email, name, promociones, loyalty }]
 * pedidos:  [{ clientUid, status, sedeId, createdAtMs }]
 * bajas:    Set de uids que se dieron de baja desde un correo
 */
function calcularAudiencia(clientes, pedidos, ahoraMs = Date.now(), bajas = new Set(), conAparato = new Set()) {
  const resumen = resumenPorCliente(pedidos)
  const segmentos = Object.fromEntries(SEGMENTOS.map((id) => [id, { clientes: 0, aceptan: 0, notificables: 0 }]))
  let conCorreo = 0
  let aceptan = 0
  let notificables = 0
  for (const c of clientes) {
    // Notificación (app o navegador): aceptó promociones y tiene un aparato.
    if (acepta(c, bajas) && conAparato.has(c.uid)) {
      notificables++
      for (const id of segmentosDe(c, resumen.get(c.uid), ahoraMs)) {
        const s = segmentos[id] || (segmentos[id] = { clientes: 0, aceptan: 0, notificables: 0 })
        s.notificables++
      }
    }
    if (!c.email) continue
    conCorreo++
    const si = acepta(c, bajas)
    if (si) aceptan++
    for (const id of segmentosDe(c, resumen.get(c.uid), ahoraMs)) {
      const s = segmentos[id] || (segmentos[id] = { clientes: 0, aceptan: 0, notificables: 0 })
      s.clientes++
      if (si) s.aceptan++
    }
  }
  return { clientes: clientes.length, conCorreo, aceptan, notificables, segmentos }
}

/** Clientes a los que se les puede enviar una campaña de ese segmento. */
function destinatarios(segmento, clientes, pedidos, ahoraMs = Date.now(), bajas = new Set()) {
  const resumen = resumenPorCliente(pedidos)
  const vistos = new Set()
  return clientes.filter((c) => {
    const email = String(c.email || '').trim().toLowerCase()
    if (!email || vistos.has(email) || !acepta(c, bajas)) return false
    if (!segmentosDe(c, resumen.get(c.uid), ahoraMs).includes(segmento)) return false
    vistos.add(email) // un correo por persona aunque tenga dos cuentas
    return true
  })
}

/**
 * Cuentas a las que se les puede mandar una promoción por notificación: aceptó
 * promociones, está en el segmento, tiene un aparato y, si la campaña es de una
 * sede, esa es su sede habitual (o aún no tiene pedidos). La unidad es la
 * cuenta, no el aparato.
 */
function destinatariosPush(segmento, clientes, pedidos, ahoraMs = Date.now(), bajas = new Set(), conAparato = new Set(), sedeId = '') {
  const resumen = resumenPorCliente(pedidos)
  return clientes.filter((c) => {
    if (!acepta(c, bajas) || !conAparato.has(c.uid)) return false
    const seg = segmentosDe(c, resumen.get(c.uid), ahoraMs)
    if (!seg.includes(segmento)) return false
    if (sedeId && resumen.get(c.uid) && !seg.includes(sedeId)) return false
    return true
  })
}

module.exports = { calcularAudiencia, destinatarios, destinatariosPush, segmentosDe, SEGMENTOS }
