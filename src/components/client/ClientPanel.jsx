import { useState, useEffect } from 'react'
import { collection, query, where, onSnapshot, addDoc, serverTimestamp } from 'firebase/firestore'
import { db } from '../../services/firebase'
import { useAuth } from '../../contexts/AuthContext'
import Logo from '../common/Logo'
import StatusBadge from '../common/StatusBadge'
import { format } from 'date-fns'
import { es } from 'date-fns/locale'
import {
  MapPin, ShoppingBag, Navigation,
  LogOut, Info, Star, Plus, X, AlertCircle
} from 'lucide-react'
import { SEDES } from '../../services/roles'

const STATUS_STEPS = [
  { key: 'pending',    label: 'Pedido enviado',       emoji: '📋' },
  { key: 'assigned',   label: 'Domiciliario asignado', emoji: '🛵' },
  { key: 'accepted',   label: 'Domiciliario aceptó',  emoji: '✅' },
  { key: 'in_transit', label: 'En camino',             emoji: '🏃' },
  { key: 'arrived',    label: 'Llegó al destino',      emoji: '📍' },
  { key: 'delivered_paid',  label: '¡Entregado!',      emoji: '🎉' },
  { key: 'pending_cuadre',  label: '¡Entregado!',      emoji: '🎉' },
  { key: 'completed',       label: '¡Entregado!',      emoji: '🎉' },
]

const DELIVERED_STATUSES = ['delivered_paid', 'pending_cuadre', 'completed']

