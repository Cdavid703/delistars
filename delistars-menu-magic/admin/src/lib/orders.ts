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
  reference?: string
  items?: string
  notes?: string
  cashierNotes?: string
  payment?: string
  status: string
  deliveryMode?: 'delivery' | 'pickup'
  sedeId?: string
  sedeName?: string
  quotedPrice?: number
  deliveryPrice?: number
  totalPrice?: number
  driverName?: string
  driverEmail?: string
  cashierName?: string
  rejectionReason?: string
  loyaltyRedemption?: { sedeId?: string; rewardIds?: string[]; count?: number }
  cashOnDelivery?: boolean
  mixtoEfectivo?: number | string
  rating?: number
  ratingComment?: string | null
  ratedAt?: Timestamp
  createdAt?: Timestamp
  updatedAt?: Timestamp
}

// Efectivo real cobrado por un pedido (espejo de src/utils/payments.js).
// En pago Mixto solo la porción mixtoEfectivo se cobró en efectivo; si no se
// registró el desglose se usa el total como respaldo conservador.
export const cashAmount = (o: Order): number =>
  (o.payment === 'Mixto' && o.mixtoEfectivo != null && o.mixtoEfectivo !== '')
    ? (Number(o.mixtoEfectivo) || 0)
    : (o.totalPrice || 0)

// ¿El pedido se cobró (total o parcialmente) en efectivo contra entrega?
export const isCashOrder = (o: Order): boolean =>
  !!o.cashOnDelivery || o.payment === 'Efectivo' || o.payment === 'Mixto'

// Métodos de pago válidos (mismo vocabulario que OrderForm.jsx en domicilios).
// Wompi = pago en línea ya confirmado (tarjeta/PSE/Nequi vía pasarela).
export const PAYMENT_OPTIONS = ['Efectivo', 'Transferencia', 'Nequi', 'Mixto', 'Wompi']

export const ACTIVE_STATUSES = ['assigned', 'accepted', 'preparing', 'in_transit', 'arrived']
export const DELIVERED_STATUSES = ['delivered_paid', 'delivered_cash', 'completed']
// Pedidos que no llegaron a nada: el cliente los intentó pero no se entregó.
export const CLOSED_STATUSES = ['rejected', 'cancelled']

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

// Todos los estados conocidos, para el selector de edición del admin.
export const ALL_STATUSES = Object.keys(STATUS_MAP)

export const statusInfo = (status: string) =>
  STATUS_MAP[status] || { label: status, cls: 'bg-gray-100 text-gray-700' }

export const statusLabel = (status?: string) =>
  (status && STATUS_MAP[status]?.label) || status || ''

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
