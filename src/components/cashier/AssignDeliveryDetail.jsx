import { useState } from 'react'
import { doc, updateDoc, serverTimestamp } from 'firebase/firestore'
import { db } from '../../services/firebase'
import {
  X, User, MapPin, ShoppingBag, CreditCard, Bike,
  Hash, AlertCircle, DollarSign
} from 'lucide-react'
import StatusBadge from '../common/StatusBadge'

const fmt = v => (v !== undefined && v !== null && v !== '') ? `$${Number(v).toLocaleString('es-CO')}` : '—'

export default function AssignDeliveryDetail({ order, drivers, onClose }) {
  const [quotedPrice,   setQuotedPrice]   = useState(String(order.quotedPrice   ?? ''))
  const [deliveryPrice, setDeliveryPrice] = useState(String(order.deliveryPrice ?? ''))
  const [orderNumber,   setOrderNumber]   = useState(order.orderNumber || '')
  const [driverId,      setDriverId]      = useState(order.driverEmail || '')
  const [driverNotes,   setDriverNotes]   = useState(order.driverNotes || '')
  const [payExact,      setPayExact]      = useState(order.payExact ?? true)
  const [payAmount,     setPayAmount]     = useState(String(order.payAmount || ''))
  const [loading,       setLoading]       = useState(false)
  const [errors,        setErrors]        = useState([])

  const cashOnDelivery = order.payment === 'Efectivo' || order.payment === 'Mixto'
  const qp    = parseFloat(quotedPrice)   || 0
  const dp    = parseFloat(deliveryPrice) || 0
  const total = qp + dp
  const pa    = parseFloat(payAmount)     || 0
  const change = !payExact && pa > total ? pa - total : 0

  const handleSend = async () => {
    const errs = []
    if (!orderNumber.trim()) errs.push('El número de orden es obligatorio')
    if (!driverId)           errs.push('Debes seleccionar un domiciliario')
    if (errs.length) { setErrors(errs); return }

    const driver = drivers.find(d => d.id === driverId)
    setLoading(true)
    try {
      const resolvedEmail = (driver?.id || driverId).toLowerCase().trim()
      await updateDoc(doc(db, 'orders', order.id), {
        status:        'assigned',
        orderNumber:   orderNumber.trim(),
        quotedPrice:   qp,
        deliveryPrice: dp,
        totalPrice:    total,
        cashOnDelivery,
        payExact:      cashOnDelivery ? payExact : null,
        payAmount:     cashOnDelivery && !payExact ? pa || null : null,
        change:        cashOnDelivery && !payExact ? change : null,
        driverEmail:   resolvedEmail,
        driverName:    driver?.name || driver?.id || driverId,
        driverPhone:   driver?.phone || null,
        driverNotes:   driverNotes.trim(),
        assignedAt:    serverTimestamp(),
        updatedAt:     serverTimestamp(),
      })
      onClose()
    } finally { setLoading(false) }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-coal/50 backdrop-blur-sm animate-fade-in"
      onClick={e => { if (e.target === e.currentTarget) onClose() }}>
      <div className="bg-cream w-full max-w-lg rounded-t-3xl sm:rounded-3xl max-h-[92dvh] overflow-y-auto scroll-custom animate-slide-in-right">

        {/* Header */}
        <div className="sticky top-0 bg-cream/95 backdrop-blur-sm flex items-center justify-between px-5 py-4 border-b border-coal/10">
          <div className="flex items-center gap-2">
            <p className="font-display text-xl tracking-wide">Asignar domicilio</p>
            <StatusBadge status={order.status} />
          </div>
          <button onClick={onClose} className="btn-icon"><X size={20} /></button>
        </div>

        <div className="p-5 flex flex-col gap-4">

          {/* Errors */}
          {errors.length > 0 && (
            <div className="bg-pepper/10 border border-pepper/30 rounded-xl p-3 flex flex-col gap-1">
              {errors.map(e => (
                <p key={e} className="flex items-center gap-2 text-sm text-pepper font-body">
                  <AlertCircle size={14} /> {e}
                </p>
              ))}
            </div>
          )}

          {/* Order summary */}
          <div className="card bg-smoked/40">
            <div className="flex items-center gap-2 mb-2">
              <User size={14} className="text-cherry" />
              <p className="font-body font-semibold text-sm">{order.name || order.clientName || '—'}</p>
              {order.phone && <a href={`tel:${order.phone}`} className="font-body text-xs text-cherry underline ml-auto">{order.phone}</a>}
            </div>
            <div className="flex items-start gap-2 mb-2">
              <MapPin size={14} className="text-cherry flex-shrink-0 mt-0.5" />
              <p className="font-body text-xs text-coal/70">{order.fullAddress}{order.barrio ? ` — ${order.barrio}` : ''}</p>
            </div>
            <div className="bg-white/70 rounded-lg p-2 mb-2">
              <p className="font-body text-xs text-coal/80 whitespace-pre-wrap line-clamp-4">{order.items}</p>
            </div>
            {order.notes && (
              <p className="font-body text-xs text-coal/60 italic mb-2">Indicaciones: {order.notes}</p>
            )}
            <div className="flex items-center gap-2">
              <CreditCard size={14} className="text-cherry" />
              <p className="font-body text-xs font-semibold text-coal">{order.payment}</p>
            </div>
          </div>

          {/* Cashier notes (from quote) */}
          {order.cashierNotes && (
            <div className="bg-mustard/10 border border-mustard/20 rounded-xl p-3">
              <p className="font-body text-xs text-coal/50 uppercase tracking-wider mb-1">Nota para cliente</p>
              <p className="font-body text-sm text-coal">{order.cashierNotes}</p>
            </div>
          )}

          {/* Order number */}
          <div>
            <label className="label-field">Número de orden *</label>
            <div className="relative">
              <Hash size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-coal/40" />
              <input
                className="input-field pl-9"
                value={orderNumber}
                onChange={e => setOrderNumber(e.target.value)}
                placeholder="Ej: 001"
              />
            </div>
          </div>

          {/* Prices */}
          <div className="card">
            <p className="font-display text-base tracking-wide mb-3">💰 Precios</p>
            <div className="grid grid-cols-2 gap-3 mb-3">
              <div>
                <label className="label-field">Valor pedido</label>
                <input className="input-field" value={quotedPrice}
                  onChange={e => setQuotedPrice(e.target.value)} placeholder="$0" type="number" />
              </div>
              <div>
                <label className="label-field">Domicilio</label>
                <input className="input-field" value={deliveryPrice}
                  onChange={e => setDeliveryPrice(e.target.value)} placeholder="$0" type="number" />
              </div>
            </div>
            <div className="bg-cherry/5 border border-cherry/20 rounded-xl px-4 py-3 flex items-center justify-between">
              <span className="font-body font-semibold text-sm text-coal">TOTAL A PAGAR</span>
              <span className="font-display text-xl text-cherry">{fmt(total)}</span>
            </div>
          </div>

          {/* Cash handling */}
          {cashOnDelivery && (
            <div className="card border border-mustard/30">
              <p className="font-display text-base tracking-wide mb-3">💵 Manejo de efectivo</p>
              <div className="flex gap-3 mb-3">
                <button
                  onClick={() => setPayExact(true)}
                  className={`flex-1 py-2 rounded-xl text-sm font-semibold font-body border-2 transition-colors ${
                    payExact ? 'border-mint bg-mint/10 text-mint' : 'border-coal/20 text-coal/50'
                  }`}
                >
                  ✓ Paga exacto
                </button>
                <button
                  onClick={() => setPayExact(false)}
                  className={`flex-1 py-2 rounded-xl text-sm font-semibold font-body border-2 transition-colors ${
                    !payExact ? 'border-mustard bg-mustard/10 text-coal' : 'border-coal/20 text-coal/50'
                  }`}
                >
                  💸 Necesita cambio
                </button>
              </div>
              {!payExact && (
                <div className="flex flex-col gap-2 animate-fade-in">
                  <div>
                    <label className="label-field">¿Con cuánto paga el cliente?</label>
                    <input className="input-field" value={payAmount}
                      onChange={e => setPayAmount(e.target.value)} placeholder="$0" type="number" />
                  </div>
                  {pa > 0 && (
                    <div className="bg-mustard/10 border border-mustard/30 rounded-xl px-4 py-3 flex items-center justify-between">
                      <span className="font-body font-semibold text-sm text-coal">Cambio a dar al cliente:</span>
                      <span className="font-display text-lg text-mustard">{fmt(change >= 0 ? change : 0)}</span>
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          {/* Driver assignment */}
          <div>
            <label className="label-field">🚴 Domiciliario *</label>
            <select className="input-field" value={driverId} onChange={e => setDriverId(e.target.value)}>
              <option value="">— Selecciona domiciliario —</option>
              {drivers.map(d => (
                <option key={d.id} value={d.id}>{d.name || d.id}</option>
              ))}
            </select>
          </div>

          {/* Driver notes */}
          <div>
            <label className="label-field">Comentarios para el domiciliario</label>
            <textarea className="textarea-field h-20 scroll-custom" value={driverNotes}
              onChange={e => setDriverNotes(e.target.value)}
              placeholder="Indicaciones especiales para la entrega…" />
          </div>

          {/* Actions */}
          <div className="flex gap-3 pb-4">
            <button onClick={onClose} className="btn-secondary flex-1">Cancelar</button>
            <button onClick={handleSend} disabled={loading} className="btn-primary flex-1">
              <Bike size={16} />
              {loading ? 'Enviando…' : 'Enviar al domiciliario'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
