import { useState, useEffect, useRef } from 'react'
import {
  collection, query, where, onSnapshot,
  doc, updateDoc, setDoc, serverTimestamp, arrayUnion
} from 'firebase/firestore'
import { db } from '../../services/firebase'
import { useAuth } from '../../contexts/AuthContext'
import Logo from '../common/Logo'
import RoleSwitcher from '../common/RoleSwitcher'
import StatusBadge from '../common/StatusBadge'
import { format } from 'date-fns'
import { es } from 'date-fns/locale'
import {
  MapPin, Phone, User, ShoppingBag, Navigation,
  ExternalLink, CheckCircle, Banknote, LogOut, Bell,
  DollarSign, Calculator, X, MessageSquare, BookOpen,
  Search, ChevronDown, ChevronUp, HelpCircle, Receipt,
  Send, Radio
} from 'lucide-react'
import { ROLES } from '../../services/roles'

const TABS = [
  { id: 'pending',   label: 'Pedidos' },
  { id: 'active',    label: 'En curso' },
  { id: 'completed', label: 'Entregados' },
]

const isToday = ts => {
  if (!ts?.toDate) return false
  return ts.toDate().toDateString() === new Date().toDateString()
}

const fmt = v => (v !== undefined && v !== null && v !== '') ? `$${Number(v).toLocaleString('es-CO')}` : '—'

