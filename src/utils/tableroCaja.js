// Tablero de la caja: cuánto lleva cada pedido en su etapa y cuándo se demora.
// Módulo puro (lo usan la tarjeta y el tablero).
import { etapaDe } from './etapas'

// Cuándo entró a la etapa actual (para medir la demora).
const INICIO_ETAPA = {
  enviado: 'createdAt', confirmado: 'quotedAt', en_preparacion: 'preparingAt',
  listo: 'listoAt', en_camino: 'inTransitAt', llego: 'arrivedAt', entregado: 'deliveredAt',
}
// Minutos para avisar (naranja) y para alertar (rojo) por etapa. Orientativos:
// la caja ve qué pedido lleva más quieto; no cambian nada del pedido.
export const DEMORA = {
  enviado: [5, 10], confirmado: [10, 20], en_preparacion: [20, 30],
  listo: [5, 10], en_camino: [25, 40], llego: [5, 10],
}

const ms = (t) => (t?.toMillis ? t.toMillis() : t?.toDate ? t.toDate().getTime() : Number(t) || 0)

export function minutosEnEtapa(order, ahora) {
  if (!ahora) return null
  const { etapa } = etapaDe(order)
  const t = ms(order[INICIO_ETAPA[etapa]]) || ms(order.updatedAt) || ms(order.createdAt)
  return t ? Math.max(0, Math.floor((ahora - t) / 60000)) : null
}

/** Domicilio cotizado que todavía no tiene domiciliario: la caja se lo asigna. */
export const porAsignar = (o) => o?.status === 'quoted' && o.deliveryMode !== 'pickup' && !o.driverEmail
