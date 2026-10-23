import { useState } from 'react'
import { serverTimestamp } from 'firebase/firestore'
import { actualizarPedido } from '../../services/firebase'
import { conApi, ErrorApi } from '../../services/pedidosApi'
import { cashAmount } from '../../utils/payments'
import {
  X, User, MapPin, CreditCard, Bike,
  Hash, AlertCircle
} from 'lucide-react'
import StatusBadge from '../common/StatusBadge'
import ClientChat from './ClientChat'
import { SEDES } from '../../services/roles'
import { pedidosMismoLado } from '../../utils/cercania'
import useTurnosDomiciliarios, { TEXTO_TURNO } from '../../hooks/useTurnosDomiciliarios'

const fmt = v => (v !== undefined && v !== null && v !== '') ? `$${Number(v).toLocaleString('es-CO')}` : '—'
// Solo dígitos: el cajero escribe el precio directo (sin flechitas de subir/bajar).
const onlyDigits = v => (v || '').toString().replace(/[^\d]/g, '')

export default function AssignDeliveryDetail({ order, drivers, onClose, unreadClientMsgs = 0, pedidos = [] }) {
  const turnos = useTurnosDomiciliarios(order.sedeId)
  const [quotedPrice,   setQuotedPrice]   = useState(String(order.quotedPrice   ?? ''))
  const [deliveryPrice, setDeliveryPrice] = useState(String(order.deliveryPrice ?? ''))
  const [orderNumber,   setOrderNumber]   = useState(order.orderNumber || '')
  const [driverId,      setDriverId]      = useState(order.driverEmail || '')
  const [driverNotes,   setDriverNotes]   = useState(order.driverNotes || '')
  // Pre-llenar desde lo que el cliente ya indicó en su calculadora de cambio
  // (cashBillAmount/cashChange) si el cajero aún no registró un payAmount, para
  // no perder el dato y que el domiciliario sepa que debe llevar cambio.
  const [payExact,      setPayExact]      = useState(order.payExact ?? !(order.cashChange > 0))
  const [payAmount,     setPayAmount]     = useState(String(order.payAmount || order.cashBillAmount || ''))
  const [loading,       setLoading]       = useState(false)
  const [errors,        setErrors]        = useState([])

  const mismoLado = pedidosMismoLado(order, pedidos, SEDES[order.sedeId]?.coords)

  const cashOnDelivery = order.payment === 'Efectivo' || order.payment === 'Mixto'
  const qp    = parseFloat(quotedPrice)   || 0
  const dp    = parseFloat(deliveryPrice) || 0
  // Si el cliente usó saldo a favor, ya está descontado: no volver a cobrarlo.
  const total = Math.max(0, qp + dp - (Number(order.saldoAplicado?.usado) || 0))
  const pa    = parseFloat(payAmount)     || 0
  // En Mixto el cambio es sobre la parte en efectivo, no sobre el total: con
  // $20.000 en efectivo pagados con $50.000 se llevan $30.000, no $9.000.
  const aCobrarEfectivo = cashAmount({ ...order, totalPrice: total })
  const change = !payExact && pa > aCobrarEfectivo ? pa - aCobrarEfectivo : 0

  const handleSend = async () => {
    const errs = []
    if (!orderNumber.trim()) errs.push('El número de orden es obligatorio')
    if (!driverId)           errs.push('Debes seleccionar un domiciliario')
    if (errs.length) { setErrors(errs); return }

    const driver = drivers.find(d => d.id === driverId)
    // Pasárselo a otro domiciliario antes de que salga: con motivo (se les avisa a los dos).
    const anterior = (order.driverEmail || '').toLowerCase()
    let motivo = ''
    if (anterior && anterior !== String(driver?.id || driverId).toLowerCase().trim()) {
      motivo = (window.prompt(`¿Por qué le quitas el pedido a ${order.driverName || anterior}? (se le avisa)`) || '').trim()
      if (motivo.length < 3) { setErrors(['Para pasarle el pedido a otro domiciliario escribe el motivo']); return }
    }
    setLoading(true)
    try {
      const resolvedEmail = (driver?.id || driverId).toLowerCase().trim()
      const datos = {
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
        ...(motivo ? { motivo } : {}),
      }
      // Por la API (valida que el domiciliario exista); si no responde, directo.
      await conApi(`${order.id}/asignar`, { ...datos, version: order.version ?? 0 },
        () => actualizarPedido(order, { status: 'assigned', ...datos, assignedAt: serverTimestamp() }, { rol: 'caja' }))
      onClose()
    } catch (err) {
      if (err instanceof ErrorApi) setErrors([err.message])
      else throw err
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
            {/* Sin forma de pago esto quedaba en blanco y el pedido se
                despachaba igual: el domiciliario llegaba sin saber cómo cobra. */}
            <div className="flex items-center gap-2">
              <CreditCard size={14} className={order.payment ? 'text-cherry' : 'text-mustard'} />
              {order.payment ? (
                <p className="font-body text-xs font-semibold text-coal">{order.payment}</p>
              ) : (
                <p className="font-body text-xs font-semibold text-mustard">
                  ⚠️ Sin forma de pago — regístrala en el detalle del pedido antes de despachar
                </p>
              )}
            </div>
          </div>

          {/* Chat con el cliente — disponible también al asignar: el pedido ya
              cotizado se abre en esta pantalla, y aquí es donde la caja veía el
              aviso de "mensaje nuevo" sin poder leerlo ni responder. */}
          <ClientChat order={order} unreadCount={unreadClientMsgs} compact />

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
                <input className="input-field" value={quotedPrice} inputMode="numeric"
                  onChange={e => setQuotedPrice(onlyDigits(e.target.value))} placeholder="$0" />
              </div>
              <div>
                <label className="label-field">Domicilio</label>
                <input className="input-field" value={deliveryPrice} inputMode="numeric"
                  onChange={e => setDeliveryPrice(onlyDigits(e.target.value))} placeholder="$0" />
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
                    <input className="input-field" value={payAmount} inputMode="numeric"
                      onChange={e => setPayAmount(onlyDigits(e.target.value))} placeholder="$0" />
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

          {/* Pedidos que van para el mismo lado: salen juntos y no en dos viajes. */}
          {mismoLado.length > 0 && (
            <div className="bg-mint/10 border border-mint/40 rounded-xl px-4 py-3">
              <p className="font-body text-xs font-bold text-coal mb-1.5">
                🧭 Van para el mismo lado — mándalos con el mismo domiciliario
              </p>
              <div className="flex flex-col gap-1.5">
                {mismoLado.map(({ order: o, metros, deCamino }) => {
                  const asignadoA = o.driverEmail && drivers.find(d => String(d.id).toLowerCase() === o.driverEmail.toLowerCase())
                  return (
                    <div key={o.id} className="flex items-center justify-between gap-2">
                      <p className="font-body text-xs text-coal/75 min-w-0">
                        <strong>{o.orderNumber ? `#${o.orderNumber}` : (o.name || 'Pedido')}</strong>
                        {o.barrio ? ` · ${o.barrio}` : ''}
                        {' · '}{deCamino ? 'de camino' : `a ${metros} m`}
                        {o.driverEmail ? ` · ya lo tiene ${o.driverName || o.driverEmail}` : ' · sin asignar'}
                      </p>
                      {asignadoA && driverId !== asignadoA.id && (
                        <button type="button" onClick={() => setDriverId(asignadoA.id)}
                          className="flex-shrink-0 font-body text-[11px] font-semibold text-tangelo underline underline-offset-2">
                          Asignar a {(asignadoA.name || asignadoA.id).split(' ')[0]}
                        </button>
                      )}
                    </div>
                  )
                })}
              </div>
            </div>
          )}

          {/* Driver assignment */}
          <div>
            <label className="label-field">🚴 Domiciliario *</label>
            <select className="input-field" value={driverId} onChange={e => setDriverId(e.target.value)}>
              <option value="">— Selecciona domiciliario —</option>
              {drivers.map(d => (
                <option key={d.id} value={d.id}>
                  {d.name || d.id} · {TEXTO_TURNO[turnos[String(d.id).toLowerCase()]?.estado] || 'Fuera de turno'}
                </option>
              ))}
            </select>
            {driverId && turnos[String(driverId).toLowerCase()]?.estado !== 'activo' && (
              <p className="font-body text-xs text-tangelo mt-1.5">
                ⚠️ No está en turno: le llega el aviso igual. Confírmale por WhatsApp que puede tomarlo.
              </p>
            )}
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