export default function DeliveryPanel() {
  const { user, sede, logout, selectSede, allRoles, setViewingAs } = useAuth()
  const [orders,          setOrders]         = useState([])
  const [tab,             setTab]            = useState('pending')
  const [selected,        setSelected]       = useState(null)
  const [notifCount,      setNotifCount]     = useState(0)
  const [showCuadre,      setShowCuadre]     = useState(false)
  const [showManual,      setShowManual]     = useState(false)
  const [historyDate,     setHistoryDate]    = useState('')
  const [debugInfo,       setDebugInfo]      = useState(null)
  const [locationSharing, setLocationSharing] = useState(false)
  const prevCount        = useRef(0)
  const geoWatchId       = useRef(null)
  const locShareWatchId  = useRef(null)

  const today = format(new Date(), "EEEE dd 'de' MMMM yyyy", { locale: es })

  useEffect(() => {
    if (!user?.email) return
    const email = user.email.toLowerCase().trim()
    setDebugInfo({ email, status: 'conectando…', count: null, error: null })
    const q = query(collection(db, 'orders'), where('driverEmail', '==', email))
    return onSnapshot(q, snap => {
      const all = snap.docs.map(d => ({ id: d.id, ...d.data() }))
      const newPending = all.filter(o => o.status === 'assigned').length
      if (newPending > prevCount.current) {
        if (typeof Notification !== 'undefined' && Notification.permission === 'granted') {
          new Notification('🔔 DeliStars — Nuevo pedido', {
            body: `Tienes ${newPending} pedido(s) por aceptar`,
            icon: '/logo_sello.png',
          })
        }
      }
      prevCount.current = newPending
      setNotifCount(newPending)
      setOrders(all.sort((a, b) => (b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0)))
      setDebugInfo({ email, status: 'ok', count: all.length, error: null })
    }, err => {
      console.error('[DeliveryPanel] Error al leer pedidos:', err.code, err.message)
      setDebugInfo({ email, status: 'error', count: null, error: err.code + ': ' + err.message })
    })
  }, [user, sede])

  useEffect(() => {
    if (typeof Notification !== 'undefined' && Notification.permission === 'default') {
      Notification.requestPermission()
    }
  }, [])

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

  // GPS compartido (para que el cajero vea la ubicación aunque no haya pedido activo)
  useEffect(() => {
    if (!locationSharing || !navigator.geolocation || !user?.email) {
      if (locShareWatchId.current) {
        navigator.geolocation.clearWatch(locShareWatchId.current)
        locShareWatchId.current = null
      }
      return
    }
    const email = user.email.toLowerCase().trim()
    locShareWatchId.current = navigator.geolocation.watchPosition(
      async pos => {
        await setDoc(doc(db, 'driver_locations', email), {
          driverEmail: email,
          driverName:  user.displayName || email,
          lat:         pos.coords.latitude,
          lng:         pos.coords.longitude,
          updatedAt:   serverTimestamp(),
          sedeId:      sede?.id || '',
          active:      true,
          ts:          Date.now(),
        }).catch(() => {})
      },
      () => {},
      { enableHighAccuracy: true, maximumAge: 10000 }
    )
    return () => {
      if (locShareWatchId.current) {
        navigator.geolocation.clearWatch(locShareWatchId.current)
        locShareWatchId.current = null
      }
    }
  }, [locationSharing, user, sede])

  const toggleLocationSharing = async () => {
    const next = !locationSharing
    setLocationSharing(next)
    if (!next && user?.email) {
      const email = user.email.toLowerCase().trim()
      await setDoc(doc(db, 'driver_locations', email), { active: false }, { merge: true }).catch(() => {})
    }
  }

  const pendingOrders   = orders.filter(o => o.status === 'assigned')
  const activeOrders    = orders.filter(o => ['accepted','in_transit','arrived'].includes(o.status))
  const completedOrders = orders.filter(o => {
    if (!['delivered_paid','delivered_cash','pending_cuadre','completed'].includes(o.status)) return false
    const target = historyDate ? new Date(historyDate + 'T00:00:00') : new Date()
    if (!o.createdAt?.toDate) return false
    return o.createdAt.toDate().toDateString() === target.toDateString()
  })

  const tabOrders = tab === 'pending' ? pendingOrders : tab === 'active' ? activeOrders : completedOrders

  return (
    <div className="min-h-screen-safe flex flex-col bg-gradient-soft">
      <header className="page-header">
        <div className="flex items-center gap-3">
          <Logo variant="light" size="sm" />
          <div>
            <p className="font-display text-base text-coal tracking-wide leading-tight">
              {user?.displayName?.split(' ')[0] || user?.email?.split('@')[0] || 'Domiciliario'}
            </p>
            <div className="flex items-center gap-1.5 mt-0.5">
              <span className="font-body text-[10px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded-full bg-mint/15 text-mint">Domiciliario</span>
              <p className="font-body text-xs text-coal/50">{sede?.name}</p>
            </div>
          </div>
        </div>
        <div className="flex items-center gap-1">
          <button onClick={toggleLocationSharing} title={locationSharing ? 'Desactivar GPS compartido' : 'Compartir mi ubicación con cajero'}
            className={`btn-icon flex items-center gap-1 px-2 relative ${locationSharing ? 'text-mint' : 'text-coal/60 hover:text-mint'}`}>
            <Radio size={18} className={locationSharing ? 'animate-pulse' : ''} />
            <span className="font-body text-xs font-semibold hidden sm:inline">{locationSharing ? 'GPS' : 'GPS'}</span>
            {locationSharing && <span className="absolute -top-0.5 -right-0.5 w-2 h-2 rounded-full bg-mint animate-pulse" />}
          </button>
          <button onClick={() => setShowManual(true)} title="Manual"
            className="btn-icon text-coal/60 hover:text-cherry flex items-center gap-1 px-2">
            <BookOpen size={18} />
            <span className="font-body text-xs font-semibold hidden sm:inline">Manual</span>
          </button>
          <button onClick={() => setShowCuadre(true)} title="Cuadre de turno"
            className="btn-icon text-coal/60 hover:text-mustard flex items-center gap-1 px-2">
            <Calculator size={18} />
            <span className="font-body text-xs font-semibold hidden sm:inline">Cuadre</span>
          </button>
          <div className="relative">
            <button className="btn-icon" onClick={() => setTab('pending')}>
              <Bell size={20} />
              {notifCount > 0 && <span className="notif-badge">{notifCount}</span>}
            </button>
          </div>
          <RoleSwitcher />
          <button onClick={() => selectSede(null)} className="btn-icon"><MapPin size={20} /></button>
          <button onClick={logout} className="btn-icon"><LogOut size={20} /></button>
        </div>
      </header>

      {/* DEBUG — remover después */}
      {debugInfo && (
        <div className="mx-4 mt-2 bg-coal/90 text-cream rounded-xl px-3 py-2 text-[11px] font-mono flex flex-col gap-0.5">
          <p>📧 email buscado: <strong className="text-mint">{debugInfo.email}</strong></p>
          <p>📡 estado: <strong>{debugInfo.status}</strong>
            {debugInfo.count !== null
              ? debugInfo.count === 0
                ? <span className="text-red-400"> · 0 pedidos — email no coincide con los pedidos asignados</span>
                : <span className="text-mint"> · {debugInfo.count} pedido(s) encontrados ✅</span>
              : ''}
          </p>
          {debugInfo.error && <p className="text-red-400">❌ {debugInfo.error}</p>}
          {debugInfo.count === 0 && (
            <p className="text-yellow-300 mt-1">⚠️ Comparte este email con el administrador para verificar que los pedidos se asignen con este email exacto.</p>
          )}
        </div>
      )}

      {notifCount > 0 && (
        <div className="mx-4 mt-3 bg-cherry text-cream rounded-2xl px-4 py-3 flex items-center gap-3 animate-bounce-soft">
          <Bell size={18} className="flex-shrink-0" />
          <p className="font-body font-semibold text-sm">
            {notifCount === 1 ? '¡Tienes 1 pedido nuevo!' : `¡Tienes ${notifCount} pedidos nuevos!`}
          </p>
        </div>
      )}

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

      {/* Date picker for completed tab */}
      {tab === 'completed' && (
        <div className="mx-4 mt-3 flex items-center gap-3">
          <div className="flex items-center gap-2 flex-1">
            <Search size={16} className="text-coal/40 flex-shrink-0" />
            <input
              type="date"
              className="input-field py-2 text-sm"
              value={historyDate}
              onChange={e => setHistoryDate(e.target.value)}
              max={format(new Date(), 'yyyy-MM-dd')}
            />
          </div>
          {historyDate && (
            <button onClick={() => setHistoryDate('')}
              className="text-xs font-body text-cherry underline whitespace-nowrap">
              Ver hoy
            </button>
          )}
        </div>
      )}

      {/* Cash to collect banner in active tab */}
      {tab === 'active' && activeOrders.some(o => o.cashOnDelivery || o.payment === 'Efectivo') && (() => {
        const total = activeOrders.filter(o => o.cashOnDelivery || o.payment === 'Efectivo').reduce((s, o) => s + (o.totalPrice || 0), 0)
        return (
          <div className="mx-4 mt-2 bg-mustard/15 border border-mustard/30 rounded-xl px-4 py-2.5 flex items-center justify-between">
            <span className="font-body text-xs font-semibold text-coal/70">💵 Efectivo a cobrar en ruta:</span>
            <span className="font-display text-lg text-mustard">{fmt(total)}</span>
          </div>
        )
      })()}

      {/* Summary for completed tab */}
      {tab === 'completed' && tabOrders.length > 0 && (
        <DriverEntregadosSummary orders={tabOrders} />
      )}

      <main className="flex-1 overflow-y-auto scroll-custom p-4 flex flex-col gap-3">
        {tabOrders.length === 0 && (
          <div className="flex flex-col items-center justify-center gap-3 py-16">
            <p className="text-4xl">{tab === 'pending' ? '🛵' : tab === 'active' ? '🗺️' : '✅'}</p>
            <p className="font-body text-coal/40 text-center">
              {tab === 'pending' ? 'Sin pedidos nuevos' : tab === 'active' ? 'No tienes pedidos en curso' :
               historyDate ? `No hay entregados para esa fecha` : 'No hay entregados hoy'}
            </p>
          </div>
        )}
        {tabOrders.map(order => (
          <DriverOrderCard key={order.id} order={order} onClick={() => setSelected(order)} />
        ))}
      </main>

      {selected && <DriverOrderDetail order={selected} onClose={() => setSelected(null)} />}

      {showCuadre && (
        <DriverCuadreTurnoModal orders={orders} onClose={() => setShowCuadre(false)} />
      )}

      {showManual && (
        <DriverManualModal onClose={() => setShowManual(false)} />
      )}
    </div>
  )
}

