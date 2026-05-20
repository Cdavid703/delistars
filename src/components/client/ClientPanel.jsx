import { useState, useEffect } from 'react'
import {
  collection, query, where, onSnapshot, addDoc, serverTimestamp,
  doc, getDoc, setDoc, updateDoc, arrayUnion, increment
} from 'firebase/firestore'
import { db } from '../../services/firebase'
import { useAuth } from '../../contexts/AuthContext'
import Logo from '../common/Logo'
import StatusBadge from '../common/StatusBadge'
import { format } from 'date-fns'
import { es } from 'date-fns/locale'
import {
  MapPin, ShoppingBag, Navigation,
  LogOut, Info, Star, Plus, X, AlertCircle, Clock, DollarSign, MessageSquare,
  HelpCircle, ChevronDown, ChevronUp, BookOpen
} from 'lucide-react'
import { SEDES } from '../../services/roles'

const STATUS_STEPS = [
  { key: 'pending',    label: 'Pedido enviado',        emoji: '📋' },
  { key: 'quoted',     label: 'Cotización recibida',   emoji: '💰' },
  { key: 'assigned',   label: 'Domiciliario asignado', emoji: '🛵' },
  { key: 'accepted',   label: 'Domiciliario aceptó',   emoji: '✅' },
  { key: 'in_transit', label: 'En camino',              emoji: '🏃' },
  { key: 'arrived',    label: 'Llegó al destino',       emoji: '📍' },
  { key: 'delivered_paid',  label: '¡Entregado!',       emoji: '🎉' },
  { key: 'pending_cuadre',  label: '¡Entregado!',       emoji: '🎉' },
  { key: 'completed',       label: '¡Entregado!',       emoji: '🎉' },
  { key: 'rejected',        label: 'Pedido rechazado',  emoji: '❌' },
]

const DELIVERED_STATUSES = ['delivered_paid', 'pending_cuadre', 'completed']
const CLOSED_STATUSES    = ['rejected', 'cancelled']

const isToday = ts => {
  if (!ts?.toDate) return false
  const d = ts.toDate(), n = new Date()
  return d.toDateString() === n.toDateString()
}

const fmt = v => v ? `$${Number(v).toLocaleString('es-CO')}` : null

