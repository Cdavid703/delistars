import { useState, useEffect } from 'react'
import { doc, updateDoc, serverTimestamp, arrayUnion } from 'firebase/firestore'
import { db } from '../../services/firebase'
import { useAuth } from '../../contexts/AuthContext'
import { SEDES } from '../../services/roles'
import StatusBadge from '../common/StatusBadge'
import { format } from 'date-fns'
import { es } from 'date-fns/locale'
import {
  X, MapPin, Phone, User, ShoppingBag,
  CreditCard, Bike, Navigation, ExternalLink,
  AlertTriangle, XCircle, CheckCircle2, BellOff,
  Printer, Hash, DollarSign, MessageSquare, Clock,
  Send, FileCheck, CheckCircle
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

const fmt    = v => (v !== undefined && v !== null && v !== '') ? `$${Number(v).toLocaleString('es-CO')}` : '—'
const escHtml = s => String(s ?? '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#x27;')

const fmtTime = (ts) => {
  if (!ts?.toDate) return null
  return format(ts.toDate(), "dd MMM HH:mm", { locale: es })
}

export default function OrderDetail({ order, onClose, drivers = [], alarmActive = false, onDismissAlarm, onReassign }) {
  const { user } = useAuth()
  const [loading,          setLoading]          = useState(false)
  const [rejecting,        setRejecting]        = useState(false)
  const [rejectReason,     setRejectReason]     = useState('')
  const [distanceKm,       setDistanceKm]       = useState(null)
  const [commentText,      setCommentText]      = useState('')
  const [sendingComment,   setSendingComment]   = useState(false)
  const [validatingTransfer, setValidatingTransfer] = useState(false)
  const [editingPrice,      setEditingPrice]      = useState(false)
  const [editQuotedPrice,   setEditQuotedPrice]   = useState(String(order.quotedPrice   ?? ''))
  const [editDeliveryPrice, setEditDeliveryPrice] = useState(String(order.deliveryPrice ?? ''))
  const [clientMsgText,     setClientMsgText]     = useState('')
  const [sendingClientMsg,  setSendingClientMsg]  = useState(false)

  // Quote form state (for pending orders)
  const [localOrderNumber,   setLocalOrderNumber]   = useState(order.orderNumber   || '')
  const [localQuotedPrice,   setLocalQuotedPrice]   = useState(String(order.quotedPrice   ?? ''))
  const [localDeliveryPrice, setLocalDeliveryPrice] = useState(String(order.deliveryPrice ?? ''))
  const [localCashierNotes,  setLocalCashierNotes]  = useState(order.cashierNotes  || '')
  const [quoteErrors,        setQuoteErrors]         = useState([])

  const orderSede = SEDES[order.sedeId]

  useEffect(() => {
    if (!order.fullAddress || !orderSede) { setDistanceKm(-1); return }
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), 8000)
    const q = encodeURIComponent(order.fullAddress + ', Medellín, Colombia')
    const url = `https://photon.komoot.io/api/?q=${q}&limit=1&lat=6.2442&lon=-75.5812`
    fetch(url, { signal: controller.signal })
      .then(r => { if (!r.ok) throw new Error(r.status); return r.json() })
      .then(data => {
        clearTimeout(timer)
        const feature = data.features?.[0]
        if (feature) {
          const [lon, lat] = feature.geometry.coordinates
          setDistanceKm(haversineKm(orderSede.coords.lat, orderSede.coords.lng, lat, lon))
        } else {
          setDistanceKm(-1)
        }
      })
      .catch(() => setDistanceKm(-1))
  }, [order.fullAddress, orderSede])

  const time = order.createdAt?.toDate
    ? format(order.createdAt.toDate(), "dd MMM yyyy 'a las' HH:mm", { locale: es })
    : '--'

  const lqp   = parseFloat(localQuotedPrice)   || 0
  const ldp   = parseFloat(localDeliveryPrice) || 0
  const localTotal = lqp + ldp

  const sendQuote = async () => {
    const errs = []
    if (!localOrderNumber.trim()) errs.push('El número de orden es obligatorio')
    if (errs.length) { setQuoteErrors(errs); return }
    setLoading(true)
    try {
      await updateDoc(doc(db, 'orders', order.id), {
        status:        'quoted',
        orderNumber:   localOrderNumber.trim(),
        quotedPrice:   lqp,
        deliveryPrice: ldp,
        totalPrice:    localTotal,
        cashierNotes:  localCashierNotes.trim(),
        quotedAt:      serverTimestamp(),
        updatedAt:     serverTimestamp(),
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

  const markPreparing = async () => {
    setLoading(true)
    try {
      await updateDoc(doc(db, 'orders', order.id), {
        status:      'preparing',
        preparingAt: serverTimestamp(),
        updatedAt:   serverTimestamp(),
      })
    } finally { setLoading(false) }
  }

  const markCashReceived = async () => {
    setLoading(true)
    try {
      await updateDoc(doc(db, 'orders', order.id), {
        status:          'completed',
        completedAt:     serverTimestamp(),
        updatedAt:       serverTimestamp(),
      })
      onClose()
    } finally { setLoading(false) }
  }

  const openDirections = () => {
    const dest = encodeURIComponent(order.fullAddress + ', Medellín, Colombia')
    if (orderSede) {
      // Preferimos la dirección textual completa de la sede (cadena Google Maps).
      // Si por alguna razón no existe, caemos a lat/lng como fallback.
      const originStr = orderSede.mapsAddress || orderSede.address
      const origin = originStr
        ? encodeURIComponent(originStr)
        : `${orderSede.coords.lat},${orderSede.coords.lng}`
      window.open(`https://www.google.com/maps/dir/?api=1&origin=${origin}&destination=${dest}`, '_blank')
    } else {
      window.open(`https://www.google.com/maps/search/?api=1&query=${dest}`, '_blank')
    }
  }

  const openWaze = () => {
    window.open(`https://waze.com/ul?q=${encodeURIComponent(order.fullAddress)}`, '_blank')
  }

  const openDriverTracking = () => {
    if (order.driverLat && order.driverLng) {
      window.open(`https://www.google.com/maps/search/?api=1&query=${order.driverLat},${order.driverLng}`, '_blank')
    }
  }

  const handlePrint = () => {
    const orderNum    = escHtml(order.orderNumber || '')
    const clientName  = escHtml(order.name || order.clientName || '—')
    const qp          = fmt(order.quotedPrice)
    const dp          = fmt(order.deliveryPrice)
    const tp          = fmt(order.totalPrice)
    const paymentStr  = escHtml(order.payment || '—')
    const items       = escHtml(order.items || '').replace(/\n/g, '<br/>')
    const notesStr    = order.notes ? `<p><em>Indicaciones: ${escHtml(order.notes)}</em></p>` : ''
    const cajeroNote  = order.cashierNotes ? `<p><em>Nota: ${escHtml(order.cashierNotes)}</em></p>` : ''
    const date        = new Date().toLocaleString('es-CO')

    const win = window.open('', '_blank', 'width=420,height=700')
    win.document.write(`<!DOCTYPE html><html><head><title>Pedido ${orderNum ? '#'+orderNum : ''}</title>
    <style>
      body{font-family:monospace;padding:20px;max-width:380px;margin:0 auto}
      h2{text-align:center;border-bottom:2px dashed #000;padding-bottom:10px}
      .row{display:flex;justify-content:space-between;margin:5px 0;font-size:13px}
      .bold{font-weight:bold}.divider{border-top:1px dashed #999;margin:10px 0}
      .total{font-size:16px;font-weight:bold}.center{text-align:center}
      .items{background:#f5f5f5;padding:10px;margin:8px 0;font-size:13px;white-space:pre-wrap}
      .num{font-size:22px;font-weight:bold;text-align:center;margin:5px 0}
    </style></head><body>
    <h2>⭐ DeliStars ⭐</h2>
    ${orderNum ? `<div class="num">#${orderNum}</div>` : ''}
    <p class="center" style="font-size:11px">${date}</p>
    <div class="divider"></div>
    <div class="row"><span class="bold">Cliente:</span><span>${clientName}</span></div>
    <div class="row"><span class="bold">Tel:</span><span>${escHtml(order.phone || '—')}</span></div>
    <div class="row"><span class="bold">Dirección:</span><span>${escHtml(order.fullAddress || '—')}</span></div>
    ${order.barrio ? `<div class="row"><span class="bold">Barrio:</span><span>${escHtml(order.barrio)}</span></div>` : ''}
    <div class="divider"></div>
    <p class="bold">Pedido:</p>
    <div class="items">${items}</div>
    ${notesStr}
    <div class="divider"></div>
    <div class="row"><span>Valor pedido:</span><span>${qp}</span></div>
    <div class="row"><span>Domicilio:</span><span>${dp}</span></div>
    <div class="divider"></div>
    <div class="row total"><span>TOTAL:</span><span>${tp}</span></div>
    <div class="row"><span class="bold">Pago:</span><span>${paymentStr}</span></div>
    ${cajeroNote}
    <div class="divider"></div>
    <p class="center">¡Gracias por tu pedido!</p>
    <script>window.onload=function(){window.print();}</script>
    </body></html>`)
    win.document.close()
  }

  const sendComment = async () => {
    if (!commentText.trim()) return
    setSendingComment(true)
    try {
      await updateDoc(doc(db, 'orders', order.id), {
        comments: arrayUnion({
          role: 'cashier',
          name: user?.displayName || user?.email || 'Cajero',
          text: commentText.trim(),
          ts:   Date.now(),
        }),
        updatedAt: serverTimestamp(),
      })
      setCommentText('')
    } finally { setSendingComment(false) }
  }

  const validateTransfer = async () => {
    setValidatingTransfer(true)
    try {
      await updateDoc(doc(db, 'orders', order.id), {
        transferValidated: true,
        updatedAt: serverTimestamp(),
      })
    } finally { setValidatingTransfer(false) }
  }

  const saveEditedPrice = async () => {
    const qp = parseFloat(editQuotedPrice)  || 0
    const dp = parseFloat(editDeliveryPrice) || 0
    setLoading(true)
    try {
      await updateDoc(doc(db, 'orders', order.id), {
        quotedPrice:   qp,
        deliveryPrice: dp,
        totalPrice:    qp + dp,
        updatedAt:     serverTimestamp(),
      })
      setEditingPrice(false)
    } finally { setLoading(false) }
  }

  const sendClientMessage = async () => {
    if (!clientMsgText.trim()) return
    setSendingClientMsg(true)
    try {
      await updateDoc(doc(db, 'orders', order.id), {
        clientMessages: arrayUnion({
          role: 'cashier',
          name: user?.displayName || user?.email || 'Cajero',
          text: clientMsgText.trim(),
          ts:   Date.now(),
        }),
        updatedAt: serverTimestamp(),
      })
      setClientMsgText('')
    } finally { setSendingClientMsg(false) }
  }

  const distColor = distanceKm === null ? 'text-coal/40'
    : distanceKm < 0 ? 'text-coal/30'
    : distanceKm > 5 ? 'text-pepper'
    : distanceKm > 3 ? 'text-mustard'
    : 'text-mint'
  const distLabel = distanceKm === null ? 'Calculando distancia…'
    : distanceKm < 0 ? 'Distancia no disponible'
    : `~${distanceKm.toFixed(1)} km de la sede`

  // Timestamps
  const timestamps = [
    { label: 'Recibido',          ts: order.createdAt },
    { label: 'Cotizado',          ts: order.quotedAt },
    { label: 'Asignado',          ts: order.assignedAt },
    { label: 'Aceptado',          ts: order.acceptedAt },
    { label: 'En camino',         ts: order.inTransitAt },
    { label: 'Llegó al destino',  ts: order.arrivedAt },
    { label: 'Entregado',         ts: order.deliveredAt },
    { label: 'Completado',        ts: order.completedAt },
  ].filter(t => t.ts)

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
          <div className="flex items-center gap-1">
            {alarmActive && onDismissAlarm && (
              <button
                onClick={onDismissAlarm}
                title="Silenciar alarma"
                className="flex items-center gap-1 px-3 py-1.5 rounded-full bg-cherry/10 border border-cherry/30 text-cherry text-xs font-semibold font-body hover:bg-cherry/20 transition-colors"
              >
                <BellOff size={14} /> Silenciar
              </button>
            )}
            <button onClick={handlePrint} title="Imprimir pedido" className="btn-icon text-coal/50 hover:text-coal">
              <Printer size={18} />
            </button>
            <button onClick={onClose} className="btn-icon"><X size={20} /></button>
          </div>
        </div>

        <div className="p-5 flex flex-col gap-4">
          <p className="font-body text-xs text-coal/40">{time}</p>

          {/* Client info */}
          <Section title="Cliente">
            <Row icon={User}  label="Nombre"   value={order.name || order.clientName} />
            <Row icon={Phone} label="Teléfono" value={order.phone} />
            {order.phone && (() => {
              const digits  = order.phone.replace(/\D/g, '')
              const waPhone = digits.length >= 10 ? `57${digits.slice(-10)}` : digits
              return (
                <a href={`https://wa.me/${waPhone}`} target="_blank" rel="noreferrer"
                  className="inline-flex items-center gap-1.5 mt-1 px-3 py-1.5 rounded-xl bg-[#25D366]/10 border border-[#25D366]/30 text-[#25D366] font-body text-xs font-semibold hover:bg-[#25D366]/20 transition-colors w-fit">
                  📱 WhatsApp cliente
                </a>
              )
            })()}
          </Section>

          {/* Address + distance */}
          <Section title="Dirección de entrega">
            <Row icon={MapPin} label="Dirección"  value={order.fullAddress} />
            {order.barrio    && <Row icon={MapPin} label="Barrio"     value={order.barrio} />}
            {order.reference && <Row icon={MapPin} label="Referencia" value={order.reference} />}

            {order.fullAddress && (
              <div className={`flex items-center gap-1.5 mt-1 ${distColor}`}>
                {distanceKm !== null && distanceKm > 0 && distanceKm > 5 && <AlertTriangle size={14} />}
                <span className="font-body text-xs font-semibold">{distLabel}</span>
                {distanceKm !== null && distanceKm > 0 && distanceKm > 5 && (
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

          {/* Transfer receipt */}
          {['Transferencia', 'Nequi'].includes(order.payment) && order.transferReceiptUrl && (
            <div className={`card border flex flex-col gap-3 ${order.transferValidated ? 'border-mint/30 bg-mint/5' : 'border-mustard/30 bg-mustard/5'}`}>
              <div className="flex items-center gap-2">
                <FileCheck size={16} className={order.transferValidated ? 'text-mint' : 'text-mustard'} />
                <p className="font-display text-sm tracking-wide text-coal">Comprobante de transferencia</p>
                {order.transferValidated && (
                  <span className="ml-auto text-[10px] font-bold uppercase tracking-wider text-mint bg-mint/10 px-2 py-0.5 rounded-full">✓ Validado</span>
                )}
              </div>
              <a href={order.transferReceiptUrl} target="_blank" rel="noreferrer"
                className="flex items-center gap-2 text-sm font-body font-semibold text-cherry underline underline-offset-2">
                <ExternalLink size={14} /> Ver comprobante
              </a>
              {!order.transferValidated && (
                <button onClick={validateTransfer} disabled={validatingTransfer}
                  className="btn-mint btn-sm w-full">
                  <CheckCircle size={14} />
                  {validatingTransfer ? 'Validando…' : 'Confirmar pago recibido ✓'}
                </button>
              )}
            </div>
          )}

          {/* Quoted prices (if already set) */}
          {order.totalPrice > 0 && (
            <div className="card bg-tangelo/5 border border-tangelo/20">
              <div className="flex items-center justify-between mb-3">
                <p className="font-display text-base tracking-wide">💰 Cotización enviada</p>
                {!['rejected','cancelled','completed'].includes(order.status) && !editingPrice && (
                  <button
                    onClick={() => { setEditQuotedPrice(String(order.quotedPrice ?? '')); setEditDeliveryPrice(String(order.deliveryPrice ?? '')); setEditingPrice(true) }}
                    className="text-xs font-body font-semibold text-tangelo underline underline-offset-2"
                  >
                    ✏️ Editar precio
                  </button>
                )}
              </div>
              {editingPrice ? (
                <div className="flex flex-col gap-3">
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="label-field">Valor pedido</label>
                      <input className="input-field" value={editQuotedPrice}
                        onChange={e => setEditQuotedPrice(e.target.value)} placeholder="$0" type="number" />
                    </div>
                    <div>
                      <label className="label-field">Domicilio</label>
                      <input className="input-field" value={editDeliveryPrice}
                        onChange={e => setEditDeliveryPrice(e.target.value)} placeholder="$0" type="number" />
                    </div>
                  </div>
                  <div className="bg-cherry/5 border border-cherry/20 rounded-xl px-4 py-2 flex items-center justify-between">
                    <span className="font-body text-sm font-semibold">TOTAL</span>
                    <span className="font-display text-lg text-cherry">{fmt((parseFloat(editQuotedPrice)||0) + (parseFloat(editDeliveryPrice)||0))}</span>
                  </div>
                  <div className="flex gap-2">
                    <button onClick={() => setEditingPrice(false)} className="btn-secondary flex-1 btn-sm">Cancelar</button>
                    <button onClick={saveEditedPrice} disabled={loading} className="btn-primary flex-1 btn-sm">
                      {loading ? 'Guardando…' : '✓ Guardar precio'}
                    </button>
                  </div>
                </div>
              ) : (
                <div className="flex flex-col gap-1.5">
                  <div className="flex justify-between font-body text-sm">
                    <span className="text-coal/60">Valor pedido:</span>
                    <span className="font-semibold">{fmt(order.quotedPrice)}</span>
                  </div>
                  <div className="flex justify-between font-body text-sm">
                    <span className="text-coal/60">Domicilio:</span>
                    <span className="font-semibold">{fmt(order.deliveryPrice)}</span>
                  </div>
                  <div className="border-t border-tangelo/20 pt-2 flex justify-between">
                    <span className="font-body font-bold text-coal">TOTAL:</span>
                    <span className="font-display text-xl text-tangelo">{fmt(order.totalPrice)}</span>
                  </div>
                </div>
              )}
              {order.cashierNotes && !editingPrice && (
                <div className="mt-3 bg-mustard/10 rounded-xl p-3">
                  <p className="font-body text-xs text-coal/50 uppercase tracking-wider mb-1">Nota al cliente</p>
                  <p className="font-body text-sm text-coal">{order.cashierNotes}</p>
                </div>
              )}
            </div>
          )}

          {/* ── COTIZACIÓN FORM (only for pending orders) ── */}
          {order.status === 'pending' && !rejecting && (
            <div className="bg-mustard/10 border border-mustard/30 rounded-2xl p-4 flex flex-col gap-3">
              <p className="font-display text-lg text-coal tracking-wide">📋 Cotizar pedido al cliente</p>

              {distanceKm !== null && distanceKm > 0 && distanceKm > 5 && (
                <div className="flex items-center gap-2 bg-pepper/10 border border-pepper/30 rounded-xl px-3 py-2">
                  <AlertTriangle size={14} className="text-pepper flex-shrink-0" />
                  <p className="font-body text-xs text-pepper">
                    {distanceKm.toFixed(1)} km de la sede — verifica antes de confirmar.
                  </p>
                </div>
              )}

              {quoteErrors.length > 0 && (
                <div className="bg-pepper/10 border border-pepper/20 rounded-xl p-3">
                  {quoteErrors.map(e => (
                    <p key={e} className="text-xs text-pepper font-body flex items-center gap-1">
                      <AlertTriangle size={12} /> {e}
                    </p>
                  ))}
                </div>
              )}

              {/* Order number */}
              <div>
                <label className="label-field">Número de orden *</label>
                <div className="relative">
                  <Hash size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-coal/40" />
                  <input className="input-field pl-9" value={localOrderNumber}
                    onChange={e => setLocalOrderNumber(e.target.value)} placeholder="Ej: 001" />
                </div>
              </div>

              {/* Prices */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="label-field">Valor pedido</label>
                  <input className="input-field" value={localQuotedPrice}
                    onChange={e => setLocalQuotedPrice(e.target.value)} placeholder="$0" type="number" />
                </div>
                <div>
                  <label className="label-field">Domicilio</label>
                  <input className="input-field" value={localDeliveryPrice}
                    onChange={e => setLocalDeliveryPrice(e.target.value)} placeholder="$0" type="number" />
                </div>
              </div>

              {/* Total */}
              {(lqp > 0 || ldp > 0) && (
                <div className="bg-cherry/5 border border-cherry/20 rounded-xl px-4 py-3 flex items-center justify-between">
                  <span className="font-body font-semibold text-sm text-coal">TOTAL</span>
                  <span className="font-display text-xl text-cherry">{fmt(localTotal)}</span>
                </div>
              )}

              {/* Cashier note to client */}
              <div>
                <label className="label-field">
                  <MessageSquare size={12} className="inline mr-1" />
                  Comentario para el cliente
                </label>
                <textarea className="textarea-field h-16 scroll-custom" value={localCashierNotes}
                  onChange={e => setLocalCashierNotes(e.target.value)}
                  placeholder="Ej: Tu pedido estará listo en 30 min, espera la confirmación de pago…" />
              </div>

              {/* Buttons */}
              <div className="flex gap-2">
                <button
                  onClick={() => setRejecting(true)}
                  className="flex items-center justify-center gap-2 px-4 py-2 rounded-xl border-2 border-pepper/40 text-pepper font-semibold text-sm hover:bg-pepper/10 transition-colors"
                >
                  <XCircle size={16} /> Rechazar
                </button>
                <button onClick={sendQuote} disabled={loading || !localOrderNumber.trim()} className="btn-primary flex-1">
                  <CheckCircle2 size={16} />
                  {loading ? 'Enviando…' : 'Enviar cotización al cliente'}
                </button>
              </div>
            </div>
          )}

          {/* Rejection form */}
          {order.status === 'pending' && rejecting && (
            <div className="bg-pepper/10 border border-pepper/30 rounded-2xl p-4 flex flex-col gap-3">
              <p className="font-display text-lg text-pepper tracking-wide">❌ Rechazar pedido</p>
              <p className="font-body text-xs text-coal/60">Escribe el motivo del rechazo. El cliente lo verá en su panel.</p>
              <div className="flex flex-col gap-1">
                <button onClick={() => setRejectReason('Fuera del área de cobertura (más de 5 km de la sede)')}
                  className="text-left text-xs font-body text-coal/60 hover:text-pepper underline">
                  → Fuera de cobertura (&gt;5 km)
                </button>
                <button onClick={() => setRejectReason('No tenemos disponibilidad en este momento')}
                  className="text-left text-xs font-body text-coal/60 hover:text-pepper underline">
                  → Sin disponibilidad
                </button>
                <button onClick={() => setRejectReason('Dirección incompleta o no encontrada')}
                  className="text-left text-xs font-body text-coal/60 hover:text-pepper underline">
                  → Dirección no encontrada
                </button>
              </div>
              <textarea className="textarea-field h-20 scroll-custom" placeholder="Motivo del rechazo…"
                value={rejectReason} onChange={e => setRejectReason(e.target.value)} />
              <div className="flex gap-2">
                <button onClick={() => setRejecting(false)} className="btn-secondary flex-1">Cancelar</button>
                <button onClick={rejectOrder} disabled={loading || !rejectReason.trim()}
                  className="flex-1 flex items-center justify-center gap-2 px-4 py-2 rounded-xl bg-pepper text-cream font-semibold text-sm hover:bg-pepper/90 disabled:opacity-50 transition-colors">
                  {loading ? 'Rechazando…' : '❌ Confirmar rechazo'}
                </button>
              </div>
            </div>
          )}

          {/* Driver info */}
          {order.driverName && (
            <Section title="Domiciliario">
              <Row icon={Bike} label="Asignado a" value={order.driverName} />
              {order.driverNotes && <Row icon={MessageSquare} label="Notas" value={order.driverNotes} />}
              {['in_transit','arrived'].includes(order.status) && order.driverLat && (
                <button onClick={openDriverTracking} className="btn-primary btn-sm w-full mt-2">
                  <Navigation size={14} /> Ver ubicación en tiempo real
                </button>
              )}
            </Section>
          )}

          {/* Reasignar domiciliario — solo cuando está asignado pero el driver no ha aceptado */}
          {order.status === 'assigned' && onReassign && (
            <div className="bg-tangelo/10 border border-tangelo/30 rounded-2xl p-4 flex flex-col gap-3">
              <p className="font-display text-base tracking-wide text-tangelo">🔄 Reasignar domiciliario</p>
              <p className="font-body text-xs text-coal/60">
                El domiciliario aún no ha aceptado. Avísale por WhatsApp o cámbialo.
              </p>
              {/* WhatsApp notify */}
              {(() => {
                const driver  = drivers.find(d => d.id === order.driverEmail)
                const rawPhone = driver?.phone || ''
                const digits   = rawPhone.replace(/\D/g, '')
                const waPhone  = digits.length >= 10 ? `57${digits.slice(-10)}` : ''
                const msg = encodeURIComponent(
                  `Hola ${order.driverName || 'domiciliario'} 👋 Tienes un pedido${order.orderNumber ? ` #${order.orderNumber}` : ''} asignado en DeliStars. Por favor abre la app y acéptalo. ¡Gracias! 🛵`
                )
                const waUrl = waPhone
                  ? `https://wa.me/${waPhone}?text=${msg}`
                  : `https://wa.me/?text=${msg}`
                return (
                  <a href={waUrl} target="_blank" rel="noreferrer"
                    className="flex items-center justify-center gap-2 w-full py-2.5 rounded-xl border-2 border-[#25D366]/50 text-[#25D366] bg-[#25D366]/5 font-semibold text-sm font-body hover:bg-[#25D366]/15 transition-colors">
                    📱 {waPhone ? 'Avisar por WhatsApp' : 'Enviar WhatsApp (elige contacto)'}
                  </a>
                )
              })()}
              <button
                onClick={() => { onClose(); onReassign(order) }}
                className="btn-primary w-full"
              >
                <Bike size={16} /> Cambiar domiciliario
              </button>
            </div>
          )}

          {/* Marcar en preparación — cajero puede activarlo cuando accepted */}
          {order.status === 'accepted' && (
            <div className="bg-mustard/10 border border-mustard/30 rounded-2xl p-4 flex flex-col gap-3">
              <p className="font-display text-lg text-coal tracking-wide">🍳 En preparación</p>
              <p className="font-body text-sm text-coal/70">
                Avisa al cliente que el pedido está siendo preparado.
              </p>
              <button onClick={markPreparing} disabled={loading} className="btn-mustard w-full">
                {loading ? 'Procesando…' : 'Marcar en preparación'}
              </button>
            </div>
          )}

          {/* Cash cuadre action */}
          {order.status === 'pending_cuadre' && (
            <div className="bg-mustard/10 border border-mustard/30 rounded-2xl p-4 flex flex-col gap-3">
              <p className="font-display text-lg text-coal tracking-wide">💰 Cuadre de caja</p>
              <p className="font-body text-sm text-coal/70">
                El domiciliario ya entregó el pedido. Marca como recibido cuando te entregue el dinero.
              </p>
              {order.totalPrice > 0 && (
                <div className="flex justify-between font-body text-sm">
                  <span className="text-coal/60">Total que debe entregar:</span>
                  <span className="font-bold text-mustard">{fmt(order.totalPrice)}</span>
                </div>
              )}
              <button onClick={markCashReceived} disabled={loading} className="btn-mustard w-full">
                <DollarSign size={16} />
                {loading ? 'Procesando…' : 'Dinero recibido ✓'}
              </button>
            </div>
          )}

          {/* Rejection info */}
          {order.status === 'rejected' && order.rejectionReason && (
            <div className="bg-pepper/10 border border-pepper/30 rounded-2xl p-4">
              <p className="font-display text-base text-pepper tracking-wide mb-1">❌ Pedido rechazado</p>
              <p className="font-body text-sm text-coal/80">Motivo: {order.rejectionReason}</p>
            </div>
          )}

          {/* Comments */}
          <div className="card border border-coal/10 flex flex-col gap-3">
            <div className="flex items-center gap-2">
              <MessageSquare size={15} className="text-tangelo" />
              <p className="font-display text-sm tracking-wide text-coal">Comentarios del pedido</p>
            </div>

            {(order.comments?.length > 0) ? (
              <div className="flex flex-col gap-2">
                {[...order.comments].sort((a,b) => a.ts - b.ts).map((c, i) => (
                  <div key={i} className={`rounded-xl px-3 py-2 ${c.role === 'cashier' ? 'bg-tangelo/10 border border-tangelo/20' : 'bg-mint/10 border border-mint/20'}`}>
                    <p className={`font-body text-[10px] font-bold uppercase tracking-wider mb-0.5 ${c.role === 'cashier' ? 'text-tangelo' : 'text-mint'}`}>
                      {c.role === 'cashier' ? '🧾 Cajero' : '🛵 Domiciliario'} · {c.name}
                    </p>
                    <p className="font-body text-sm text-coal">{c.text}</p>
                  </div>
                ))}
              </div>
            ) : (
              <p className="font-body text-xs text-coal/40">Sin comentarios aún</p>
            )}

            <div className="flex gap-2">
              <textarea
                className="textarea-field flex-1 h-14 scroll-custom text-sm"
                placeholder="Comentario para el domiciliario (ej: tocar timbre 3B, llamar al llegar…)"
                value={commentText}
                onChange={e => setCommentText(e.target.value)}
              />
              <button onClick={sendComment} disabled={sendingComment || !commentText.trim()}
                className="btn-primary px-3 self-end">
                <Send size={16} />
              </button>
            </div>
          </div>

          {/* Chat con el cliente */}
          <div className="card border border-cherry/15 flex flex-col gap-3">
            <div className="flex items-center gap-2">
              <MessageSquare size={15} className="text-cherry" />
              <p className="font-display text-sm tracking-wide text-coal">Chat con el cliente</p>
            </div>

            {(order.clientMessages?.length > 0) ? (
              <div className="flex flex-col gap-2">
                {[...order.clientMessages].sort((a,b) => a.ts - b.ts).map((m, i) => (
                  <div key={i} className={`rounded-xl px-3 py-2 ${m.role === 'cashier' ? 'bg-tangelo/10 border border-tangelo/20 ml-4' : 'bg-cherry/5 border border-cherry/20 mr-4'}`}>
                    <p className={`font-body text-[10px] font-bold uppercase tracking-wider mb-0.5 ${m.role === 'cashier' ? 'text-tangelo' : 'text-cherry'}`}>
                      {m.role === 'cashier' ? '🧾 Cajero' : '🛍️ Cliente'} · {m.name}
                    </p>
                    <p className="font-body text-sm text-coal">{m.text}</p>
                  </div>
                ))}
              </div>
            ) : (
              <p className="font-body text-xs text-coal/40">Sin mensajes aún — el cliente también puede escribir desde su panel</p>
            )}

            {!['rejected','cancelled','completed'].includes(order.status) && (
              <div className="flex gap-2">
                <textarea
                  className="textarea-field flex-1 h-14 scroll-custom text-sm"
                  placeholder="Mensaje para el cliente (ej: tu pedido está casi listo…)"
                  value={clientMsgText}
                  onChange={e => setClientMsgText(e.target.value)}
                />
                <button onClick={sendClientMessage} disabled={sendingClientMsg || !clientMsgText.trim()}
                  className="btn-primary px-3 self-end">
                  <Send size={16} />
                </button>
              </div>
            )}
          </div>

          {/* Timestamps */}
          {timestamps.length > 0 && (
            <div className="card">
              <div className="flex items-center gap-2 mb-3">
                <Clock size={16} className="text-coal/40" />
                <p className="font-display text-sm tracking-wide text-coal/60">Registro de tiempos</p>
              </div>
              <div className="flex flex-col gap-2">
                {timestamps.map(t => (
                  <div key={t.label} className="flex items-center justify-between">
                    <span className="font-body text-xs text-coal/50">{t.label}</span>
                    <span className="font-body text-xs font-semibold text-coal">{fmtTime(t.ts)}</span>
                  </div>
                ))}
              </div>
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
