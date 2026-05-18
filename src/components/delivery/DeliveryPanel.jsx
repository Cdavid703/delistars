import { useState, useEffect, useRef } from 'react'
import {
  collection, query, where, onSnapshot,
  doc, updateDoc, serverTimestamp
} from 'firebase/firestore'
import { db } from '../../services/firebase'
import { useAuth } from '../../contexts/AuthContext'
import Logo from '../common/Logo'
import StatusBadge from '../common/StatusBadge'
import { format } from 'date-fns'
import { es } from 'date-fns/locale'
import {
  MapPin, Phone, User, ShoppingBag, Navigation,
  ExternalLink, CheckCircle, Banknote, LogOut, Bell
} from 'lucide-react'

const TABS = [
  { id: 'pending',   label: 'Pedidos' },
  { id: 'active',    label: 'En curso' },
  { id: 'completed', label: 'Entregados' },
]

export default function DeliveryPanel() {
  const { user, sede, logout, selectSede } = useAuth()
  const [orders,   setOrders]   = useState([])
  const [tab,      setTab]      = useState('pending')
  const [selected, setSelected] = useState(null)
  const [notifCount, setNotifCount] = useState(0)
  const prevCount = useRef(0)
  const geoWatchId = useRef(null)

  const today = format(new Date(), "EEEE dd 'de' MMMM yyyy", { locale: es })

  // Listen to orders assigned to this driver
  useEffect(() => {
    if (!user?.email) return
    const q = query(
      collection(db, 'orders'),
      where('driverEmail', '==', user.email.toLowerCase())
    )
    return onSnapshot(q, snap => {
      const all = snap.docs.map(d => ({ id: d.id, ...d.data() }))
      const newPending = all.filter(o => o.status === 'assigned').length
      if (newPending > prevCount.current) {
        if (typeof Notification !== 'undefined' && Notification.permission === 'granted') {
          new Notification('🔔 DeliStars — Nuevo pedido', {
            body: `Tienes ${newPending} pedido(s) por aceptar`,
            icon: '/domicilios/logo_sello.png',
          })
        }
      }
      prevCount.current = newPending
      setNotifCount(newPending)
      setOrders(all.sort((a, b) => (b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0)))
    })
  }, [user, sede])

  // Request notification permission
  useEffect(() => {
    if (typeof Notification !== 'undefined' && Notification.permission === 'default') {
      Notification.requestPermission()
    }
  }, [])

  // Start GPS tracking when driver has an active order
  useEffect(() => {
    const hasActive = orders.some(o => ['accepted','in_transit','arrived'].includes(o.status))
    if (hasActive && !geoWatchId.current && navigator.geolocation) {
      geoWatchId.current = navigator.geolocation.watchPosition(
        async pos => {
          const active = orders.find(o => ['accepted','in_transit','arrived'].includes(o.status))
          if (active) {
            await updateDoc(doc(db, 'orders', active.id), {
              driverLat: pos.coords.latitude,
              driverLng: pos.coords.longitude,
              driverUpdatedAt: serverTimestamp(),
            }).catch(() => {})
          }
        },
        () => {},
        { enableHighAccuracy: true, maximumAge: 10000 }
      )
    }
    if (!hasActive && geoWatchId.current) {
      navigator.geolocation.clearWatch(geoWatchId.current)
      geoWatchId.current = null
    }
    return () => {
      if (geoWatchId.current) navigator.geolocation.clearWatch(geoWatchId.current)
    }
  }, [orders])

  const pendingOrders   = orders.filter(o => o.status === 'assigned')
  const activeOrders    = orders.filter(o => ['accepted','in_transit','arrived'].includes(o.status))
  const completedOrders = orders.filter(o => ['delivered_paid','delivered_cash','pending_cuadre','completed'].includes(o.status))

  const tabOrders = tab === 'pending' ? pendingOrders : tab === 'active' ? activeOrders : completedOrders

  return (
    <div className="min-h-screen-safe flex flex-col bg-gradient-soft">
      {/* Header */}
      <header className="page-header">
        <div className="flex items-center gap-3">
          <Logo variant="light" size="sm" />
          <div>
            <p className="font-display text-base text-coal tracking-wide leading-tight">{sede?.name}</p>
            <p className="font-body text-xs text-coal/50 capitalize">{today}</p>
          </div>
        </div>
        <div className="flex items-center gap-1">
          <div className="relative">
            <button className="btn-icon" onClick={() => setTab('pending')}>
              <Bell size={20} />
              {notifCount > 0 && (
                <span className="notif-badge">{notifCount}</span>
              )}
            </button>
          </div>
          <button onClick={() => selectSede(null)} className="btn-icon"><MapPin size={20} /></button>
          <button onClick={logout} className="btn-icon"><LogOut size={20} /></button>
        </div>
      </header>

      {/* Alert banner for new orders */}
      {notifCount > 0 && (
        <div className="mx-4 mt-3 bg-cherry text-cream rounded-2xl px-4 py-3 flex items-center gap-3 animate-bounce-soft">
          <Bell size={18} className="flex-shrink-0" />
          <p className="font-body font-semibold text-sm">
            {notifCount === 1 ? '¡Tienes 1 pedido nuevo!' : `¡Tienes ${notifCount} pedidos nuevos!`}
          </p>
        </div>
      )}

      {/* Tabs */}
      <div className="flex border-b border-coal/10 bg-cream/80 px-4 mt-2">
        {TABS.map(t => {
          const count = t.id === 'pending' ? pendingOrders.length : t.id === 'active' ? activeOrders.length : completedOrders.length
          return (
            <button key={t.id} onClick={() => setTab(t.id)}
              className={tab === t.id ? 'tab-btn-active' : 'tab-btn-inactive'}>
              {t.label}
              {count > 0 && (
                <span className={`ml-1 text-[10px] font-bold px-1.5 py-0.5 rounded-full ${
                  t.id === 'pending' ? 'bg-cherry text-cream' : 'bg-coal/10 text-coal'
                }`}>{count}</span>
              )}
            </button>
          )
        })}
      </div>

      {/* Orders */}
      <main className="flex-1 overflow-y-auto scroll-custom p-4 flex flex-col gap-3">
        {tabOrders.length === 0 && (
          <div className="flex flex-col items-center justify-center gap-3 py-16">
            <p className="text-4xl">{tab === 'pending' ? '🛵' : tab === 'active' ? '🗺️' : '✅'}</p>
            <p className="font-body text-coal/40 text-center">
              {tab === 'pending' ? 'Sin pedidos nuevos' : tab === 'active' ? 'No tienes pedidos en curso' : 'No hay entregados aún'}
            </p>
          </div>
        )}

        {tabOrders.map(order => (
          <DriverOrderCard key={order.id} order={order} onClick={() => setSelected(order)} />
        ))}
      </main>

      {/* Order detail */}
      {selected && (
        <DriverOrderDetail
          order={selected}
          onClose={() => setSelected(null)}
        />
      )}
    </div>
  )
}

