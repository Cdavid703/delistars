// Recuperar el pedido con el teléfono.
//
// El cliente que pide sin cuenta pierde de vista su pedido si cambia de
// navegador o su celular borra los datos del sitio; entonces cree que no
// entró y vuelve a pedir. Con esto escribe su número y el pedido vuelve a su
// pantalla, en cualquier navegador.
//
// El teléfono NO es un secreto, así que solo se puede reclamar lo que hace
// daño perder de vista y poco daño ver: pedidos EN CURSO de las últimas 24
// horas. El historial no se puede reclamar. Lo mismo valida firestore.rules.
//
// Módulo puro (sin React ni Firebase) para probarlo con node --test.

/** Últimos 10 dígitos: así "300 123 4567", "+57 3001234567" y "3001234567" son el mismo. */
export function normalizarTelefono(tel) {
  const d = String(tel || '').replace(/\D/g, '')
  return d.length >= 10 ? d.slice(-10) : ''
}

export const telefonoValido = (tel) => normalizarTelefono(tel).length === 10

/** Estados en los que el pedido ya no está en curso: no se reclaman. */
export const ESTADOS_CERRADOS = [
  'delivered_paid', 'delivered_cash', 'pending_cuadre', 'completed', 'rejected', 'cancelled',
]

export const VENTANA_RECLAMO_MS = 24 * 60 * 60 * 1000

/** ¿Este pedido se puede devolver a la pantalla del cliente? */
export function reclamable(order, ahora = Date.now()) {
  if (!order) return false
  if (ESTADOS_CERRADOS.includes(order.status)) return false
  const creado = order.createdAt?.toMillis?.() ?? order.createdAt ?? 0
  if (!creado || ahora - creado > VENTANA_RECLAMO_MS) return false
  return true
}
