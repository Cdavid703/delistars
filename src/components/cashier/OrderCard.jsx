import { format } from 'date-fns'
import { es } from 'date-fns/locale'
import StatusBadge from '../common/StatusBadge'
import { MapPin, Phone, Clock, User, Bike } from 'lucide-react'

const BORDER_COLOR = {
  pending:        'border-mustard',
  assigned:       'border-tangelo',
  accepted:       'border-mint',
  in_transit:     'border-cherry',
  arrived:        'border-tangelo',
  delivered_paid: 'border-mint',
  delivered_cash: 'border-mustard',
  pending_cuadre: 'border-mustard',
  completed:      'border-smoked',
}

export default function OrderCard({ order, onClick, compact = false }) {
  const border = BORDER_COLOR[order.status] || 'border-smoked'
  const time   = order.createdAt?.toDate ? format(order.createdAt.toDate(), 'HH:mm', { locale: es }) : '--'

  return (
    <button
      onClick={onClick}
      className={`order-card w-full text-left ${border}`}
    >
      {/* Header */}
      <div className="flex items-start justify-between gap-2 mb-2">
        <div className="flex items-center gap-2">
          {order.orderNumber && (
            <span className="font-display text-lg text-cherry">#{order.orderNumber}</span>
          )}
          <StatusBadge status={order.status} />
        </div>
        <span className="flex items-center gap-1 text-xs text-coal/40 font-body flex-shrink-0">
          <Clock size={12} /> {time}
        </span>
      </div>

      {/* Client */}
      <div className="flex items-center gap-1.5 mb-1">
        <User size={13} className="text-coal/40 flex-shrink-0" />
        <span className="font-body font-semibold text-sm text-coal truncate">{order.name || '—'}</span>
      </div>

      {/* Address */}
      <div className="flex items-start gap-1.5 mb-1">
        <MapPin size={13} className="text-coal/40 flex-shrink-0 mt-0.5" />
        <span className="font-body text-xs text-coal/60 line-clamp-2">{order.fullAddress}</span>
      </div>

      {/* Phone */}
      <div className="flex items-center gap-1.5 mb-2">
        <Phone size={13} className="text-coal/40 flex-shrink-0" />
        <span className="font-body text-xs text-coal/60">{order.phone}</span>
      </div>

      {!compact && (
        <>
          {/* Items preview */}
          <div className="bg-smoked/60 rounded-lg p-2 mb-2">
            <p className="font-body text-xs text-coal/70 line-clamp-2">{order.items}</p>
          </div>

          {/* Footer */}
          <div className="flex items-center justify-between">
            <span className="font-body text-xs text-coal/40">{order.payment}</span>
            {order.driverName && (
              <span className="flex items-center gap-1 font-body text-xs text-mint">
                <Bike size={12} /> {order.driverName}
              </span>
            )}
          </div>
        </>
      )}

      {/* Cash pending cuadre label */}
      {order.status === 'pending_cuadre' && (
        <div className="mt-2 bg-mustard/10 border border-mustard/30 rounded-lg px-3 py-1.5">
          <p className="text-xs font-semibold text-mustard font-body">💰 Pendiente cuadre de caja</p>
        </div>
      )}
    </button>
  )
}