// ─── Mini card ────────────────────────────────────────────────────────────────
function DriverOrderCard({ order, onClick }) {
  return (
    <button onClick={onClick}
      className={`order-card w-full text-left ${
        order.status === 'assigned' ? 'border-cherry bg-cherry/5' : 'border-smoked'
      }`}>
      <div className="flex items-start justify-between gap-2 mb-2">
        <div className="flex items-center gap-2">
          {order.orderNumber && <span className="font-display text-lg text-cherry">#{order.orderNumber}</span>}
          <StatusBadge status={order.status} />
        </div>
        {order.status === 'assigned' && (
          <span className="text-xs font-semibold text-cherry animate-pulse font-body">¡Aceptar!</span>
        )}
      </div>
      <div className="flex items-center gap-1.5 mb-1">
        <User size={13} className="text-coal/40" />
        <span className="font-body font-semibold text-sm">{order.name}</span>
      </div>
      <div className="flex items-start gap-1.5">
        <MapPin size={13} className="text-coal/40 mt-0.5 flex-shrink-0" />
        <span className="font-body text-xs text-coal/60 line-clamp-2">{order.fullAddress}</span>
      </div>
    </button>
  )
}

// ─── Full detail + actions ────────────────────────────────────────────────────
function DriverOrderDetail({ order, onClose }) {
  const [loading, setLoading] = useState(false)
  const [step, setStep] = useState(null) // 'delivered'

  const update = async (data) => {
    setLoading(true)
    try {
      await updateDoc(doc(db, 'orders', order.id), { ...data, updatedAt: serverTimestamp() })
      onClose()
    } finally { setLoading(false) }
  }

  const accept    = () => update({ status: 'accepted' })
  const transit   = () => update({ status: 'in_transit' })
  const arrived   = () => update({ status: 'arrived' })
  const deliveredPaid = () => update({ status: 'delivered_paid' })
  const deliveredCash = () => update({ status: 'pending_cuadre' })

  const navAddress = encodeURIComponent(order.fullAddress + ', Medellín, Colombia')
  const openMaps = () => window.open(`https://www.google.com/maps/dir/?api=1&destination=${navAddress}`, '_blank')
  const openWaze = () => window.open(`https://waze.com/ul?q=${encodeURIComponent(order.fullAddress)}&navigate=yes`, '_blank')

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-coal/50 backdrop-blur-sm animate-fade-in"
      onClick={e => { if (e.target === e.currentTarget) onClose() }}>
      <div className="bg-cream w-full max-w-lg rounded-t-3xl sm:rounded-3xl max-h-[92dvh] overflow-y-auto scroll-custom animate-slide-in-right">
        {/* Header */}
        <div className="sticky top-0 bg-cream/95 backdrop-blur-sm flex items-center justify-between px-5 py-4 border-b border-coal/10">
          <div className="flex items-center gap-2">
            {order.orderNumber && <span className="font-display text-2xl text-cherry">#{order.orderNumber}</span>}
            <StatusBadge status={order.status} />
          </div>
          <button onClick={onClose} className="btn-icon text-coal/50">✕</button>
        </div>

        <div className="p-5 flex flex-col gap-4">
          {/* Client */}
          <div className="card">
            <div className="flex items-center gap-2 mb-2">
              <User size={16} className="text-cherry" />
              <p className="font-display text-base tracking-wide">{order.name}</p>
            </div>
            <a href={`tel:${order.phone}`} className="flex items-center gap-2 text-cherry font-body text-sm font-semibold">
              <Phone size={14} /> {order.phone}
            </a>
          </div>

          {/* Address + navigation */}
          <div className="card">
            <div className="flex items-start gap-2 mb-3">
              <MapPin size={16} className="text-cherry flex-shrink-0 mt-0.5" />
              <div>
                <p className="font-body font-semibold text-sm">{order.fullAddress}</p>
                {order.barrio    && <p className="font-body text-xs text-coal/50">Barrio: {order.barrio}</p>}
                {order.reference && <p className="font-body text-xs text-coal/50">Ref: {order.reference}</p>}
              </div>
            </div>
            <div className="flex gap-2">
              <button onClick={openMaps} className="btn-secondary btn-sm flex-1"><Navigation size={14} />Maps</button>
              <button onClick={openWaze} className="btn-secondary btn-sm flex-1"><ExternalLink size={14} />Waze</button>
            </div>
          </div>

          {/* Order items */}
          <div className="card">
            <div className="flex items-center gap-2 mb-2">
              <ShoppingBag size={16} className="text-cherry" />
              <p className="font-display text-base tracking-wide">Pedido</p>
            </div>
            <p className="font-body text-sm text-coal whitespace-pre-wrap">{order.items}</p>
            {order.notes && (
              <div className="mt-2 bg-mustard/10 rounded-lg p-2">
                <p className="font-body text-xs text-coal/70">{order.notes}</p>
              </div>
            )}
          </div>

          {/* Payment info */}
          <div className="card bg-cherry/5 border border-cherry/20">
            <p className="font-display text-base tracking-wide mb-1">Pago</p>
            <p className="font-body text-sm text-coal">{order.payment}</p>
          </div>

          {/* Actions by status */}
          <div className="flex flex-col gap-3 pb-4">
            {order.status === 'assigned' && (
              <button onClick={accept} disabled={loading} className="btn-mint w-full btn-lg">
                <CheckCircle size={20} /> Aceptar pedido
              </button>
            )}
            {order.status === 'accepted' && (
              <button onClick={transit} disabled={loading} className="btn-primary w-full btn-lg">
                <Navigation size={20} /> Iniciar entrega
              </button>
            )}
            {order.status === 'in_transit' && (
              <button onClick={arrived} disabled={loading} className="btn-mustard w-full btn-lg">
                <MapPin size={20} /> Llegué al destino
              </button>
            )}
            {order.status === 'arrived' && !step && (
              <div className="flex flex-col gap-3">
                <p className="font-body text-sm text-coal/60 text-center">¿Cómo se pagó el pedido?</p>
                <button onClick={deliveredPaid} disabled={loading} className="btn-mint w-full btn-lg">
                  <CheckCircle size={20} /> Ya pagado (transferencia)
                </button>
                <button onClick={deliveredCash} disabled={loading} className="btn-mustard w-full btn-lg">
                  <Banknote size={20} /> Recibí efectivo
                </button>
              </div>
            )}
            {['delivered_paid','delivered_cash','pending_cuadre','completed'].includes(order.status) && (
              <div className="bg-mint/10 border border-mint/30 rounded-2xl p-4 text-center">
                <CheckCircle size={28} className="text-mint mx-auto mb-2" />
                <p className="font-display text-lg tracking-wide text-mint">¡Pedido entregado!</p>
                {order.status === 'pending_cuadre' && (
                  <p className="font-body text-xs text-coal/60 mt-1">Pendiente cuadre de caja con cajero</p>
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
