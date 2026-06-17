import type { Timestamp } from 'firebase/firestore'

// Pedido de la colección `orders` (Firestore) — los mismos campos que usa domicilios.
export interface Order {
  id: string
  orderNumber?: string
  name?: string
  clientName?: string
  phone?: string
  fullAddress?: string
  barrio?: string
  items?: string
  payment?: string
  status: string
  deliveryMode?: 'delivery' | 'pickup'
  sedeId?: string
  sedeName?: string
  quotedPrice?: number
  deliveryPrice?: number
  totalPrice?: number
  driverName?: string
  createdAt?: Timestamp
}

export const ACTIVE_STATUSES = ['assigned', 'accepted', 'preparing', 'in_transit', 'arrived']
export const DELIVERED_STATUSES = ['delivered_paid', 'delivered_cash', 'completed']

// Etiqueta + clases Tailwind por estado (mismo vocabulario que domicilios).
const STATUS_MAP: Record<string, { label: string; cls: string }> = {
  pending:        { label: 'Pendiente',      cls: 'bg-gray-100 text-gray-700' },
  quoted:         { label: 'Cotizado',       cls: 'bg-mustard/15 text-mustard' },
  assigned:       { label: 'Asignado',       cls: 'bg-tangelo/15 text-tangelo' },
  accepted:       { label: 'Aceptado',       cls: 'bg-tangelo/15 text-tangelo' },
  preparing:      { label: 'En preparación', cls: 'bg-mustard/15 text-mustard' },
  in_transit:     { label: 'En camino',      cls: 'bg-cherry/15 text-cherry' },
  arrived:        { label: 'Llegó',          cls: 'bg-cherry/15 text-cherry' },
  delivered_paid: { label: 'Entregado',      cls: 'bg-mint/15 text-mint' },
  delivered_cash: { label: 'Entregado',      cls: 'bg-mint/15 text-mint' },
  pending_cuadre: { label: 'Pdte. cuadre',   cls: 'bg-mustard/15 text-mustard' },
  completed:      { label: 'Completado',     cls: 'bg-mint/15 text-mint' },
  rejected:       { label: 'Rechazado',      cls: 'bg-red-100 text-red-700' },
  cancelled:      { label: 'Cancelado',      cls: 'bg-red-100 text-red-700' },
}

export const statusInfo = (status: string) =>
  STATUS_MAP[status] || { label: status, cls: 'bg-gray-100 text-gray-700' }

export const fmtCOP = (v?: number): string =>
  `$${Number(v || 0).toLocaleString('es-CO')}`

export const isToday = (ts?: Timestamp): boolean => {
  if (!ts?.toDate) return false
  return ts.toDate().toDateString() === new Date().toDateString()
}

export const fmtDateTime = (ts?: Timestamp): string => {
  if (!ts?.toDate) return '—'
  return ts.toDate().toLocaleString('es-CO', {
    day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit',
  })
}
