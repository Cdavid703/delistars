import { format } from 'date-fns'
import { es } from 'date-fns/locale'
import StatusBadge from '../common/StatusBadge'
import { MapPin, Phone, Clock, User, Bike, MessageCircle } from 'lucide-react'

const BORDER_COLOR = {
  pending:        'border-mustard',
  quoted:         'border-tangelo',
  assigned:       'border-tangelo',
  accepted:       'border-mint',
  in_transit:     'border-cherry',
  arrived:        'border-tangelo',
  delivered_paid: 'border-mint',
  delivered_cash: 'border-mustard',
  pending_cuadre: 'border-mustard',
  completed:      'border-smoked',
}

export default function OrderCard({ order, onClick, compact = false, unreadCount = 0 }) {
  const border = unreadCount > 0 ? 'border-cherry' : (BORDER_COLOR[order.status] || 'border-smoked')
  const time   = order.createdAt?.toDate ? format(order.createdAt.toDate(), 'HH:mm', { locale: es }) : '--'

  return (
    <button
      onClick={onClick}
      className={`order-card w-full text-left ${border}`}
    >
      {/* Unread chat banner — very visible, at the top */}
      {unreadCount > 0 && (
        <div className="mb-2 flex items-center gap-1.5 bg-cherry/10 border border-cherry/30 rounded-xl px-3 py-2 animate-pulse">
          <MessageCircle size={13} className="text-cherry flex-shrink-0" />
          <span className="font-body text-xs font-semibold text-cherry">
            {unreadCount === 1 ? '1 mensaje nuevo del cliente' : `${unreadCount} mensajes nuevos del cliente`}
          </span>
          <span className="ml-auto text-[10px] font-body text-cherry/70 font-semibold">Ver →</span>
        </div>
      )}

      {/* Header */}
      <div className="flex items-start justify-between gap-2 mb-2">
        <div className="flex items-center gap-2">
          {order.orderNumber && (
            <span className="font-display text-lg text-cherry">#{order.orderNumber}</span>
          )}
          <StatusBadge status={order.status} />
          {unreadCount > 0 && (
            <span className="inline-flex items-center justify-center min-w-[20px] h-5 bg-cherry rounded-full text-[10px] font-bold text-cream px-1.5 animate-bounce">
              {unreadCount}
            </span>
          )}
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
