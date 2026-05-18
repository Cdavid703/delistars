import { useState, useEffect } from 'react'
import { doc, updateDoc, serverTimestamp } from 'firebase/firestore'
import { db } from '../../services/firebase'
import { SEDES } from '../../services/roles'
import StatusBadge from '../common/StatusBadge'
import { format } from 'date-fns'
import { es } from 'date-fns/locale'
import {
  X, MapPin, Phone, User, ShoppingBag,
  CreditCard, Bike, DollarSign, Navigation, ExternalLink,
  AlertTriangle, XCircle, CheckCircle2
} from 'lucide-react'

function haversineKm(lat1, lng1, lat2, lng2) {
  const R = 6371
  const dLat = (lat2 - lat1) * Math.PI / 180
  const dLng = (lng2 - lng1) * Math.PI / 180
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.sin(dLng / 2) ** 2
  return R * 2 * Math.asin(Math.sqrt(a))
}

export default function OrderDetail({ order, onClose, drivers = [] }) {
  const [loading,          setLoading]          = useState(false)
  const [selectedDriverId, setSelectedDriverId] = useState('')
  const [rejecting,        setRejecting]        = useState(false)
  const [rejectReason,     setRejectReason]     = useState('')
  const [distanceKm,       setDistanceKm]       = useState(null)

  const orderSede = SEDES[order.sedeId]

  // Try to geocode delivery address and calculate distance
  useEffect(() => {
    if (!order.fullAddress || !orderSede) return
    const query = encodeURIComponent(order.fullAddress + ', Medellín, Colombia')
    fetch(`https://nominatim.openstreetmap.org/search?q=${query}&format=json&limit=1`, {
      headers: { 'Accept-Language': 'es' },
    })
      .then(r => r.json())
      .then(results => {
        if (results[0]) {
          const km = haversineKm(
            orderSede.coords.lat, orderSede.coords.lng,
            parseFloat(results[0].lat), parseFloat(results[0].lon)
          )
          setDistanceKm(km)
        }
      })
      .catch(() => {})
  }, [order.fullAddress, orderSede])

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

  const rejectOrder = async () => {
    if (!rejectReason.trim()) return
    setLoading(true)
    try {
      await updateDoc(doc(db, 'orders', order.id), {
        status:          'rejected',
        rejectionReason: rejectReason.trim(),
        updatedAt:       serverTimestamp(),
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

  const openDirections = () => {
    const dest = encodeURIComponent(order.fullAddress + ', Medellín, Colombia')
    if (orderSede) {
      const origin = `${orderSede.coords.lat},${orderSede.coords.lng}`
      window.open(`https://www.google.com/maps/dir/?api=1&origin=${origin}&destination=${dest}`, '_blank')
    } else {
      window.open(`https://www.google.com/maps/search/?api=1&query=${dest}`, '_blank')
    }
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

  const distColor = distanceKm === null ? '' : distanceKm > 5 ? 'text-pepper' : distanceKm > 3 ? 'text-mustard' : 'text-mint'
  const distLabel = distanceKm === null ? 'Calculando distancia…' : `~${distanceKm.toFixed(1)} km de la sede`

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
          <p className="font-body text-xs text-coal/40">{time}</p>

          {/* Client info */}
          <Section title="Cliente">
            <Row icon={User}  label="Nombre"   value={order.name || order.clientName} />
            <Row icon={Phone} label="Teléfono" value={order.phone} />
          </Section>

          {/* Address + distance */}
          <Section title="Dirección de entrega">
            <Row icon={MapPin} label="Dirección" value={order.fullAddress} />
            {order.barrio    && <Row icon={MapPin} label="Barrio"     value={order.barrio} />}
            {order.reference && <Row icon={MapPin} label="Referencia" value={order.reference} />}

            {/* Distance indicator */}
            {order.fullAddress && (
              <div className={`flex items-center gap-1.5 mt-1 ${distColor}`}>
                {distanceKm !== null && distanceKm > 5 && <AlertTriangle size={14} />}
                <span className="font-body text-xs font-semibold">{distLabel}</span>
                {distanceKm !== null && distanceKm > 5 && (
                  <span className="font-body text-xs text-pepper">(fuera de cobertura recomendada)</span>
                )}
              </div>
            )}

            <div className="flex gap-2 mt-3">
              <button onClick={openDirections} className="btn-secondary btn-sm flex-1">
                <Navigation size={14} /> Ver ruta
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

          {/* Assign driver OR reject — for pending client orders */}
          {order.status === 'pending' && !rejecting && (
            <div className="bg-mustard/10 border border-mustard/30 rounded-2xl p-4 flex flex-col gap-3">
              <p className="font-display text-lg text-coal tracking-wide">🛵 Asignar domiciliario</p>
              <p className="font-body text-xs text-coal/60">
                Pedido enviado por el cliente. Asígnale un domiciliario para confirmarlo.
              </p>
              {distanceKm !== null && distanceKm > 5 && (
                <div className="flex items-center gap-2 bg-pepper/10 border border-pepper/30 rounded-xl px-3 py-2">
                  <AlertTriangle size={14} className="text-pepper flex-shrink-0" />
                  <p className="font-body text-xs text-pepper">
                    La dirección está a {distanceKm.toFixed(1)} km de la sede. Verifica antes de confirmar.
                  </p>
                </div>
              )}
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
              <div className="flex gap-2">
                <button
                  onClick={() => setRejecting(true)}
                  className="flex-1 flex items-center justify-center gap-2 px-4 py-2 rounded-xl border-2 border-pepper/40 text-pepper font-semibold text-sm hover:bg-pepper/10 transition-colors"
                >
                  <XCircle size={16} /> Rechazar
                </button>
                <button onClick={assignDriver} disabled={loading || !selectedDriverId} className="btn-primary flex-1">
                  <CheckCircle2 size={16} />
                  {loading ? 'Asignando…' : 'Confirmar'}
                </button>
              </div>
            </div>
          )}

          {/* Rejection form */}
          {order.status === 'pending' && rejecting && (
            <div className="bg-pepper/10 border border-pepper/30 rounded-2xl p-4 flex flex-col gap-3">
              <p className="font-display text-lg text-pepper tracking-wide">❌ Rechazar pedido</p>
              <p className="font-body text-xs text-coal/60">
                Escribe el motivo del rechazo. El cliente lo verá en su panel.
              </p>
              <div className="flex flex-col gap-1">
                <button
                  onClick={() => setRejectReason('Fuera del área de cobertura (más de 5 km de la sede)')}
                  className="text-left text-xs font-body text-coal/60 hover:text-pepper underline"
                >
                  → Fuera de cobertura (&gt;5 km)
                </button>
                <button
                  onClick={() => setRejectReason('No tenemos disponibilidad en este momento')}
                  className="text-left text-xs font-body text-coal/60 hover:text-pepper underline"
                >
                  → Sin disponibilidad
                </button>
                <button
                  onClick={() => setRejectReason('Dirección incompleta o no encontrada')}
                  className="text-left text-xs font-body text-coal/60 hover:text-pepper underline"
                >
                  → Dirección no encontrada
                </button>
              </div>
              <textarea
                className="textarea-field h-20 scroll-custom"
                placeholder="Motivo del rechazo…"
                value={rejectReason}
                onChange={e => setRejectReason(e.target.value)}
              />
              <div className="flex gap-2">
                <button onClick={() => setRejecting(false)} className="btn-secondary flex-1">
                  Cancelar
                </button>
                <button
                  onClick={rejectOrder}
                  disabled={loading || !rejectReason.trim()}
                  className="flex-1 flex items-center justify-center gap-2 px-4 py-2 rounded-xl bg-pepper text-cream font-semibold text-sm hover:bg-pepper/90 disabled:opacity-50 transition-colors"
                >
                  {loading ? 'Rechazando…' : '❌ Confirmar rechazo'}
                </button>
              </div>
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

          {/* Rejection info */}
          {order.status === 'rejected' && order.rejectionReason && (
            <div className="bg-pepper/10 border border-pepper/30 rounded-2xl p-4">
              <p className="font-display text-base text-pepper tracking-wide mb-1">❌ Pedido rechazado</p>
              <p className="font-body text-sm text-coal/80">Motivo: {order.rejectionReason}</p>
            </div>
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