// ─── Mini card ────────────────────────────────────────────────────────────────
function DriverOrderCard({ order, onClick }) {
  return (
    <button onClick={onClick}
      className={`order-card w-full text-left ${order.status === 'assigned' ? 'border-cherry bg-cherry/5' : 'border-smoked'}`}>
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
      <div className="flex items-start gap-1.5 mb-1">
        <MapPin size={13} className="text-coal/40 mt-0.5 flex-shrink-0" />
        <span className="font-body text-xs text-coal/60 line-clamp-2">{order.fullAddress}</span>
      </div>
      {order.totalPrice > 0 && (
        <div className="flex items-center gap-2 mt-1">
          <DollarSign size={12} className="text-mint" />
          <span className="font-body text-xs font-semibold text-mint">Total: {fmt(order.totalPrice)}</span>
          {order.deliveryPrice > 0 && (
            <span className="font-body text-xs text-coal/40">· Domicilio: {fmt(order.deliveryPrice)}</span>
          )}
        </div>
      )}
    </button>
  )
}

// ─── Full detail + actions ────────────────────────────────────────────────────
function DriverOrderDetail({ order, onClose }) {
  const { user } = useAuth()
  const [loading,      setLoading]     = useState(false)
  const [commentText,  setCommentText] = useState('')
  const [sendingComment, setSendingComment] = useState(false)

  const update = async (data) => {
    setLoading(true)
    try {
      await updateDoc(doc(db, 'orders', order.id), { ...data, updatedAt: serverTimestamp() })
      onClose()
    } finally { setLoading(false) }
  }

  const sendComment = async () => {
    if (!commentText.trim()) return
    setSendingComment(true)
    try {
      await updateDoc(doc(db, 'orders', order.id), {
        comments: arrayUnion({
          role: 'driver',
          name: user?.displayName || user?.email || 'Domiciliario',
          text: commentText.trim(),
          ts:   Date.now(),
        }),
        updatedAt: serverTimestamp(),
      })
      setCommentText('')
    } finally { setSendingComment(false) }
  }

  const accept    = () => update({ status: 'accepted',    acceptedAt:   serverTimestamp() })
  const transit   = () => update({ status: 'in_transit',  inTransitAt:  serverTimestamp() })
  const arrived   = () => update({ status: 'arrived',     arrivedAt:    serverTimestamp() })

  const markDelivered = () => {
    const isCash = order.cashOnDelivery || order.payment === 'Efectivo'
    const newStatus = isCash ? 'pending_cuadre' : 'completed'
    update({ status: newStatus, deliveredAt: serverTimestamp() })
  }

  const navAddress = encodeURIComponent(order.fullAddress + ', Medellín, Colombia')
  const openMaps = () => window.open(`https://www.google.com/maps/dir/?api=1&destination=${navAddress}`, '_blank')
  const openWaze = () => window.open(`https://waze.com/ul?q=${encodeURIComponent(order.fullAddress)}&navigate=yes`, '_blank')

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-coal/50 backdrop-blur-sm animate-fade-in"
      onClick={e => { if (e.target === e.currentTarget) onClose() }}>
      <div className="bg-cream w-full max-w-lg rounded-t-3xl sm:rounded-3xl max-h-[92dvh] overflow-y-auto scroll-custom animate-slide-in-right">
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
            <div className="flex items-center gap-3">
              <a href={`tel:${order.phone}`} className="flex items-center gap-2 text-cherry font-body text-sm font-semibold">
                <Phone size={14} /> {order.phone}
              </a>
              {order.phone && (() => {
                const digits  = order.phone.replace(/\D/g, '')
                const waPhone = digits.length >= 10 ? `57${digits.slice(-10)}` : digits
                return (
                  <a href={`https://wa.me/${waPhone}`} target="_blank" rel="noreferrer"
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-[#25D366]/10 border border-[#25D366]/30 text-[#25D366] font-body text-xs font-semibold hover:bg-[#25D366]/20 transition-colors">
                    📱 WhatsApp
                  </a>
                )
              })()}
            </div>
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

          {/* Driver notes from cashier */}
          {order.driverNotes && (
            <div className="card bg-tangelo/5 border border-tangelo/20">
              <div className="flex items-center gap-2 mb-1">
                <MessageSquare size={14} className="text-tangelo" />
                <p className="font-display text-sm tracking-wide text-tangelo">Nota del cajero</p>
              </div>
              <p className="font-body text-sm text-coal">{order.driverNotes}</p>
            </div>
          )}

          {/* Payment & prices */}
          <div className="card bg-cherry/5 border border-cherry/20">
            <p className="font-display text-base tracking-wide mb-2">Pago</p>
            <p className="font-body text-sm font-semibold text-coal mb-2">{order.payment}</p>
            {order.totalPrice > 0 && (
              <div className="flex flex-col gap-1.5">
                <div className="flex justify-between font-body text-sm">
                  <span className="text-coal/60">Valor pedido:</span>
                  <span className="font-semibold">{fmt(order.quotedPrice)}</span>
                </div>
                <div className="flex justify-between font-body text-sm">
                  <span className="text-coal/60">Domicilio:</span>
                  <span className="font-semibold">{fmt(order.deliveryPrice)}</span>
                </div>
                <div className="border-t border-cherry/20 pt-1.5 flex justify-between font-body text-sm">
                  <span className="font-bold">TOTAL:</span>
                  <span className="font-bold text-cherry">{fmt(order.totalPrice)}</span>
                </div>
                {/* Cash handling info */}
                {(order.cashOnDelivery || order.payment === 'Efectivo') && (
                  <div className="mt-1 bg-mustard/10 rounded-lg p-2">
                    {order.payExact ? (
                      <p className="font-body text-xs text-coal font-semibold">✓ El cliente paga exacto</p>
                    ) : (
                      <>
                        <p className="font-body text-xs text-coal">
                          El cliente paga: <strong>{fmt(order.payAmount)}</strong>
                        </p>
                        <p className="font-body text-xs text-coal">
                          Cambio a dar: <strong className="text-mustard">{fmt(order.change)}</strong>
                        </p>
                      </>
                    )}
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Comments */}
          <div className="card border border-coal/10 flex flex-col gap-3">
            <div className="flex items-center gap-2">
              <MessageSquare size={15} className="text-tangelo" />
              <p className="font-display text-sm tracking-wide text-coal">Comentarios del pedido</p>
            </div>

            {/* Existing comments */}
            {(order.comments?.length > 0) ? (
              <div className="flex flex-col gap-2">
                {[...order.comments].sort((a,b) => a.ts - b.ts).map((c, i) => (
                  <div key={i} className={`rounded-xl px-3 py-2 ${c.role === 'cashier' ? 'bg-tangelo/10 border border-tangelo/20' : 'bg-mint/10 border border-mint/20'}`}>
                    <p className={`font-body text-[10px] font-bold uppercase tracking-wider mb-0.5 ${c.role === 'cashier' ? 'text-tangelo' : 'text-mint'}`}>
                      {c.role === 'cashier' ? '🧾 Cajero' : '🛵 Tú'} · {c.name}
                    </p>
                    <p className="font-body text-sm text-coal">{c.text}</p>
                  </div>
                ))}
              </div>
            ) : (
              <p className="font-body text-xs text-coal/40">Sin comentarios aún</p>
            )}

            {/* Add comment */}
            <div className="flex gap-2">
              <textarea
                className="textarea-field flex-1 h-14 scroll-custom text-sm"
                placeholder="Dejar comentario (ej: cliente no estaba, timbre roto…)"
                value={commentText}
                onChange={e => setCommentText(e.target.value)}
              />
              <button onClick={sendComment} disabled={sendingComment || !commentText.trim()}
                className="btn-mint px-3 self-end">
                <Send size={16} />
              </button>
            </div>
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
            {order.status === 'arrived' && (
              <button onClick={markDelivered} disabled={loading} className="btn-mint w-full btn-lg">
                <CheckCircle size={20} /> Marcar como entregado
              </button>
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

// ─── Driver entregados summary ────────────────────────────────────────────────
function DriverEntregadosSummary({ orders }) {
  const cashOrders   = orders.filter(o => o.cashOnDelivery || o.payment === 'Efectivo')
  const totalFees    = orders.reduce((s, o) => s + (o.deliveryPrice || 0), 0)
  const totalCash    = cashOrders.reduce((s, o) => s + (o.totalPrice || 0), 0)

  return (
    <div className="mx-4 mt-3 bg-gradient-to-r from-mint/10 to-mustard/10 border border-mint/20 rounded-2xl p-4 flex flex-col gap-3">
      <p className="font-display text-base tracking-wide text-coal">Resumen del día</p>
      <div className="grid grid-cols-2 gap-2 text-center">
        <div className="bg-cream/80 rounded-xl p-2">
          <p className="font-display text-2xl text-cherry">{orders.length}</p>
          <p className="font-body text-[10px] text-coal/50 uppercase tracking-wider">Domicilios</p>
        </div>
        <div className="bg-cream/80 rounded-xl p-2">
          <p className="font-display text-2xl text-mustard">{cashOrders.length}</p>
          <p className="font-body text-[10px] text-coal/50 uppercase tracking-wider">Efectivo</p>
        </div>
      </div>
      <div className="flex flex-col gap-1.5">
        {totalFees > 0 && (
          <div className="flex justify-between items-center bg-cream/60 rounded-lg px-3 py-2">
            <span className="font-body text-xs text-coal/60">Domicilios ganados:</span>
            <span className="font-display text-base text-mint">{`$${Number(totalFees).toLocaleString('es-CO')}`}</span>
          </div>
        )}
        {totalCash > 0 && (
          <div className="flex justify-between items-center bg-cream/60 rounded-lg px-3 py-2">
            <span className="font-body text-xs text-coal/60">Efectivo a entregar:</span>
            <span className="font-display text-base text-mustard">{`$${Number(totalCash).toLocaleString('es-CO')}`}</span>
          </div>
        )}
      </div>
    </div>
  )
}

// ─── Cuadre de turno del domiciliario ────────────────────────────────────────
function DriverCuadreTurnoModal({ orders, onClose }) {
  const completedToday = orders.filter(o =>
    ['delivered_paid','delivered_cash','pending_cuadre','completed'].includes(o.status) && isToday(o.createdAt)
  )

  const cashOrders = completedToday.filter(o => o.cashOnDelivery || o.payment === 'Efectivo')
  const totalCash  = cashOrders.reduce((s, o) => s + (o.totalPrice || 0), 0)

  const feeOrders  = completedToday.filter(o => o.deliveryPrice > 0)
  const feeGroups  = {}
  feeOrders.forEach(o => {
    const f = o.deliveryPrice
    if (!feeGroups[f]) feeGroups[f] = { count: 0, total: 0 }
    feeGroups[f].count++; feeGroups[f].total += f
  })
  const totalFees  = feeOrders.reduce((s, o) => s + (o.deliveryPrice || 0), 0)

  return (
    <div className="fixed inset-0 z-[100] flex items-end sm:items-center justify-center bg-coal/50 backdrop-blur-sm animate-fade-in"
      onClick={e => { if (e.target === e.currentTarget) onClose() }}>
      <div className="bg-cream w-full max-w-lg rounded-t-3xl sm:rounded-3xl max-h-[90dvh] overflow-y-auto scroll-custom animate-scale-in">
        <div className="sticky top-0 bg-gradient-to-r from-mustard to-tangelo px-6 py-5 rounded-t-3xl flex items-center justify-between">
          <div>
            <p className="font-display text-2xl text-cream tracking-wide">Mi cuadre de turno</p>
            <p className="font-body text-xs text-cream/70 capitalize">
              {format(new Date(), "EEEE dd 'de' MMMM yyyy", { locale: es })}
            </p>
          </div>
          <button onClick={onClose} className="text-cream/70 hover:text-cream"><X size={22} /></button>
        </div>

        <div className="p-5 flex flex-col gap-4">
          <div className="card">
            <p className="font-display text-base tracking-wide mb-1">📦 Pedidos entregados hoy</p>
            <p className="font-body text-2xl font-bold text-coal">{completedToday.length} pedidos</p>
          </div>

          <div className="card border border-mustard/30">
            <p className="font-display text-base tracking-wide mb-2">💵 Efectivo a entregar en caja</p>
            {cashOrders.length === 0 ? (
              <p className="font-body text-sm text-coal/50">No hay pedidos en efectivo hoy</p>
            ) : (
              <>
                <p className="font-body text-xs text-coal/50 mb-2">{cashOrders.length} pedidos en efectivo</p>
                <div className="bg-mustard/10 rounded-xl px-4 py-3 flex items-center justify-between">
                  <span className="font-body font-semibold text-sm">Total a entregar:</span>
                  <span className="font-display text-2xl text-mustard">{fmt(totalCash)}</span>
                </div>
              </>
            )}
          </div>

          <div className="card border border-mint/30">
            <p className="font-display text-base tracking-wide mb-3">🛵 Lo que te deben por domicilios</p>
            {Object.keys(feeGroups).length === 0 ? (
              <p className="font-body text-sm text-coal/50">Sin datos de domicilios aún</p>
            ) : (
              <div className="flex flex-col gap-2">
                {Object.entries(feeGroups)
                  .sort(([a], [b]) => Number(b) - Number(a))
                  .map(([fee, { count, total }]) => (
                    <div key={fee} className="flex items-center justify-between bg-smoked/50 rounded-lg px-3 py-2">
                      <span className="font-body text-sm text-coal/70">
                        {count} domicilio{count !== 1 ? 's' : ''} × {fmt(Number(fee))}
                      </span>
                      <span className="font-body font-semibold text-sm text-mint">{fmt(total)}</span>
                    </div>
                  ))
                }
                <div className="flex items-center justify-between bg-mint/10 border border-mint/30 rounded-xl px-4 py-3 mt-1">
                  <span className="font-body font-semibold text-sm">Total que te deben:</span>
                  <span className="font-display text-2xl text-mint">{fmt(totalFees)}</span>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

// ─── Manual del domiciliario ──────────────────────────────────────────────────
const DRIVER_MANUAL_SECTIONS = [
  {
    id: 'flujo', emoji: '📋', title: 'Flujo de trabajo', color: 'text-cherry',
    content: [
      { type: 'steps', items: [
        'Recibes el pedido en "Pedidos" con una notificación. Ábrelo y toca "Aceptar pedido".',
        'Toca "Iniciar entrega" cuando salgas a recoger y llevar el pedido.',
        'Toca "Llegué al destino" cuando llegues donde el cliente.',
        'Toca "Marcar como entregado" al entregar. Si fue efectivo → queda en Cuadre.',
        'Ve al cajero para hacer el cuadre de caja con el efectivo recibido.',
      ]},
    ],
  },
  {
    id: 'estados', emoji: '🏷️', title: 'Estados del pedido', color: 'text-coal',
    content: [
      { type: 'table', rows: [
        ['🛵 ASIGNADO',   'Te asignaron el pedido — acéptalo'],
        ['✅ ACEPTADO',   'Confirmaste que vas'],
        ['🏃 EN CAMINO',  'Estás en ruta al cliente'],
        ['📍 LLEGÓ',      'Llegaste al destino'],
        ['💰 CUADRE',     'Entregado en efectivo — pendiente cuadre de caja'],
        ['☑️ COMPLETADO', 'Todo listo, pedido cerrado'],
      ]},
    ],
  },
  {
    id: 'navegacion', emoji: '🗺️', title: 'Navegación', color: 'text-mint',
    content: [
      { type: 'p', text: 'Dentro del detalle del pedido encontrarás dos botones: Google Maps y Waze. Úsalos para llegar al destino del cliente.' },
      { type: 'tip', text: 'Tu ubicación GPS se comparte automáticamente con el cliente cuando el pedido está en curso.' },
    ],
  },
  {
    id: 'efectivo', emoji: '💵', title: 'Pedidos en efectivo', color: 'text-mustard',
    content: [
      { type: 'table', rows: [
        ['Paga exacto',    'El cajero marcó que el cliente paga exacto — no necesitas devolver cambio'],
        ['Necesita cambio','El cajero indica cuánto paga el cliente y cuánto debes devolver de cambio'],
      ]},
      { type: 'tip', text: 'Revisa siempre la sección de "Pago" en el detalle antes de llegar donde el cliente.' },
    ],
  },
  {
    id: 'cuadre', emoji: '💰', title: 'Cuadre de turno', color: 'text-mustard',
    content: [
      { type: 'p', text: 'Al final del turno usa el botón "Cuadre" para ver cuánto efectivo debes entregar en caja y cuánto te deben por los domicilios.' },
      { type: 'tip', text: 'Muéstrale al cajero la pantalla de cuadre para hacer el recuento juntos.' },
    ],
  },
  {
    id: 'historial', emoji: '📅', title: 'Historial de entregas', color: 'text-coal',
    content: [
      { type: 'p', text: 'En la pestaña "Entregados" puedes filtrar por fecha usando el selector de fecha. Por defecto muestra el día de hoy.' },
    ],
  },
]

function DriverManualSection({ section }) {
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
                    <span className="font-body text-xs font-semibold text-coal w-32 flex-shrink-0">{col1}</span>
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

function DriverManualModal({ onClose }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-coal/50 backdrop-blur-sm animate-fade-in"
      onClick={e => { if (e.target === e.currentTarget) onClose() }}>
      <div className="bg-cream w-full max-w-2xl rounded-3xl max-h-[90dvh] flex flex-col shadow-2xl animate-scale-in mx-4">
        <div className="sticky top-0 bg-gradient-to-r from-mint to-mustard px-6 py-5 rounded-t-3xl flex items-center justify-between flex-shrink-0">
          <div className="flex items-center gap-3">
            <BookOpen size={22} className="text-cream" />
            <div>
              <p className="font-display text-xl text-cream tracking-wide">Manual del domiciliario</p>
              <p className="font-body text-xs text-cream/70">Guía completa para tus entregas</p>
            </div>
          </div>
          <button onClick={onClose} className="text-cream/70 hover:text-cream transition-colors">
            <X size={22} />
          </button>
        </div>
        <div className="overflow-y-auto scroll-custom p-5 flex flex-col gap-3 pb-8">
          <div className="flex items-center gap-3 mb-1">
            <div className="w-10 h-10 rounded-full bg-mint/10 flex items-center justify-center flex-shrink-0">
              <HelpCircle size={20} className="text-mint" />
            </div>
            <div>
              <p className="font-display text-xl text-coal tracking-wide">Manual del domiciliario</p>
              <p className="font-body text-xs text-coal/50">Toca cada sección para ver los detalles</p>
            </div>
          </div>
          {DRIVER_MANUAL_SECTIONS.map(s => <DriverManualSection key={s.id} section={s} />)}
          <div className="mt-2 text-center">
            <p className="font-body text-xs text-coal/30">DeliStars · Plataforma de Domicilios · v2.0</p>
          </div>
        </div>
      </div>
    </div>
  )
}