export default function ClientPanel() {
  const { user, role, effectiveRole, setViewingAs, sede, selectSede, logout } = useAuth()
  const [orders,         setOrders]         = useState([])
  const [selected,       setSelected]       = useState(null)
  const [showForm,       setShowForm]       = useState(false)
  const [platformActive, setPlatformActive] = useState(null)
  const [showHelp,       setShowHelp]       = useState(false)
  const [showHistory,    setShowHistory]    = useState(false)

  const today = format(new Date(), "EEEE dd 'de' MMMM yyyy", { locale: es })

  useEffect(() => {
    return onSnapshot(doc(db, 'config', 'client_platform'), snap => {
      setPlatformActive(snap.exists() ? snap.data().active : false)
    })
  }, [])

  useEffect(() => {
    if (!user?.uid) return
    const q = query(collection(db, 'orders'), where('clientUid', '==', user.uid))
    return onSnapshot(q, snap => {
      const docs = snap.docs.map(d => ({ id: d.id, ...d.data() }))
      docs.sort((a, b) => (b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0))
      setOrders(docs)
    }, err => {
      console.error('[ClientPanel] Error al leer pedidos:', err.code, err.message)
    })
  }, [user])

  // Active orders: show regardless of date (could be from yesterday and still in transit)
  const activeOrders    = orders.filter(o => !DELIVERED_STATUSES.includes(o.status) && !CLOSED_STATUSES.includes(o.status))
  // Delivered: only today
  const deliveredOrders = orders.filter(o => DELIVERED_STATUSES.includes(o.status) && isToday(o.createdAt))
  const rejectedOrders  = orders.filter(o => CLOSED_STATUSES.includes(o.status) && isToday(o.createdAt))

  if (platformActive === false && effectiveRole === 'client') {
    return (
      <div className="min-h-screen-safe flex flex-col bg-gradient-to-br from-cherry via-tangelo to-mustard">
        <div className="flex-1 flex flex-col items-center justify-center px-6 py-12 text-center">
          <div className="text-6xl mb-4">🔒</div>
          <h1 className="font-display text-3xl text-cream tracking-widest mb-3">Plataforma cerrada</h1>
          <p className="font-body text-cream/80 text-sm max-w-xs">
            El servicio de domicilios no está disponible en este momento.
          </p>
          <div className="mt-4 bg-cream/10 rounded-2xl px-6 py-4 flex items-center gap-3">
            <Clock size={18} className="text-cream/70 flex-shrink-0" />
            <p className="font-body text-cream/70 text-sm text-left">
              Horario habitual:<br />
              <span className="font-semibold text-cream">6:00 PM – 11:00 PM</span>
            </p>
          </div>
          <button onClick={logout} className="mt-8 flex items-center gap-2 text-cream/60 hover:text-cream text-sm font-body transition-colors">
            <LogOut size={14} /> Cerrar sesión
          </button>
        </div>
      </div>
    )
  }

  if (platformActive === null && effectiveRole === 'client') {
    return (
      <div className="min-h-screen-safe flex items-center justify-center bg-gradient-soft">
        <p className="font-body text-coal/40 text-sm">Cargando…</p>
      </div>
    )
  }

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
    // Guardar/actualizar perfil del cliente frecuente
    if (user.uid) {
      await setDoc(doc(db, 'customers', user.uid), {
        uid:         user.uid,
        name:        data.name        || user.displayName || '',
        email:       user.email       || '',
        phone:       data.phone       || '',
        addresses:   arrayUnion(data.fullAddress),
        lastOrderAt: serverTimestamp(),
        orderCount:  increment(1),
      }, { merge: true })
    }
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
            <button onClick={() => setShowHelp(true)} className="btn-icon text-cream hover:bg-cream/10" title="Ayuda">
              <HelpCircle size={20} />
            </button>
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
          <div className="flex items-center gap-2 mt-1.5">
            <p className="font-body text-cream/60 text-sm capitalize">{today}</p>
            {role !== effectiveRole && (
              <span className="font-body text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full bg-cream/20 text-cream">
                Vista cliente
              </span>
            )}
          </div>
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
            <button onClick={() => selectSede(null)} className="flex-shrink-0 text-xs font-semibold font-body text-cherry underline underline-offset-2">
              Cambiar
            </button>
          </div>
        </div>
      </div>

      {/* Info banner */}
      <div className="mx-4 mt-3">
        <div className="bg-mustard/10 border border-mustard/20 rounded-2xl px-4 py-3 flex items-start gap-2">
          <Info size={16} className="text-mustard flex-shrink-0 mt-0.5" />
          <div className="flex-1">
            <p className="font-body text-xs text-coal/70">
              Haz tu pedido aquí y un cajero te lo confirmará pronto.
            </p>
            {sede?.whatsapp && (
              <a
                href={`https://wa.me/${sede.whatsapp}?text=${encodeURIComponent(`Hola DeliStars ${sede.name}! 👋 Quiero hacer un pedido.`)}`}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1.5 mt-2 bg-[#25D366] text-white rounded-xl px-3 py-1.5 text-xs font-semibold font-body"
              >
                <MessageSquare size={13} /> Escribir por WhatsApp
              </a>
            )}
          </div>
        </div>
      </div>

      {/* Active orders */}
      <div className="px-4 mt-4">
        <div className="flex items-center justify-between mb-3">
          <p className="section-title">Mis pedidos activos</p>
          <button onClick={() => setShowHistory(true)}
            className="text-xs font-body font-semibold text-cherry underline underline-offset-2">
            Ver historial
          </button>
        </div>
        {activeOrders.length === 0 ? (
          <div className="flex flex-col items-center gap-3 py-8">
            <p className="text-4xl">🍔</p>
            <p className="font-body text-coal/40 text-center text-sm">No tienes pedidos activos. ¡Haz uno!</p>
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
        <div className="px-4 mt-4">
          <p className="section-title mb-3">Entregados hoy</p>
          <div className="flex flex-col gap-2">
            {deliveredOrders.slice(0, 5).map(o => (
              <button key={o.id} onClick={() => setSelected(o)} className="card flex items-center justify-between gap-3 opacity-70 w-full text-left">
                <div>
                  {o.orderNumber && <span className="font-display text-base text-cherry mr-2">#{o.orderNumber}</span>}
                  <span className="font-body text-sm">{o.items?.slice(0, 40)}…</span>
                </div>
                <span className="text-lg">✅</span>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Rejected orders */}
      {rejectedOrders.length > 0 && (
        <div className="px-4 mt-4">
          <p className="section-title mb-3">Rechazados</p>
          <div className="flex flex-col gap-2">
            {rejectedOrders.map(o => (
              <button key={o.id} onClick={() => setSelected(o)} className="card w-full text-left border-l-4 border-pepper/50">
                <div className="flex items-start gap-2">
                  <span className="text-xl">❌</span>
                  <div className="flex-1 min-w-0">
                    <p className="font-body text-sm font-semibold text-pepper">Pedido rechazado</p>
                    {o.rejectionReason && <p className="font-body text-xs text-coal/60 mt-0.5 line-clamp-2">{o.rejectionReason}</p>}
                    <p className="font-body text-xs text-coal/40 mt-1 line-clamp-1">{o.items}</p>
                  </div>
                </div>
              </button>
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
              <ClientOrderForm user={user} sede={sede} onSubmit={handleCreateOrder} onCancel={() => setShowForm(false)} />
            </div>
          </div>
        </div>
      )}

      {/* Order detail modal */}
      {selected && <ClientOrderDetail order={selected} onClose={() => setSelected(null)} />}

      {/* History modal */}
      {showHistory && <ClientHistoryModal orders={orders} onClose={() => setShowHistory(false)} onSelect={o => { setShowHistory(false); setSelected(o) }} />}

      {/* Help modal */}
      {showHelp && <ClientHelpModal onClose={() => setShowHelp(false)} />}
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
    payment:     '',
    notes:       '',
  })
  const [savedAddresses, setSavedAddresses] = useState([])
  const [loading, setLoading] = useState(false)
  const [errors,  setErrors]  = useState([])

  useEffect(() => {
    if (!user?.uid) return
    getDoc(doc(db, 'customers', user.uid)).then(snap => {
      if (!snap.exists()) return
      const data = snap.data()
      setForm(f => ({
        ...f,
        name:  data.name  || f.name,
        phone: data.phone || f.phone,
      }))
      setSavedAddresses(data.addresses || [])
    })
  }, [user?.uid])

  const set = (k, v) => setForm(f => ({ ...f, [k]: v }))

  const handleSubmit = async () => {
    const errs = []
    if (!form.name.trim())        errs.push('El nombre es obligatorio')
    if (!form.phone.trim())       errs.push('El teléfono / WhatsApp es obligatorio')
    if (!form.fullAddress.trim()) errs.push('La dirección es obligatoria')
    if (!form.items.trim())       errs.push('El pedido no puede estar vacío')
    if (!form.payment)            errs.push('Debes seleccionar una forma de pago')
    if (errs.length) { setErrors(errs); return }
    setLoading(true)
    try { await onSubmit(form) } finally { setLoading(false) }
  }

  return (
    <div className="flex flex-col gap-4">
      {/* Info banner */}
      <div className="bg-cherry/5 border border-cherry/20 rounded-xl px-4 py-3">
        <p className="font-body text-xs text-coal/60">
          Sede: <span className="font-semibold text-cherry">{sede?.name}</span>
        </p>
      </div>

      {/* Notice about quote */}
      <div className="bg-tangelo/10 border border-tangelo/30 rounded-xl px-4 py-3 flex items-start gap-2">
        <Info size={16} className="text-tangelo flex-shrink-0 mt-0.5" />
        <p className="font-body text-xs text-coal/70 leading-relaxed">
          Después de realizar tu pedido, <strong>espera a que el cajero cotice el precio</strong> y te lo devuelva
          por este mismo medio. No pagues hasta recibir la cotización.
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
        {savedAddresses.length > 0 && (
          <div className="mt-1.5 flex flex-col gap-1">
            <p className="font-body text-[10px] text-coal/40 uppercase tracking-wider">Entregas anteriores</p>
            {[...savedAddresses].reverse().slice(0, 3).map((addr, i) => (
              <button key={i} type="button" onClick={() => set('fullAddress', addr)}
                className="text-left text-xs font-body text-cherry/80 bg-cherry/5 rounded-lg px-3 py-1.5 border border-cherry/10 hover:bg-cherry/10 transition-colors truncate">
                📍 {addr}
              </button>
            ))}
          </div>
        )}
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
        <label className="label-field">Forma de pago *</label>
        <select
          className={`input-field ${!form.payment ? 'text-coal/40' : ''}`}
          value={form.payment}
          onChange={e => set('payment', e.target.value)}
        >
          <option value="" disabled>— Selecciona cómo vas a pagar —</option>
          <option>Efectivo</option>
          <option>Transferencia</option>
          <option>Nequi</option>
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
  const hasQuote = order.totalPrice > 0

  return (
    <button onClick={onClick} className="order-card w-full text-left border-l-4 border-cherry">
      <div className="flex items-start justify-between gap-2 mb-3">
        <div>
          {order.orderNumber && <p className="font-display text-xl text-cherry">#{order.orderNumber}</p>}
          <p className="font-body text-sm text-coal/60 line-clamp-1">{order.items}</p>
        </div>
        <span className="text-2xl">{step.emoji}</span>
      </div>

      {/* Quote highlight */}
      {hasQuote && (
        <div className="mb-2 bg-tangelo/10 border border-tangelo/20 rounded-xl px-3 py-2 flex items-center justify-between">
          <span className="font-body text-xs font-semibold text-tangelo">💰 Total cotizado</span>
          <span className="font-display text-base text-tangelo">{fmt(order.totalPrice)}</span>
        </div>
      )}

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
  const [cancelConfirm, setCancelConfirm] = useState(false)
  const [cancelling,    setCancelling]    = useState(false)
  const [elapsed,       setElapsed]       = useState(null)

  useEffect(() => {
    if (!['accepted', 'in_transit'].includes(order.status)) { setElapsed(null); return }
    const ts = order.inTransitAt || order.acceptedAt
    if (!ts?.toDate) return
    const calc = () => setElapsed(Math.floor((Date.now() - ts.toDate().getTime()) / 60000))
    calc()
    const id = setInterval(calc, 30000)
    return () => clearInterval(id)
  }, [order.status, order.inTransitAt?.seconds, order.acceptedAt?.seconds])

  const stepIdx  = STATUS_STEPS.findIndex(s => s.key === order.status)
  const step     = STATUS_STEPS[Math.max(0, stepIdx)]
  const progress = Math.round(((stepIdx + 1) / STATUS_STEPS.length) * 100)
  const isDelivered = DELIVERED_STATUSES.includes(order.status)
  const hasQuote = order.totalPrice > 0

  const handleCancel = async () => {
    setCancelling(true)
    try {
      await updateDoc(doc(db, 'orders', order.id), {
        status:      'cancelled',
        cancelledAt: serverTimestamp(),
        updatedAt:   serverTimestamp(),
      })
      onClose()
    } finally { setCancelling(false) }
  }

  const openDriverMap = () => {
    if (order.driverLat && order.driverLng) {
      window.open(`https://www.google.com/maps/search/?api=1&query=${order.driverLat},${order.driverLng}`, '_blank')
    }
  }

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
          {/* Quote section */}
          {hasQuote && (
            <div className="bg-tangelo/10 border border-tangelo/30 rounded-2xl p-4 flex flex-col gap-2">
              <p className="font-display text-base tracking-wide text-tangelo">💰 Cotización del cajero</p>
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
              <div className="flex justify-between font-body text-sm">
                <span className="text-coal/60">Forma de pago:</span>
                <span className="font-semibold">{order.payment}</span>
              </div>
            </div>
          )}

          {/* Cashier note to client */}
          {order.cashierNotes && (
            <div className="bg-mustard/10 border border-mustard/20 rounded-2xl p-4 flex items-start gap-3">
              <MessageSquare size={18} className="text-mustard flex-shrink-0 mt-0.5" />
              <div>
                <p className="font-display text-sm tracking-wide text-coal mb-1">Nota del cajero</p>
                <p className="font-body text-sm text-coal/80">{order.cashierNotes}</p>
              </div>
            </div>
          )}

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

          {/* ETA / driver status — features #8 */}
          {['accepted', 'in_transit', 'arrived'].includes(order.status) && (
            <div className="bg-cherry/5 border border-cherry/20 rounded-2xl p-4 flex flex-col gap-2">
              <p className="font-display text-base tracking-wide">
                {order.status === 'accepted'   ? '✅ Domiciliario en camino' :
                 order.status === 'in_transit' ? '🛵 Tu pedido está en camino' :
                                                 '📍 Domiciliario llegó'}
              </p>
              {elapsed !== null && order.status !== 'arrived' && (
                <p className="font-body text-sm text-coal/60">
                  Hace {elapsed < 1 ? 'menos de 1 min' : `${elapsed} min${elapsed !== 1 ? 's' : ''}`}
                </p>
              )}
              {order.status === 'in_transit' && (
                order.driverLat ? (
                  <button onClick={openDriverMap} className="btn-primary btn-sm w-full">
                    <Navigation size={14} /> Ver ubicación del domiciliario
                  </button>
                ) : (
                  <p className="font-body text-xs text-coal/50">Obteniendo ubicación…</p>
                )
              )}
            </div>
          )}

          {/* Cancel button — only when pending (cashier hasn't touched it yet) */}
          {order.status === 'pending' && (
            cancelConfirm ? (
              <div className="bg-pepper/10 border border-pepper/30 rounded-2xl p-4 flex flex-col gap-3">
                <p className="font-body text-sm text-coal font-semibold text-center">¿Cancelar este pedido?</p>
                <p className="font-body text-xs text-coal/60 text-center">Esta acción no se puede deshacer.</p>
                <div className="flex gap-3">
                  <button onClick={() => setCancelConfirm(false)}
                    className="flex-1 px-4 py-2 rounded-xl border border-coal/20 text-coal/60 text-sm font-semibold font-body">
                    No, volver
                  </button>
                  <button onClick={handleCancel} disabled={cancelling}
                    className="flex-1 px-4 py-2 rounded-xl bg-pepper text-white text-sm font-semibold font-body">
                    {cancelling ? 'Cancelando…' : 'Sí, cancelar'}
                  </button>
                </div>
              </div>
            ) : (
              <button onClick={() => setCancelConfirm(true)}
                className="w-full text-sm font-body font-semibold text-pepper/70 hover:text-pepper py-2 transition-colors">
                Cancelar pedido
              </button>
            )
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

          {order.status === 'rejected' && (
            <div className="bg-pepper/10 border border-pepper/30 rounded-2xl p-4 text-center">
              <p className="text-3xl mb-2">❌</p>
              <p className="font-display text-lg tracking-wide text-pepper">Pedido rechazado</p>
              {order.rejectionReason && (
                <p className="font-body text-sm text-coal/70 mt-2">Motivo: {order.rejectionReason}</p>
              )}
              <p className="font-body text-xs text-coal/50 mt-3">
                Puedes hacer un nuevo pedido o escribirnos por WhatsApp.
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

// ─── Client history modal ─────────────────────────────────────────────────────
function ClientHistoryModal({ orders, onClose, onSelect }) {
  const historical = orders
    .filter(o => [...DELIVERED_STATUSES, ...CLOSED_STATUSES].includes(o.status))
    .sort((a, b) => (b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0))

  const fmtDate = ts => {
    if (!ts?.toDate) return ''
    return format(ts.toDate(), "dd 'de' MMM yyyy", { locale: es })
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-coal/50 backdrop-blur-sm animate-fade-in"
      onClick={e => { if (e.target === e.currentTarget) onClose() }}>
      <div className="bg-cream w-full max-w-lg rounded-t-3xl sm:rounded-3xl max-h-[90dvh] flex flex-col shadow-2xl animate-scale-in">
        <div className="sticky top-0 bg-gradient-to-r from-cherry to-tangelo px-5 py-5 rounded-t-3xl flex items-center justify-between flex-shrink-0">
          <div>
            <p className="font-display text-xl text-cream tracking-wide">Historial de pedidos</p>
            <p className="font-body text-xs text-cream/70">{historical.length} pedido{historical.length !== 1 ? 's' : ''} anteriores</p>
          </div>
          <button onClick={onClose} className="text-cream/70 hover:text-cream"><X size={22} /></button>
        </div>

        <div className="overflow-y-auto scroll-custom p-4 flex flex-col gap-2 pb-8">
          {historical.length === 0 ? (
            <div className="flex flex-col items-center gap-3 py-12 text-center">
              <p className="text-4xl">📋</p>
              <p className="font-body text-coal/40">Aún no tienes pedidos anteriores</p>
            </div>
          ) : (
            historical.map(o => {
              const isDelivered = DELIVERED_STATUSES.includes(o.status)
              return (
                <button key={o.id} onClick={() => onSelect(o)}
                  className="card w-full text-left flex items-center gap-3 hover:bg-smoked/50 transition-colors">
                  <span className="text-2xl flex-shrink-0">{isDelivered ? '✅' : '❌'}</span>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      {o.orderNumber && <span className="font-display text-base text-cherry">#{o.orderNumber}</span>}
                      <span className="font-body text-xs text-coal/40">{fmtDate(o.createdAt)}</span>
                    </div>
                    <p className="font-body text-sm text-coal/70 truncate">{o.items}</p>
                    {o.totalPrice > 0 && (
                      <p className="font-body text-xs font-semibold text-tangelo mt-0.5">
                        ${Number(o.totalPrice).toLocaleString('es-CO')}
                      </p>
                    )}
                  </div>
                </button>
              )
            })
          )}
        </div>
      </div>
    </div>
  )
}

// ─── Client help modal ────────────────────────────────────────────────────────
const CLIENT_HELP_SECTIONS = [
  {
    id: 'pedido', emoji: '🍔', title: '¿Cómo hago un pedido?', color: 'text-cherry',
    content: [
      { type: 'steps', items: [
        'Toca el botón rojo "Hacer pedido" en la parte inferior de la pantalla.',
        'Llena tus datos: nombre, teléfono / WhatsApp y dirección de entrega.',
        'Escribe lo que quieres pedir en el campo "¿Qué vas a pedir?".',
        'Selecciona cómo vas a pagar (Efectivo, Transferencia o Nequi).',
        'Toca "Enviar pedido" y espera la cotización del cajero.',
      ]},
    ],
  },
  {
    id: 'cotizacion', emoji: '💰', title: '¿Qué es la cotización?', color: 'text-tangelo',
    content: [
      { type: 'p', text: 'Después de enviar tu pedido, un cajero revisa la disponibilidad y te envía el precio del pedido más el valor del domicilio. Verás el total directamente en tu pedido activo.' },
      { type: 'tip', text: 'No pagues hasta recibir la cotización. El cajero puede enviarte notas adicionales (horario, disponibilidad, etc.).' },
    ],
  },
  {
    id: 'seguimiento', emoji: '📍', title: '¿Cómo sigo mi pedido?', color: 'text-mint',
    content: [
      { type: 'table', rows: [
        ['📋 Pedido enviado',        'Esperando cotización del cajero'],
        ['💰 Cotización recibida',   'Revisa el precio — puedes pagar'],
        ['🛵 Domiciliario asignado', 'Te asignaron un repartidor'],
        ['✅ Domiciliario aceptó',   'El repartidor confirmó que va'],
        ['🏃 En camino',             'El repartidor está en ruta'],
        ['📍 Llegó al destino',      'Ya está en tu puerta'],
        ['🎉 ¡Entregado!',           'Pedido completado'],
      ]},
    ],
  },
  {
    id: 'pago', emoji: '💳', title: 'Formas de pago', color: 'text-coal',
    content: [
      { type: 'table', rows: [
        ['Efectivo',      'Pagas al domiciliario al recibir el pedido'],
        ['Transferencia', 'Transferencia bancaria antes de la entrega'],
        ['Nequi',         'Pago por Nequi antes de la entrega'],
      ]},
      { type: 'tip', text: 'Para transferencia o Nequi, el cajero te enviará los datos de pago en la nota de cotización.' },
    ],
  },
  {
    id: 'sede', emoji: '📍', title: 'Selección de sede', color: 'text-coal',
    content: [
      { type: 'p', text: 'Tu pedido se atiende desde la sede que seleccionaste al entrar. Puedes cambiarla tocando el ícono de ubicación en la parte superior o el botón "Cambiar" en la tarjeta de sede.' },
      { type: 'table', rows: [
        ['Santa Lucía',    'Cra. 87 #48e-3'],
        ['Santa Teresita', 'Cl 35B #87A-165'],
      ]},
    ],
  },
  {
    id: 'horario', emoji: '🕕', title: 'Horario de atención', color: 'text-mustard',
    content: [
      { type: 'p', text: 'El servicio de domicilios está disponible normalmente de 6:00 PM a 11:00 PM. Si la plataforma aparece cerrada, intenta más tarde o escríbenos por WhatsApp.' },
    ],
  },
]

function ClientHelpSection({ section }) {
  const [open, setOpen] = useState(false)
  return (
    <div className="card overflow-hidden p-0">
      <button onClick={() => setOpen(v => !v)}
        className="w-full flex items-center justify-between gap-3 px-4 py-4 text-left hover:bg-smoked/50 transition-colors">
        <div className="flex items-center gap-3">
          <span className="text-2xl">{section.emoji}</span>
          <span className={`font-display text-base tracking-wide ${section.color}`}>{section.title}</span>
        </div>
        {open ? <ChevronUp size={18} className="text-coal/40 flex-shrink-0" /> : <ChevronDown size={18} className="text-coal/40 flex-shrink-0" />}
      </button>
      {open && (
        <div className="px-4 pb-4 flex flex-col gap-3 border-t border-coal/10 pt-3 animate-fade-in">
          {section.content.map((block, i) => {
            if (block.type === 'p') return <p key={i} className="font-body text-sm text-coal/80 leading-relaxed">{block.text}</p>
            if (block.type === 'tip') return (
              <div key={i} className="flex items-start gap-2 bg-mustard/10 border border-mustard/20 rounded-xl px-3 py-2">
                <span className="text-mustard text-sm flex-shrink-0">💡</span>
                <p className="font-body text-xs text-coal/70">{block.text}</p>
              </div>
            )
            if (block.type === 'steps') return (
              <div key={i} className="flex flex-col gap-2">
                {block.items.map((step, j) => (
                  <div key={j} className="flex items-start gap-3">
                    <span className="w-6 h-6 rounded-full bg-cherry text-cream text-xs font-bold flex items-center justify-center flex-shrink-0 mt-0.5">{j+1}</span>
                    <p className="font-body text-sm text-coal/80 leading-relaxed">{step}</p>
                  </div>
                ))}
              </div>
            )
            if (block.type === 'table') return (
              <div key={i} className="flex flex-col divide-y divide-coal/10 rounded-xl overflow-hidden border border-coal/10">
                {block.rows.map(([col1, col2], j) => (
                  <div key={j} className={`flex gap-3 px-3 py-2 ${j % 2 === 0 ? 'bg-smoked/40' : 'bg-cream'}`}>
                    <span className="font-body text-xs font-semibold text-coal w-36 flex-shrink-0">{col1}</span>
                    <span className="font-body text-xs text-coal/60">{col2}</span>
                  </div>
                ))}
              </div>
            )
            return null
          })}
        </div>
      )}
    </div>
  )
}

function ClientHelpModal({ onClose }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-coal/50 backdrop-blur-sm animate-fade-in"
      onClick={e => { if (e.target === e.currentTarget) onClose() }}>
      <div className="bg-cream w-full max-w-2xl rounded-3xl max-h-[90dvh] flex flex-col shadow-2xl animate-scale-in mx-4">
        <div className="sticky top-0 bg-gradient-to-r from-cherry to-tangelo px-6 py-5 rounded-t-3xl flex items-center justify-between flex-shrink-0">
          <div className="flex items-center gap-3">
            <HelpCircle size={22} className="text-cream" />
            <div>
              <p className="font-display text-xl text-cream tracking-wide">Centro de ayuda</p>
              <p className="font-body text-xs text-cream/70">Todo lo que necesitas saber</p>
            </div>
          </div>
          <button onClick={onClose} className="text-cream/70 hover:text-cream transition-colors">
            <X size={22} />
          </button>
        </div>
        <div className="overflow-y-auto scroll-custom p-5 flex flex-col gap-3 pb-8">
          {CLIENT_HELP_SECTIONS.map(s => <ClientHelpSection key={s.id} section={s} />)}
          <div className="mt-2 text-center">
            <p className="font-body text-xs text-coal/30">DeliStars · Plataforma de Domicilios · v2.0</p>
          </div>
        </div>
      </div>
    </div>
  )
}