export default function ClientPanel() {
  const { user, role, effectiveRole, setViewingAs, sede, selectSede, logout } = useAuth()
  const [orders,   setOrders]   = useState([])
  const [selected, setSelected] = useState(null)
  const [showForm, setShowForm] = useState(false)

  const today = format(new Date(), "EEEE dd 'de' MMMM yyyy", { locale: es })

  // Only show THIS client's orders
  useEffect(() => {
    if (!user?.uid) return
    const q = query(
      collection(db, 'orders'),
      where('clientUid', '==', user.uid)
    )
    return onSnapshot(q, snap => {
      const docs = snap.docs.map(d => ({ id: d.id, ...d.data() }))
      docs.sort((a, b) => (b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0))
      setOrders(docs)
    })
  }, [user])

  const activeOrders    = orders.filter(o => !DELIVERED_STATUSES.includes(o.status))
  const deliveredOrders = orders.filter(o => DELIVERED_STATUSES.includes(o.status))

  const handleCreateOrder = async (data) => {
    await addDoc(collection(db, 'orders'), {
      ...data,
      clientUid:   user.uid,
      clientEmail: user.email   || null,
      clientName:  data.name    || user.displayName || 'Invitado',
      sedeId:      sede?.id     || '',
      sedeName:    sede?.name   || '',
      status:      'pending',
      createdAt:   serverTimestamp(),
      updatedAt:   serverTimestamp(),
    })
    setShowForm(false)
  }

  return (
    <div className="min-h-screen-safe flex flex-col bg-gradient-soft">
      {/* Hero header */}
      <div className="bg-gradient-to-br from-cherry to-tangelo px-5 pt-10 pb-16 relative overflow-hidden">
        <div className="absolute inset-0 opacity-10">
          {[...Array(4)].map((_,i) => (
            <Star key={i} className="absolute text-cream" style={{ width: 60+i*20, height: 60+i*20, top: `${i*25}%`, right: `${i*20}%`, transform: `rotate(${i*45}deg)` }} />
          ))}
        </div>
        <div className="relative z-10 flex items-center justify-between mb-4">
          <Logo variant="dark" size="sm" />
          <div className="flex items-center gap-1">
            {role !== effectiveRole && (
              <button onClick={() => setViewingAs(null)} className="text-cream/70 hover:text-cream text-xs font-body underline mr-2">
                Volver a mi panel
              </button>
            )}
            <button onClick={() => selectSede(null)} className="btn-icon text-cream hover:bg-cream/10">
              <MapPin size={20} />
            </button>
            <button onClick={logout} className="btn-icon text-cream hover:bg-cream/10">
              <LogOut size={20} />
            </button>
          </div>
        </div>
        <div className="relative z-10">
          <p className="font-script text-cream/80 text-lg">Bienvenido/a</p>
          <h1 className="font-display text-4xl text-cream tracking-widest leading-tight">
            {user?.displayName?.split(' ')[0] || 'Cliente'}
          </h1>
          <p className="font-body text-cream/60 text-sm mt-1 capitalize">{today}</p>
        </div>
      </div>

      {/* Sede info */}
      <div className="mx-4 -mt-8 relative z-10">
        <div className="card bg-white shadow-soft">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-cherry/10 rounded-full flex items-center justify-center flex-shrink-0">
              <MapPin size={18} className="text-cherry" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="font-display text-base text-coal tracking-wide">Sede {sede?.name}</p>
              <p className="font-body text-xs text-coal/50">{sede?.address}</p>
            </div>
            <button
              onClick={() => selectSede(null)}
              className="flex-shrink-0 text-xs font-semibold font-body text-cherry underline underline-offset-2"
            >
              Cambiar
            </button>
          </div>
        </div>
      </div>

      {/* Info banner */}
      <div className="mx-4 mt-3">
        <div className="bg-mustard/10 border border-mustard/20 rounded-2xl px-4 py-3 flex items-start gap-2">
          <Info size={16} className="text-mustard flex-shrink-0 mt-0.5" />
          <p className="font-body text-xs text-coal/70">
            Haz tu pedido aquí y un cajero te lo confirmará pronto. También puedes escribirnos por WhatsApp.
          </p>
        </div>
      </div>

      {/* Active orders */}
      <div className="px-4 mt-4">
        <p className="section-title mb-3">Mis pedidos activos</p>
        {activeOrders.length === 0 ? (
          <div className="flex flex-col items-center gap-3 py-8">
            <p className="text-4xl">🍔</p>
            <p className="font-body text-coal/40 text-center text-sm">
              No tienes pedidos activos. ¡Haz uno!
            </p>
          </div>
        ) : (
          <div className="flex flex-col gap-3">
            {activeOrders.map(o => (
              <ClientOrderCard key={o.id} order={o} onClick={() => setSelected(o)} />
            ))}
          </div>
        )}
      </div>

      {/* Delivered orders */}
      {deliveredOrders.length > 0 && (
        <div className="px-4 mt-4 mb-8">
          <p className="section-title mb-3">Entregados</p>
          <div className="flex flex-col gap-2">
            {deliveredOrders.slice(0, 5).map(o => (
              <div key={o.id} className="card flex items-center justify-between gap-3 opacity-60">
                <div>
                  {o.orderNumber && <span className="font-display text-base text-cherry mr-2">#{o.orderNumber}</span>}
                  <span className="font-body text-sm">{o.items?.slice(0, 40)}…</span>
                </div>
                <span className="text-lg">✅</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Sedes info */}
      <div className="px-4 mt-2 mb-24">
        <p className="section-title mb-3">Nuestras sedes</p>
        <div className="flex flex-col gap-3">
          {Object.values(SEDES).map(s => (
            <div key={s.id} className="card flex items-center gap-3">
              <div className="w-10 h-10 bg-smoked rounded-full flex items-center justify-center flex-shrink-0">
                <MapPin size={16} className="text-coal/50" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="font-display text-base tracking-wide text-coal">{s.name}</p>
                <p className="font-body text-xs text-coal/50">{s.address}</p>
              </div>
              <a href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(s.address)}`}
                target="_blank" rel="noreferrer" className="btn-ghost btn-sm">
                Ver
              </a>
            </div>
          ))}
        </div>
      </div>

      {/* FAB */}
      <div className="fixed bottom-6 right-4 z-30">
        <button onClick={() => setShowForm(true)} className="btn-primary shadow-glow gap-2 pr-5">
          <Plus size={20} />
          Hacer pedido
        </button>
      </div>

      {/* Order form modal */}
      {showForm && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-coal/50 backdrop-blur-sm">
          <div className="bg-cream w-full max-w-lg rounded-t-3xl sm:rounded-3xl max-h-[92dvh] overflow-y-auto scroll-custom animate-slide-in-right">
            <div className="sticky top-0 bg-cream/95 backdrop-blur-sm px-5 py-4 border-b border-coal/10 flex items-center justify-between">
              <p className="font-display text-xl text-coal tracking-wide">Nuevo pedido</p>
              <button onClick={() => setShowForm(false)} className="btn-icon"><X size={20} /></button>
            </div>
            <div className="p-5">
              <ClientOrderForm
                user={user}
                sede={sede}
                onSubmit={handleCreateOrder}
                onCancel={() => setShowForm(false)}
              />
            </div>
          </div>
        </div>
      )}

      {/* Order detail modal */}
      {selected && <ClientOrderDetail order={selected} onClose={() => setSelected(null)} />}
    </div>
  )
}

// ─── Order form ───────────────────────────────────────────────────────────────
function ClientOrderForm({ user, sede, onSubmit, onCancel }) {
  const [form, setForm] = useState({
    name:        user?.displayName || '',
    phone:       '',
    fullAddress: '',
    barrio:      '',
    reference:   '',
    items:       '',
    payment:     'Efectivo',
    notes:       '',
    orderNumber: '',
  })
  const [loading, setLoading] = useState(false)
  const [errors,  setErrors]  = useState([])

  const set = (k, v) => setForm(f => ({ ...f, [k]: v }))

  const handleSubmit = async () => {
    const errs = []
    if (!form.name.trim())        errs.push('El nombre es obligatorio')
    if (!form.phone.trim())       errs.push('El teléfono / WhatsApp es obligatorio')
    if (!form.fullAddress.trim()) errs.push('La dirección es obligatoria')
    if (!form.items.trim())       errs.push('El pedido no puede estar vacío')
    if (errs.length) { setErrors(errs); return }
    setLoading(true)
    try {
      await onSubmit(form)
    } finally { setLoading(false) }
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="bg-cherry/5 border border-cherry/20 rounded-xl px-4 py-3">
        <p className="font-body text-xs text-coal/60">
          Sede: <span className="font-semibold text-cherry">{sede?.name}</span> · Un cajero te confirmará el pedido pronto.
        </p>
      </div>

      {errors.length > 0 && (
        <div className="bg-pepper/10 border border-pepper/30 rounded-xl p-3 flex flex-col gap-1">
          {errors.map(e => (
            <p key={e} className="flex items-center gap-2 text-sm text-pepper font-body">
              <AlertCircle size={14} /> {e}
            </p>
          ))}
        </div>
      )}

      <div className="grid grid-cols-2 gap-3">
        <div className="col-span-2">
          <label className="label-field">Nombre completo *</label>
          <input className="input-field" value={form.name} onChange={e => set('name', e.target.value)} placeholder="Tu nombre" />
        </div>
        <div className="col-span-2">
          <label className="label-field">Teléfono / WhatsApp *</label>
          <input className="input-field" value={form.phone} onChange={e => set('phone', e.target.value)} placeholder="3001234567" type="tel" />
        </div>
      </div>

      <div>
        <label className="label-field">Dirección de entrega *</label>
        <input className="input-field" value={form.fullAddress} onChange={e => set('fullAddress', e.target.value)} placeholder="Calle, número, apartamento…" />
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="label-field">Barrio</label>
          <input className="input-field" value={form.barrio} onChange={e => set('barrio', e.target.value)} placeholder="Barrio" />
        </div>
        <div>
          <label className="label-field">Referencia</label>
          <input className="input-field" value={form.reference} onChange={e => set('reference', e.target.value)} placeholder="Punto de referencia" />
        </div>
      </div>

      <div>
        <label className="label-field">¿Qué vas a pedir? *</label>
        <textarea className="textarea-field h-28 scroll-custom" value={form.items}
          onChange={e => set('items', e.target.value)}
          placeholder="Ej: 1 hamburguesa clásica, 1 papas medianas, 1 gaseosa…" />
      </div>

      <div>
        <label className="label-field">Indicaciones adicionales</label>
        <textarea className="textarea-field h-16 scroll-custom" value={form.notes}
          onChange={e => set('notes', e.target.value)}
          placeholder="Sin cebolla, extra salsa, timbre 2B…" />
      </div>

      <div>
        <label className="label-field">Forma de pago</label>
        <select className="input-field" value={form.payment} onChange={e => set('payment', e.target.value)}>
          <option>Efectivo</option>
          <option>Transferencia</option>
          <option>Nequi</option>
          <option>Daviplata</option>
        </select>
      </div>

      <div className="flex gap-3 pt-2">
        <button onClick={onCancel} className="btn-secondary flex-1">Cancelar</button>
        <button onClick={handleSubmit} disabled={loading} className="btn-primary flex-1">
          {loading ? 'Enviando…' : '🚀 Enviar pedido'}
        </button>
      </div>
    </div>
  )
}

// ─── Order card ───────────────────────────────────────────────────────────────
function ClientOrderCard({ order, onClick }) {
  const stepIdx  = STATUS_STEPS.findIndex(s => s.key === order.status)
  const step     = STATUS_STEPS[Math.max(0, stepIdx)]
  const progress = Math.round(((stepIdx + 1) / STATUS_STEPS.length) * 100)

  return (
    <button onClick={onClick} className="order-card w-full text-left border-l-4 border-cherry">
      <div className="flex items-start justify-between gap-2 mb-3">
        <div>
          {order.orderNumber && <p className="font-display text-xl text-cherry">#{order.orderNumber}</p>}
          <p className="font-body text-sm text-coal/60 line-clamp-1">{order.items}</p>
        </div>
        <span className="text-2xl">{step.emoji}</span>
      </div>
      <div className="mb-2">
        <p className="font-body text-sm font-semibold text-cherry mb-1">{step.label}</p>
        <div className="w-full bg-smoked rounded-full h-2">
          <div className="bg-gradient-to-r from-cherry to-tangelo h-2 rounded-full transition-all duration-500"
            style={{ width: `${progress}%` }} />
        </div>
      </div>
      <StatusBadge status={order.status} />
    </button>
  )
}

// ─── Order detail ─────────────────────────────────────────────────────────────
function ClientOrderDetail({ order, onClose }) {
  const stepIdx  = STATUS_STEPS.findIndex(s => s.key === order.status)
  const step     = STATUS_STEPS[Math.max(0, stepIdx)]
  const progress = Math.round(((stepIdx + 1) / STATUS_STEPS.length) * 100)

  const openDriverMap = () => {
    if (order.driverLat && order.driverLng) {
      window.open(`https://www.google.com/maps/search/?api=1&query=${order.driverLat},${order.driverLng}`, '_blank')
    }
  }

  const isDelivered = DELIVERED_STATUSES.includes(order.status)

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-coal/50 backdrop-blur-sm animate-fade-in"
      onClick={e => { if (e.target === e.currentTarget) onClose() }}>
      <div className="bg-cream w-full max-w-lg rounded-t-3xl sm:rounded-3xl max-h-[90dvh] overflow-y-auto scroll-custom">
        {/* Header */}
        <div className="sticky top-0 bg-gradient-to-r from-cherry to-tangelo px-5 py-5 rounded-t-3xl">
          <div className="flex items-center justify-between mb-3">
            <p className="font-display text-2xl text-cream tracking-wide">
              {order.orderNumber ? `Pedido #${order.orderNumber}` : 'Mi pedido'}
            </p>
            <button onClick={onClose} className="text-cream/70 hover:text-cream">✕</button>
          </div>
          <p className="font-body text-sm font-semibold text-cream mb-2">{step.emoji} {step.label}</p>
          <div className="w-full bg-cream/20 rounded-full h-2">
            <div className="bg-cream h-2 rounded-full transition-all duration-500" style={{ width: `${progress}%` }} />
          </div>
        </div>

        <div className="p-5 flex flex-col gap-4">
          {/* Timeline */}
          <div className="flex flex-col gap-2">
            {STATUS_STEPS.filter((s, i, arr) => {
              const keys = ['delivered_paid','pending_cuadre','completed']
              if (keys.includes(s.key)) return i === arr.findIndex(x => keys.includes(x.key))
              return true
            }).map((s, i) => {
              const done = STATUS_STEPS.findIndex(x => x.key === order.status) >= STATUS_STEPS.findIndex(x => x.key === s.key)
              return (
                <div key={s.key} className="flex items-center gap-3">
                  <div className={`w-6 h-6 rounded-full flex items-center justify-center flex-shrink-0 text-xs ${
                    done ? 'bg-cherry text-cream' : 'bg-smoked text-coal/30'
                  }`}>{done ? '✓' : (i+1)}</div>
                  <span className={`font-body text-sm ${done ? 'text-coal font-semibold' : 'text-coal/40'}`}>{s.label}</span>
                </div>
              )
            })}
          </div>

          {/* Driver location — only while active */}
          {['in_transit','arrived'].includes(order.status) && (
            <div className="bg-cherry/5 border border-cherry/20 rounded-2xl p-4">
              <p className="font-display text-base tracking-wide mb-2">🛵 Domiciliario en camino</p>
              {order.driverLat ? (
                <button onClick={openDriverMap} className="btn-primary btn-sm w-full">
                  <Navigation size={14} /> Ver ubicación del domiciliario
                </button>
              ) : (
                <p className="font-body text-xs text-coal/50">Obteniendo ubicación…</p>
              )}
            </div>
          )}

          {/* Order items */}
          <div className="card">
            <div className="flex items-center gap-2 mb-2">
              <ShoppingBag size={16} className="text-cherry" />
              <p className="font-display text-base tracking-wide">Tu pedido</p>
            </div>
            <p className="font-body text-sm text-coal whitespace-pre-wrap">{order.items}</p>
            {order.notes && (
              <div className="mt-2 bg-mustard/10 rounded-lg p-2">
                <p className="font-body text-xs text-coal/70">{order.notes}</p>
              </div>
            )}
          </div>

          <div className="card">
            <div className="flex items-center gap-2 mb-1">
              <MapPin size={16} className="text-cherry" />
              <p className="font-display text-base tracking-wide">Entrega en</p>
            </div>
            <p className="font-body text-sm text-coal">{order.fullAddress}</p>
            {order.barrio && <p className="font-body text-xs text-coal/50 mt-0.5">Barrio: {order.barrio}</p>}
          </div>

          {isDelivered && (
            <div className="bg-mint/10 border border-mint/30 rounded-2xl p-4 text-center">
              <p className="text-3xl mb-2">🎉</p>
              <p className="font-display text-lg tracking-wide text-mint">¡Pedido entregado!</p>
              <p className="font-body text-xs text-coal/50 mt-1">Gracias por tu pedido en DeliStars</p>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
