import { useState } from 'react'
import { doc, updateDoc, serverTimestamp } from 'firebase/firestore'
import { db } from '../../services/firebase'
import StatusBadge from '../common/StatusBadge'
import { format } from 'date-fns'
import { es } from 'date-fns/locale'
import {
  X, MapPin, Phone, User, ShoppingBag,
  CreditCard, Bike, DollarSign, Navigation, ExternalLink
} from 'lucide-react'

export default function OrderDetail({ order, onClose, drivers = [] }) {
  const [loading,          setLoading]          = useState(false)
  const [selectedDriverId, setSelectedDriverId] = useState('')

  const time = order.createdAt?.toDate
    ? format(order.createdAt.toDate(), "dd MMM yyyy 'a las' HH:mm", { locale: es })
    : '--'

  const assignDriver = async () => {
    if (!selectedDriverId) return
    const driver = drivers.find(d => d.id === selectedDriverId)
    setLoading(true)
    try {
      await updateDoc(doc(db, 'orders', order.id), {
        status:      'assigned',
        driverEmail: driver?.id || selectedDriverId,
        driverName:  driver?.name || selectedDriverId,
        updatedAt:   serverTimestamp(),
      })
      onClose()
    } finally { setLoading(false) }
  }

  const markCashReceived = async () => {
    setLoading(true)
    try {
      await updateDoc(doc(db, 'orders', order.id), {
        status: 'completed',
        cashReceivedAt: serverTimestamp(),
      })
      onClose()
    } finally { setLoading(false) }
  }

  const openMaps = () => {
    const addr = encodeURIComponent(order.fullAddress + ', Medellín, Colombia')
    window.open(`https://www.google.com/maps/search/?api=1&query=${addr}`, '_blank')
  }

  const openWaze = () => {
    const addr = encodeURIComponent(order.fullAddress)
    window.open(`https://waze.com/ul?q=${addr}`, '_blank')
  }

  const openDriverTracking = () => {
    if (order.driverLat && order.driverLng) {
      window.open(
        `https://www.google.com/maps/search/?api=1&query=${order.driverLat},${order.driverLng}`,
        '_blank'
      )
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-coal/50 backdrop-blur-sm animate-fade-in"
      onClick={e => { if (e.target === e.currentTarget) onClose() }}>
      <div className="bg-cream w-full max-w-lg rounded-t-3xl sm:rounded-3xl max-h-[90dvh] overflow-y-auto scroll-custom animate-slide-in-right sm:animate-scale-in">
        {/* Header */}
        <div className="sticky top-0 bg-cream/95 backdrop-blur-sm flex items-center justify-between px-5 py-4 border-b border-coal/10">
          <div className="flex items-center gap-2">
            {order.orderNumber && <span className="font-display text-2xl text-cherry">#{order.orderNumber}</span>}
            <StatusBadge status={order.status} />
          </div>
          <button onClick={onClose} className="btn-icon"><X size={20} /></button>
        </div>

        <div className="p-5 flex flex-col gap-4">
          {/* Date */}
          <p className="font-body text-xs text-coal/40">{time}</p>

          {/* Client info */}
          <Section title="Cliente">
            <Row icon={User}  label="Nombre"   value={order.name} />
            <Row icon={Phone} label="Teléfono" value={order.phone} />
          </Section>

          {/* Address */}
          <Section title="Dirección de entrega">
            <Row icon={MapPin} label="Dirección" value={order.fullAddress} />
            {order.barrio    && <Row icon={MapPin} label="Barrio"     value={order.barrio} />}
            {order.reference && <Row icon={MapPin} label="Referencia" value={order.reference} />}
            <div className="flex gap-2 mt-3">
              <button onClick={openMaps} className="btn-secondary btn-sm flex-1">
                <Navigation size={14} /> Google Maps
              </button>
              <button onClick={openWaze} className="btn-secondary btn-sm flex-1">
                <ExternalLink size={14} /> Waze
              </button>
            </div>
          </Section>

          {/* Order items */}
          <Section title="Pedido">
            <div className="bg-smoked/60 rounded-xl p-3">
              <p className="font-body text-sm text-coal whitespace-pre-wrap">{order.items}</p>
            </div>
            {order.notes && (
              <div className="bg-mustard/10 border border-mustard/20 rounded-xl p-3 mt-2">
                <p className="font-body text-xs text-coal/70 uppercase tracking-wider mb-1">Indicaciones</p>
                <p className="font-body text-sm text-coal">{order.notes}</p>
              </div>
            )}
          </Section>

          {/* Payment */}
          <Section title="Pago">
            <Row icon={CreditCard} label="Forma de pago" value={order.payment} />
          </Section>

          {/* Assign driver for pending client orders */}
          {order.status === 'pending' && (
            <div className="bg-mustard/10 border border-mustard/30 rounded-2xl p-4 flex flex-col gap-3">
              <p className="font-display text-lg text-coal tracking-wide">🛵 Asignar domiciliario</p>
              <p className="font-body text-xs text-coal/60">Pedido enviado por el cliente. Asígnale un domiciliario para confirmarlo.</p>
              <select
                value={selectedDriverId}
                onChange={e => setSelectedDriverId(e.target.value)}
                className="input-field"
              >
                <option value="">— Selecciona domiciliario —</option>
                {drivers.map(d => (
                  <option key={d.id} value={d.id}>{d.name || d.id}</option>
                ))}
              </select>
              <button onClick={assignDriver} disabled={loading || !selectedDriverId} className="btn-primary w-full">
                {loading ? 'Asignando…' : '✅ Confirmar pedido'}
              </button>
            </div>
          )}

          {/* Driver */}
          {order.driverName && (
            <Section title="Domiciliario">
              <Row icon={Bike} label="Asignado a" value={order.driverName} />
              {['in_transit','arrived'].includes(order.status) && order.driverLat && (
                <button onClick={openDriverTracking} className="btn-primary btn-sm w-full mt-2">
                  <Navigation size={14} /> Ver ubicación en tiempo real
                </button>
              )}
              {['in_transit','arrived'].includes(order.status) && !order.driverLat && (
                <p className="text-xs text-coal/40 font-body mt-2">Esperando posición del domiciliario…</p>
              )}
            </Section>
          )}

          {/* Cash cuadre action */}
          {order.status === 'pending_cuadre' && (
            <div className="bg-mustard/10 border border-mustard/30 rounded-2xl p-4 flex flex-col gap-3">
              <p className="font-display text-lg text-coal tracking-wide">💰 Cuadre de caja</p>
              <p className="font-body text-sm text-coal/70">
                El domiciliario ya entregó el pedido. Marca como recibido cuando te entregue el dinero.
              </p>
              <button onClick={markCashReceived} disabled={loading} className="btn-mustard w-full">
                <DollarSign size={16} />
                {loading ? 'Procesando…' : 'Dinero recibido ✓'}
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

function Section({ title, children }) {
  return (
    <div>
      <p className="label-field mb-2">{title}</p>
      <div className="flex flex-col gap-1.5">{children}</div>
    </div>
  )
}

function Row({ icon: Icon, label, value }) {
  if (!value) return null
  return (
    <div className="flex items-start gap-2">
      <Icon size={14} className="text-coal/40 flex-shrink-0 mt-0.5" />
      <div>
        <span className="font-body text-xs text-coal/50">{label}: </span>
        <span className="font-body text-sm text-coal">{value}</span>
      </div>
    </div>
  )
}
