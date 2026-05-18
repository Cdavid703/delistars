import { useState, useEffect } from 'react'
import { collection, query, where, onSnapshot } from 'firebase/firestore'
import { db } from '../../services/firebase'
import { useAuth } from '../../contexts/AuthContext'
import Logo from '../common/Logo'
import StatusBadge from '../common/StatusBadge'
import { format } from 'date-fns'
import { es } from 'date-fns/locale'
import {
  MapPin, Phone, ShoppingBag, Navigation, ExternalLink,
  LogOut, Info, Star
} from 'lucide-react'
import { SEDES } from '../../services/roles'

const STATUS_STEPS = [
  { key: 'assigned',  label: 'Pedido recibido',   emoji: '📋' },
  { key: 'accepted',  label: 'Domiciliario en camino', emoji: '🛵' },
  { key: 'in_transit',label: 'En camino',          emoji: '🏃' },
  { key: 'arrived',   label: 'Llegó al destino',   emoji: '📍' },
  { key: 'delivered_paid', label: '¡Entregado!',   emoji: '✅' },
  { key: 'pending_cuadre', label: '¡Entregado!',   emoji: '✅' },
  { key: 'completed', label: '¡Entregado!',        emoji: '✅' },
]

export default function ClientPanel() {
  const { user, role, effectiveRole, setViewingAs, sede, selectSede, logout } = useAuth()
  const [orders, setOrders] = useState([])
  const [selected, setSelected] = useState(null)

  const today = format(new Date(), "EEEE dd 'de' MMMM yyyy", { locale: es })

  // Listen to orders for the client's phone — for now show all orders in sede
  // In a future version this can be filtered by phone number
  useEffect(() => {
    if (!sede) return
    const q = query(
      collection(db, 'orders'),
      where('sedeId', '==', sede.id),
      where('status', 'not-in', ['completed'])
    )
    return onSnapshot(q, snap => {
      setOrders(snap.docs.map(d => ({ id: d.id, ...d.data() }))
        .sort((a, b) => (b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0)))
    })
  }, [sede])

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
            <div className="w-10 h-10 bg-cherry/10 rounded-full flex items-center justify-center">
              <MapPin size={18} className="text-cherry" />
            </div>
            <div>
              <p className="font-display text-base text-coal tracking-wide">Sede {sede?.name}</p>
              <p className="font-body text-xs text-coal/50">{sede?.address}</p>
            </div>
          </div>
        </div>
      </div>

      {/* Info banner */}
      <div className="mx-4 mt-3">
        <div className="bg-mustard/10 border border-mustard/20 rounded-2xl px-4 py-3 flex items-start gap-2">
          <Info size={16} className="text-mustard flex-shrink-0 mt-0.5" />
          <p className="font-body text-xs text-coal/70">
            Para hacer tu pedido escríbenos por WhatsApp. Aquí puedes ver el estado de tu entrega cuando el cajero te confirme.
          </p>
        </div>
      </div>

      {/* Active orders */}
      <div className="px-4 mt-4">
        <p className="section-title mb-3">Pedidos activos</p>
        {orders.length === 0 ? (
          <div className="flex flex-col items-center gap-3 py-10">
            <p className="text-4xl">🍔</p>
            <p className="font-body text-coal/40 text-center text-sm">
              No hay pedidos activos en este momento
            </p>
          </div>
        ) : (
          <div className="flex flex-col gap-3">
            {orders.map(o => (
              <ClientOrderCard key={o.id} order={o} onClick={() => setSelected(o)} />
            ))}
          </div>
        )}
      </div>

      {/* Sedes info */}
      <div className="px-4 mt-6 mb-8">
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
              <a
                href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(s.address)}`}
                target="_blank" rel="noreferrer"
                className="btn-ghost btn-sm"
              >
                Ver
              </a>
            </div>
          ))}
        </div>
      </div>

      {/* Order detail modal */}
      {selected && <ClientOrderDetail order={selected} onClose={() => setSelected(null)} />}
    </div>
  )
}

function ClientOrderCard({ order, onClick }) {
  const stepIdx = STATUS_STEPS.findIndex(s => s.key === order.status)
  const step    = STATUS_STEPS[stepIdx] || STATUS_STEPS[0]
  const progress = Math.round(((stepIdx + 1) / STATUS_STEPS.length) * 100)

  return (
    <button onClick={onClick} className="order-card w-full text-left border-l-4 border-cherry">
      <div className="flex items-start justify-between gap-2 mb-3">
        <div>
          {order.orderNumber && <p className="font-display text-xl text-cherry">#{order.orderNumber}</p>}
          <p className="font-body font-semibold text-sm">{order.name}</p>
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

function ClientOrderDetail({ order, onClose }) {
  const stepIdx = STATUS_STEPS.findIndex(s => s.key === order.status)
  const step    = STATUS_STEPS[Math.max(0, stepIdx)]
  const progress = Math.round(((stepIdx + 1) / STATUS_STEPS.length) * 100)

  const openDriverMap = () => {
    if (order.driverLat && order.driverLng) {
      window.open(`https://www.google.com/maps/search/?api=1&query=${order.driverLat},${order.driverLng}`, '_blank')
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-coal/50 backdrop-blur-sm animate-fade-in"
      onClick={e => { if (e.target === e.currentTarget) onClose() }}>
      <div className="bg-cream w-full max-w-lg rounded-t-3xl sm:rounded-3xl max-h-[90dvh] overflow-y-auto scroll-custom">
        <div className="sticky top-0 bg-gradient-to-r from-cherry to-tangelo px-5 py-5 rounded-t-3xl sm:rounded-t-3xl">
          <div className="flex items-center justify-between mb-3">
            <p className="font-display text-2xl text-cream tracking-wide">
              {order.orderNumber ? `Pedido #${order.orderNumber}` : 'Mi pedido'}
            </p>
            <button onClick={onClose} className="text-cream/70 hover:text-cream">✕</button>
          </div>
          {/* Progress */}
          <div className="mb-1">
            <p className="font-body text-sm font-semibold text-cream mb-2">{step.emoji} {step.label}</p>
            <div className="w-full bg-cream/20 rounded-full h-2">
              <div className="bg-cream h-2 rounded-full transition-all duration-500"
                style={{ width: `${progress}%` }} />
            </div>
          </div>
        </div>

        <div className="p-5 flex flex-col gap-4">
          {/* Timeline */}
          <div className="flex flex-col gap-2">
            {STATUS_STEPS.filter((s, i, arr) => {
              // dedupe delivered
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
                  <span className={`font-body text-sm ${done ? 'text-coal font-semibold' : 'text-coal/40'}`}>
                    {s.label}
                  </span>
                </div>
              )
            })}
          </div>

          {/* Driver location */}
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

          {/* Order detail */}
          <div className="card">
            <div className="flex items-center gap-2 mb-2">
              <ShoppingBag size={16} className="text-cherry" />
              <p className="font-display text-base tracking-wide">Tu pedido</p>
            </div>
            <p className="font-body text-sm text-coal whitespace-pre-wrap">{order.items}</p>
          </div>

          <div className="card">
            <div className="flex items-center gap-2 mb-1">
              <MapPin size={16} className="text-cherry" />
              <p className="font-display text-base tracking-wide">Entrega en</p>
            </div>
            <p className="font-body text-sm text-coal">{order.fullAddress}</p>
          </div>
        </div>
      </div>
    </div>
  )
}
