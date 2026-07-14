import { useState, useEffect, useRef } from 'react'
import {
  collection, query, where, onSnapshot, serverTimestamp,
  doc, getDoc, setDoc, updateDoc, addDoc, arrayUnion, increment
} from 'firebase/firestore'
import {
  db, storage, createOrderWithNumber,
  LOYALTY_REWARD, availableRewardsForSede, redeemLoyaltyRewards, markRewardNotified,
} from '../../services/firebase'
import { ref as storageRef, uploadBytesResumable, getDownloadURL } from 'firebase/storage'
import { useAuth } from '../../contexts/AuthContext'
import Logo from '../common/Logo'
import RoleSwitcher from '../common/RoleSwitcher'
import StatusBadge from '../common/StatusBadge'
import AddressBook from './AddressBook'
import { format } from 'date-fns'
import { es } from 'date-fns/locale'
import {
  MapPin, ShoppingBag, Navigation, Search,
  LogOut, Info, Star, Plus, X, AlertCircle, Clock, MessageSquare,
  HelpCircle, ChevronDown, ChevronUp, Send, LocateFixed
} from 'lucide-react'
import { SEDES } from '../../services/roles'
import { usePWAInstall } from '../../hooks/usePWAInstall'

const STATUS_STEPS = [
  { key: 'pending',       label: 'Pedido enviado',        emoji: '📋' },
  { key: 'quoted',        label: 'Cotización recibida',   emoji: '💰' },
  { key: 'assigned',      label: 'Domiciliario asignado', emoji: '🛵' },
  { key: 'accepted',      label: 'Domiciliario aceptó',   emoji: '✅' },
  { key: 'preparing',     label: 'En preparación',        emoji: '🍳' },
  { key: 'in_transit',    label: 'En camino',             emoji: '🏃' },
  { key: 'arrived',       label: 'Llegó al destino',      emoji: '📍' },
  { key: 'delivered_paid',label: '¡Entregado!',           emoji: '🎉' },
  { key: 'pending_cuadre',label: '¡Entregado!',           emoji: '🎉' },
  { key: 'completed',     label: '¡Entregado!',           emoji: '🎉' },
  { key: 'rejected',      label: 'Pedido rechazado',      emoji: '❌' },
  { key: 'cancelled',     label: 'Pedido cancelado',      emoji: '🚫' },
]

const DELIVERED_STATUSES = ['delivered_paid', 'pending_cuadre', 'completed']
const CLOSED_STATUSES    = ['rejected', 'cancelled']

// Pasos positivos para calcular el progreso (excluye estados de cierre)
const PROGRESS_KEYS = ['pending','quoted','assigned','accepted','preparing','in_transit','arrived','delivered_paid']
const getProgress = status => {
  if (CLOSED_STATUSES.includes(status)) return 0
  if (DELIVERED_STATUSES.includes(status)) return 100
  const idx = PROGRESS_KEYS.indexOf(status)
  return idx === -1 ? 0 : Math.round(((idx + 1) / PROGRESS_KEYS.length) * 100)
}

const isToday = ts => {
  if (!ts?.toDate) return false
  const d = ts.toDate(), n = new Date()
  return d.toDateString() === n.toDateString()
}

const fmt = v => (v !== undefined && v !== null && v !== '') ? `$${Number(v).toLocaleString('es-CO')}` : null

const isIOS        = /iPad|iPhone|iPod/.test(navigator.userAgent)
const isStandalone = window.matchMedia('(display-mode: standalone)').matches || !!navigator.standalone

// ─── Borrador del pedido en curso ────────────────────────────────────────────
// Los navegadores móviles recargan la página con facilidad (cambiar de app,
// bloquear pantalla, poca memoria). Sin borrador, esa recarga botaba el
// carrito y el formulario, y el redirect de "sin contexto" expulsaba al
// cliente al menú: tenía que rehacer TODO el pedido.
const DRAFT_KEY = 'ds_order_draft'
const DRAFT_MAX_AGE_MS = 6 * 60 * 60 * 1000 // 6 horas

function readOrderDraft() {
  try {
    const d = JSON.parse(localStorage.getItem(DRAFT_KEY) || 'null')
    if (!d?.savedAt || Date.now() - d.savedAt > DRAFT_MAX_AGE_MS) {
      localStorage.removeItem(DRAFT_KEY)
      return null
    }
    return d
  } catch { return null }
}

function playMessageSound() {
  try {
    const ctx = new (window.AudioContext || window.webkitAudioContext)()
    if (ctx.state === 'suspended') ctx.resume()
    ;[660, 880].forEach((freq, i) => {
      const osc = ctx.createOscillator(), gain = ctx.createGain()
      osc.connect(gain); gain.connect(ctx.destination)
      osc.type = 'sine'; osc.frequency.value = freq
      const t = ctx.currentTime + i * 0.13
      gain.gain.setValueAtTime(0.25, t)
      gain.gain.exponentialRampToValueAtTime(0.001, t + 0.22)
      osc.start(t); osc.stop(t + 0.24)
    })
  } catch (_) {}
}

export default function ClientPanel() {
  const { user, role, effectiveRole, setViewingAs, sede, selectSede, logout } = useAuth()
  const { canInstall, install } = usePWAInstall()
  const [orders,         setOrders]         = useState([])
  const [ordersLoaded,   setOrdersLoaded]   = useState(false)
  const [selectedId,     setSelectedId]     = useState(null)
  const [showForm,       setShowForm]       = useState(() => !!localStorage.getItem('ds_cart_handoff') || !!readOrderDraft())
  // ¿El cliente entró con contexto (carrito del menú o un borrador de pedido
  // sin terminar)? Si no, no debe quedarse en el panel de domicilios: se le
  // envía al menú a escoger productos.
  const enteredWithCart = useRef(!!localStorage.getItem('ds_cart_handoff') || !!readOrderDraft())
  const [platformActive, setPlatformActive] = useState(null)
  const [showHelp,       setShowHelp]       = useState(false)
  const [showHistory,    setShowHistory]    = useState(false)
  const [ratingOrder,    setRatingOrder]    = useState(null)
  const [installDismissed, setInstallDismissed] = useState(
    () => localStorage.getItem('client_install_dismissed') === '1'
  )

  const [seenCounts, setSeenCounts] = useState(() => {
    try { return JSON.parse(localStorage.getItem('ds_chat_seen') || '{}') } catch { return {} }
  })

  const cashierMsgCountRef = useRef(null)  // null = primera carga, no reproducir
  const today = format(new Date(), "EEEE dd 'de' MMMM yyyy", { locale: es })

  // ─── Fidelización ──────────────────────────────────────────────────────────
  // Solo aplica a clientes con cuenta de Google real (no invitados/anónimos).
  const [loyaltyRewards,  setLoyaltyRewards]  = useState([])
  const [loyaltyProgress, setLoyaltyProgress] = useState({})
  const [celebrateRewards, setCelebrateRewards] = useState([])

  useEffect(() => {
    if (!user?.uid || !user?.email) return
    return onSnapshot(collection(db, 'customers', user.uid, 'rewards'), snap => {
      setLoyaltyRewards(snap.docs.map(d => ({ id: d.id, ...d.data() })))
    }, () => {})
  }, [user?.uid, user?.email])

  useEffect(() => {
    if (!user?.uid || !user?.email) return
    return onSnapshot(doc(db, 'customers', user.uid), snap => {
      setLoyaltyProgress(snap.exists() ? (snap.data().loyalty || {}) : {})
    }, () => {})
  }, [user?.uid, user?.email])

  // Premios recién ganados que el cliente todavía no ha visto.
  useEffect(() => {
    const now = Date.now()
    const unseen = loyaltyRewards.filter(r =>
      r.status === 'available' && !r.notified && (r.expiresAt?.toMillis?.() ?? Infinity) > now
    )
    if (unseen.length > 0) setCelebrateRewards(unseen)
  }, [loyaltyRewards])

  const sedeLoyalty    = (sede?.id && loyaltyProgress[sede.id]) || { count: 0, totalDelivered: 0 }
  const availableForSede = availableRewardsForSede(loyaltyRewards, sede?.id)

  const dismissCelebration = () => {
    celebrateRewards.forEach(r => markRewardNotified(user.uid, r.id).catch(() => {}))
    setCelebrateRewards([])
  }

  useEffect(() => {
    return onSnapshot(
      doc(db, 'config', 'client_platform'),
      snap => setPlatformActive(snap.exists() ? snap.data().active : false),
      _err => setPlatformActive(true),
    )
  }, [])

  // Embudo: registrar (una sola vez por carrito) que el cliente llegó al
  // checkout. Comparado con los pedidos creados da la tasa de abandono en
  // Reportes del admin. Best-effort: si falla, no molesta al cliente.
  useEffect(() => {
    if (!user?.uid || !showForm) return
    if (!localStorage.getItem('ds_cart_handoff')) return
    if (sessionStorage.getItem('ds_funnel_logged')) return
    // El flag se pone ANTES de escribir (evita duplicados por re-render) pero
    // se quita si el write falla, para reintentar en la próxima carga.
    sessionStorage.setItem('ds_funnel_logged', '1')
    addDoc(collection(db, 'metrics_funnel'), {
      type:   'checkout_started',
      uid:    user.uid,
      sedeId: sede?.id || null,
      anon:   !user.email,
      at:     serverTimestamp(),
    }).catch(() => sessionStorage.removeItem('ds_funnel_logged'))
  }, [user?.uid, showForm])

  useEffect(() => {
    if (!user?.uid) return
    const q = query(collection(db, 'orders'), where('clientUid', '==', user.uid))
    return onSnapshot(q, snap => {
      const docs = snap.docs.map(d => ({ id: d.id, ...d.data() }))
      docs.sort((a, b) => (b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0))
      setOrders(docs)
      setOrdersLoaded(true)
    }, err => { console.error('[ClientPanel] Error al leer pedidos:', err.code, err.message); setOrdersLoaded(true) })
  }, [user?.uid])

  // Al panel de domicilios solo se entra pasando por la raíz (carrito) o con
  // pedidos que rastrear. Si se entra directo sin contexto → al menú a escoger
  // productos. Aplica también al equipo que elige "ver como cliente".
  useEffect(() => {
    if (enteredWithCart.current || showForm) return
    // Nunca expulsar a quien tiene un pedido a medio hacer (carrito entregado
    // por el menú o borrador del formulario): perdería todo su pedido.
    if (localStorage.getItem('ds_cart_handoff') || readOrderDraft()) return
    if (ordersLoaded && orders.length === 0) {
      // Resetea "ver como cliente" para que el equipo no quede atrapado: al
      // volver a /domicilios/ recupera su panel en vez de re-redirigirse.
      if (effectiveRole !== role) { try { setViewingAs(null) } catch {} }
      window.location.replace('/')
    }
  }, [ordersLoaded, orders.length, showForm, effectiveRole, role])

  // Sonido al recibir mensaje nuevo del cajero en el chat
  useEffect(() => {
    if (cashierMsgCountRef.current === null) {
      // Primera carga: solo inicializar si ya hay pedidos cargados
      if (orders.length === 0) return   // esperar al primer snapshot real
      cashierMsgCountRef.current = {}
      orders.forEach(o => {
        cashierMsgCountRef.current[o.id] = (o.clientMessages || []).filter(m => m.role === 'cashier').length
      })
      return
    }
    let played = false
    orders.forEach(o => {
      const count = (o.clientMessages || []).filter(m => m.role === 'cashier').length
      const prev  = cashierMsgCountRef.current[o.id]
      // Solo sonar si el pedido ya estaba registrado (prev !== undefined) y el conteo subió
      if (prev !== undefined && count > prev && !played) { playMessageSound(); played = true }
      cashierMsgCountRef.current[o.id] = count
    })
  }, [orders])

  // Disparar modal de calificación cuando un pedido de hoy se entrega sin calificar
  useEffect(() => {
    const prompted = JSON.parse(localStorage.getItem('ds_rated') || '[]')
    const toRate = orders.find(o =>
      DELIVERED_STATUSES.includes(o.status) &&
      !o.rating &&
      isToday(o.createdAt) &&
      !prompted.includes(o.id)
    )
    setRatingOrder(toRate || null)
  }, [orders])

  // Active orders: show regardless of date (could be from yesterday and still in transit)
  const activeOrders    = orders.filter(o => !DELIVERED_STATUSES.includes(o.status) && !CLOSED_STATUSES.includes(o.status))
  // Delivered: only today
  const deliveredOrders = orders.filter(o => DELIVERED_STATUSES.includes(o.status) && isToday(o.createdAt))
  const rejectedOrders  = orders.filter(o => CLOSED_STATUSES.includes(o.status) && isToday(o.createdAt))
  // Always derive selected from live orders so the detail modal reflects real-time updates
  const selected = selectedId ? orders.find(o => o.id === selectedId) ?? null : null

  // Mark cashier messages as seen and open detail
  const openOrderDetail = (orderId) => {
    const o = orders.find(x => x.id === orderId)
    if (o) {
      const count = (o.clientMessages || []).filter(m => m.role === 'cashier').length
      const updated = { ...seenCounts, [orderId]: count }
      setSeenCounts(updated)
      try { localStorage.setItem('ds_chat_seen', JSON.stringify(updated)) } catch {}
    }
    setSelectedId(orderId)
  }

  // Per-order count of unread cashier messages
  const unreadChatMap = Object.fromEntries(
    orders.map(o => {
      const cashierMsgs = (o.clientMessages || []).filter(m => m.role === 'cashier').length
      return [o.id, Math.max(0, cashierMsgs - (seenCounts[o.id] || 0))]
    })
  )

  // Plataforma cerrada: solo bloquear a quien NO tiene pedidos que rastrear.
  // Un cliente con pedidos activos/de hoy debe poder seguir viéndolos y chatear
  // con la caja aunque la plataforma esté cerrada para nuevos pedidos.
  if (platformActive === false && effectiveRole === 'client' && ordersLoaded && orders.length === 0) {
    return (
      <div className="min-h-screen-safe flex flex-col bg-gradient-to-br from-cherry via-tangelo to-mustard">
        <div className="flex-1 flex flex-col items-center justify-center px-6 py-12 text-center">
          <div className="text-6xl mb-4">🔒</div>
          <h1 className="font-display text-3xl text-cream tracking-widest mb-3">Plataforma cerrada</h1>
          <p className="font-body text-cream/80 text-sm max-w-xs">
            El servicio de domicilios abre a las 5:30 PM. Mientras tanto puedes ver el menú en la página principal.
          </p>
          <div className="mt-4 bg-cream/10 rounded-2xl px-6 py-4 flex items-center gap-3">
            <Clock size={18} className="text-cream/70 flex-shrink-0" />
            <p className="font-body text-cream/70 text-sm text-left">
              Horario habitual:<br />
              <span className="font-semibold text-cream">5:30 PM – 11:30 PM</span>
            </p>
          </div>
          <a href="/" className="mt-8 inline-flex items-center gap-2 bg-cream text-cherry font-display tracking-wide px-6 py-3 rounded-2xl shadow-card hover:opacity-90 transition-opacity">
            <ShoppingBag size={18} /> Ver el menú
          </a>
          <button onClick={logout} className="mt-4 flex items-center gap-2 text-cream/60 hover:text-cream text-sm font-body transition-colors">
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
    const { redeemRewardIds = [], ...orderData } = data
    // Número + pedido en UNA transacción atómica: el pedido SIEMPRE llega a
    // la caja con su consecutivo asignado, sin saltos ni números quemados.
    // Si falla, no se crea nada y el formulario muestra el error (el borrador
    // se conserva para reintentar).
    const { orderRef: newOrderRef } = await createOrderWithNumber(sede?.id, {
      ...orderData,
      clientUid:   user.uid,
      clientEmail: user.email   || null,
      clientName:  data.name    || user.displayName || 'Invitado',
      sedeId:      sede?.id     || '',
      sedeName:    sede?.name   || '',
      status:      'pending',
      // El pago se elige tras la cotización de la caja; aún sin definir.
      payment:        '',
      cashOnDelivery: false,
      ...(redeemRewardIds.length > 0 ? {
        loyaltyRedemption: { sedeId: sede?.id || '', rewardIds: redeemRewardIds, count: redeemRewardIds.length },
      } : {}),
      createdAt:   serverTimestamp(),
      updatedAt:   serverTimestamp(),
    })
    if (redeemRewardIds.length > 0) {
      redeemLoyaltyRewards(user.uid, redeemRewardIds, newOrderRef.id).catch(() => {})
    }
    // Solo AHORA que el pedido existe en Firestore se limpian el carrito
    // entregado por el menú y el borrador — nunca antes, para que una recarga
    // a mitad del formulario no le pierda el pedido al cliente.
    localStorage.removeItem('ds_cart_handoff')
    localStorage.removeItem('ds_cart_items')       // carrito persistido del menú (front)
    localStorage.removeItem(DRAFT_KEY)
    sessionStorage.removeItem('ds_funnel_logged')  // próximo carrito = nuevo evento de embudo
    setShowForm(false)
    // Guardar/actualizar perfil del cliente frecuente (best-effort, no bloquea)
    if (user.uid) {
      setDoc(doc(db, 'customers', user.uid), {
        uid:         user.uid,
        name:        data.name        || user.displayName || '',
        email:       user.email       || '',
        phone:       data.phone       || '',
        // Solo guardamos la dirección en pedidos a domicilio (en recoger viene vacía)
        ...(data.fullAddress?.trim() ? { addresses: arrayUnion(data.fullAddress) } : {}),
        lastOrderAt: serverTimestamp(),
        orderCount:  increment(1),
      }, { merge: true }).catch(() => {})
    }
  }

  // ── Checkout a pantalla completa ─────────────────────────────────────────
  // Cuando el cliente llega del menú con su carrito (o tiene un borrador a
  // medias), se le muestra SOLO el formulario de entrega (dirección, datos,
  // canje de premios). El panel de abajo queda únicamente para RASTREAR
  // pedidos; los productos siempre se escogen en el menú de la raíz.
  const exitCheckout = () => {
    // El carrito no se pierde: el handoff solo se borra al crear el pedido.
    if (orders.length > 0) setShowForm(false)
    else window.location.href = '/'
  }
  if (showForm) {
    return (
      <div className="min-h-screen-safe bg-gradient-soft">
        <div className="sticky top-0 z-20 bg-cream/95 backdrop-blur-sm px-5 py-4 border-b border-coal/10 flex items-center justify-between">
          <p className="font-display text-xl text-coal tracking-wide">Completa tu pedido</p>
          <button onClick={exitCheckout} className="btn-icon"><X size={20} /></button>
        </div>
        <div className="p-5 max-w-lg mx-auto pb-16">
          <ClientOrderForm user={user} sede={sede} onSubmit={handleCreateOrder} onCancel={exitCheckout} availableRewards={availableForSede} />
        </div>
      </div>
    )
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
            <RoleSwitcher variant="dark" />
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

      {/* Fidelización — solo clientes con cuenta de Google (no invitados) */}
      {user?.email && (
        <div className="mx-4 mt-3">
          <div className="card bg-white shadow-soft border border-mustard/30">
            <div className="flex items-center justify-between mb-2">
              <p className="font-display text-sm tracking-wide text-coal flex items-center gap-1.5">
                🍔 Fidelización {sede?.name}
              </p>
              {availableForSede.length > 0 && (
                <span className="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full bg-mint/20 text-mint">
                  {availableForSede.length} premio{availableForSede.length > 1 ? 's' : ''} listo{availableForSede.length > 1 ? 's' : ''}
                </span>
              )}
            </div>
            <div className="w-full bg-coal/10 rounded-full h-2 overflow-hidden">
              <div
                className="bg-gradient-to-r from-cherry to-tangelo h-2 rounded-full transition-all"
                style={{ width: `${sedeLoyalty.count > 0 && sedeLoyalty.count % 10 === 0 ? 100 : ((sedeLoyalty.count % 10) / 10) * 100}%` }}
              />
            </div>
            <p className="font-body text-xs text-coal/60 mt-1.5">
              {sedeLoyalty.count}/10 domicilios entregados
              {sedeLoyalty.count > 0 && sedeLoyalty.count % 10 === 9 && ' — ¡el próximo te regala una Hamburguesa Especial gratis! 🎉'}
            </p>
          </div>
        </div>
      )}

      {/* PWA install card */}
      {!isStandalone && !installDismissed && (canInstall || isIOS) && (
        <div className="mx-4 mt-3 flex items-center gap-3 bg-coal text-cream rounded-2xl px-4 py-3 shadow-lg">
          <img src="/logo_sello.png" alt="DeliStars" className="w-10 h-10 flex-shrink-0 rounded-xl object-cover" />
          <div className="flex-1 min-w-0">
            <p className="font-body font-semibold text-sm leading-tight">Instala la app</p>
            <p className="font-body text-[11px] text-cream/60">
              {isIOS ? 'Pulsa Compartir → Agregar a inicio' : 'Ábrela directo desde tu pantalla de inicio'}
            </p>
          </div>
          {canInstall && !isIOS && (
            <button onClick={async () => {
              const accepted = await install()
              if (!accepted) { setInstallDismissed(true); localStorage.setItem('client_install_dismissed', '1') }
            }}
              className="flex-shrink-0 bg-cherry text-cream font-body text-xs font-semibold px-3 py-1.5 rounded-xl hover:bg-cherry/80 transition-colors">
              Instalar
            </button>
          )}
          <button onClick={() => { setInstallDismissed(true); localStorage.setItem('client_install_dismissed', '1') }}
            className="flex-shrink-0 text-cream/40 hover:text-cream transition-colors ml-1">
            <X size={16} />
          </button>
        </div>
      )}

      {/* Info banner */}
      <div className="mx-4 mt-3">
        <div className="bg-mustard/10 border border-mustard/20 rounded-2xl px-4 py-3 flex items-start gap-2">
          <Info size={16} className="text-mustard flex-shrink-0 mt-0.5" />
          <div className="flex-1">
            <p className="font-body text-xs text-coal/70 leading-relaxed">
              ¿Algo falla o tienes un problema con la plataforma? Escríbenos por WhatsApp y te ayudamos.
            </p>
            {sede?.whatsapp && (
              <a
                href={`https://wa.me/${sede.whatsapp}?text=${encodeURIComponent(`Hola DeliStars ${sede.name}! 👋 Tengo un problema con la plataforma.`)}`}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1.5 mt-2 bg-[#25D366] text-white rounded-xl px-3 py-1.5 text-xs font-semibold font-body"
              >
                <MessageSquare size={13} /> Soporte por WhatsApp
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
              <ClientOrderCard key={o.id} order={o} unreadCount={unreadChatMap[o.id] || 0} onClick={() => openOrderDetail(o.id)} />
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
              <button key={o.id} onClick={() => openOrderDetail(o.id)} className="card flex items-center justify-between gap-3 opacity-70 w-full text-left">
                <div>
                  {o.orderNumber && <span className="font-display text-base text-cherry mr-2">#{o.orderNumber}</span>}
                  <span className="font-body text-sm">{(o.items || '—').slice(0, 40)}…</span>
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
              <button key={o.id} onClick={() => openOrderDetail(o.id)} className="card w-full text-left border-l-4 border-pepper/50">
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

      {/* Botón al menú interactivo (la raíz) — el PDF quedaba desactualizado */}
      <div className="px-4 mt-4">
        <a
          href="/"
          className="flex items-center justify-center gap-3 w-full bg-gradient-to-r from-cherry to-tangelo text-cream font-display tracking-wide text-lg py-4 rounded-2xl shadow-glow hover:opacity-90 transition-opacity"
        >
          🍔 Ver menú DeliStars
        </a>
      </div>

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

      {/* FAB — pedir se hace SIEMPRE desde el menú de la raíz: aquí ya no se
          arma un pedido a mano (texto libre); este panel solo rastrea pedidos. */}
      <div className="fixed bottom-6 right-4 z-30">
        <a href="/" className="btn-primary shadow-glow gap-2 pr-5">
          <Plus size={20} />
          Hacer pedido
        </a>
      </div>

      {/* Order detail modal */}
      {selected && <ClientOrderDetail order={selected} onClose={() => setSelectedId(null)} />}

      {/* History modal */}
      {showHistory && <ClientHistoryModal orders={orders} onClose={() => setShowHistory(false)} onSelect={o => { setShowHistory(false); openOrderDetail(o.id) }} />}

      {/* Help modal */}
      {showHelp && <ClientHelpModal onClose={() => setShowHelp(false)} />}

      {/* Celebración de premio(s) de fidelización ganado(s) */}
      {celebrateRewards.length > 0 && (
        <LoyaltyCelebrationModal rewards={celebrateRewards} onClose={dismissCelebration} />
      )}

      {/* Rating modal */}
      {ratingOrder && (
        <RatingModal
          order={ratingOrder}
          onClose={() => {
            const prompted = JSON.parse(localStorage.getItem('ds_rated') || '[]')
            if (!prompted.includes(ratingOrder.id)) {
              localStorage.setItem('ds_rated', JSON.stringify([...prompted, ratingOrder.id]))
            }
            setRatingOrder(null)
          }}
        />
      )}
    </div>
  )
}

// ─── Order form ───────────────────────────────────────────────────────────────
function ClientOrderForm({ user, sede, onSubmit, onCancel, availableRewards = [] }) {
  const [redeemCount, setRedeemCount] = useState(0)
  const sortedRewards = [...availableRewards].sort(
    (a, b) => (a.expiresAt?.toMillis?.() || 0) - (b.expiresAt?.toMillis?.() || 0)
  )
  const [form, setForm] = useState({
    name:               user?.displayName || '',
    phone:              '',
    deliveryMode:       'delivery',   // 'delivery' = domicilio · 'pickup' = recoger en sede
    fullAddress:        '',
    // Coordenadas de la dirección cuando el cliente elige una sugerencia
    // geocodificada — permiten que el pin del domiciliario caiga exacto en vez
    // de depender de re-geocodificar el texto (que fallaba si había un typo).
    addrLat:            null,
    addrLng:            null,
    barrio:             '',
    reference:          '',
    items:              '',
    payment:            '',
    notes:              '',
    mixtoEfectivo:      '',
    mixtoTransferencia: '',
  })
  const [loading,           setLoading]           = useState(false)
  const [errors,            setErrors]            = useState([])
  const [fromMenu,          setFromMenu]          = useState(false)
  const [menuTotal,         setMenuTotal]         = useState(0)
  const errorsRef = useRef(null)

  useEffect(() => {
    // 1) Restaurar el borrador si la página se recargó a mitad del formulario
    //    (muy común en celulares al cambiar de app o bloquear la pantalla).
    const draft = readOrderDraft()
    if (draft?.form) {
      setForm(f => ({ ...f, ...draft.form }))
      if (draft.fromMenu) { setFromMenu(true); setMenuTotal(draft.menuTotal || 0) }
    }
    // 2) El carrito entregado por el menú manda sobre los productos del
    //    borrador. NO se borra aquí: se borra únicamente al crear el pedido,
    //    para que una recarga no deje al cliente sin nada.
    try {
      const raw = localStorage.getItem('ds_cart_handoff')
      if (!raw) return
      const { items: cartItems, total } = JSON.parse(raw)
      if (!Array.isArray(cartItems) || cartItems.length === 0) return
      const lines = cartItems.map(it => {
        let line = `${it.quantity}x ${it.name}`
        if (it.addons?.length) line += ` (${it.addons.join(', ')})`
        if (it.salsas?.length) line += ` | Salsas: ${it.salsas.join(', ')}`
        if (it.cebollas?.length) line += ` | Cebolla: ${it.cebollas.join(', ')}`
        if (it.notes) line += ` — "${it.notes}"`
        return line
      })
      setForm(f => ({
        ...f,
        items: lines.join('\n'),
      }))
      setFromMenu(true)
      setMenuTotal(total || 0)
    } catch (_) {}
  }, [])

  // Autoguardar el borrador mientras el cliente escribe. Si el navegador
  // recarga la página, todo el formulario se restaura tal cual estaba.
  // submittingRef evita que un guardado pendiente "resucite" el borrador
  // después de que el pedido ya se creó (causaría pedidos duplicados).
  const submittingRef = useRef(false)
  useEffect(() => {
    const meaningful = form.items.trim() || form.fullAddress.trim() || form.phone.trim()
    if (!meaningful) return
    const t = setTimeout(() => {
      if (submittingRef.current) return
      try {
        localStorage.setItem(DRAFT_KEY, JSON.stringify({
          form, fromMenu, menuTotal, sedeId: sede?.id || null, savedAt: Date.now(),
        }))
      } catch (_) {}
    }, 400)
    return () => clearTimeout(t)
  }, [form, fromMenu, menuTotal])

  useEffect(() => {
    if (errors.length > 0) {
      errorsRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' })
    }
  }, [errors])

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
    }).catch(() => {})
  }, [user?.uid])

  const set = (k, v) => setForm(f => ({ ...f, [k]: v }))

  const handleSubmit = async () => {
    const errs = []
    if (!form.name.trim())        errs.push('El nombre es obligatorio')
    if (!form.phone.trim())       errs.push('El teléfono / WhatsApp es obligatorio')
    if (form.deliveryMode === 'delivery' && !form.fullAddress.trim()) errs.push('La dirección es obligatoria')
    if (!form.items.trim())       errs.push('El pedido no puede estar vacío')
    // El método de pago ya NO se elige aquí: el cliente lo escoge después de que
    // la caja cotice el domicilio (ver flujo de cotización en ClientOrderDetail).
    if (errs.length) { setErrors(errs); return }
    setLoading(true)
    submittingRef.current = true
    try {
      const redeemRewardIds = redeemCount > 0 ? sortedRewards.slice(0, redeemCount).map(r => r.id) : []
      const items = redeemRewardIds.length > 0
        ? `${form.items}\n${redeemRewardIds.length}x ${LOYALTY_REWARD.name} — GRATIS (premio fidelización, NO cobrar)`
        : form.items
      // Si el pedido viene del menú web, traslada el precio ya calculado a la
      // cotización para que el cajero lo reciba pre-llenado (solo agrega el domicilio).
      await onSubmit({
        ...form,
        items,
        redeemRewardIds,
        ...(fromMenu ? { quotedPrice: menuTotal, fromMenu: true } : {}),
      })
    } catch (err) {
      // Falló el envío: se reactiva el autoguardado para no perder el borrador.
      submittingRef.current = false
      const msg = err?.code === 'permission-denied'
        ? 'Sin permisos para enviar el pedido. Recarga la app e intenta de nuevo.'
        : 'Error al enviar el pedido. Verifica tu conexión e intenta de nuevo.'
      setErrors([msg])
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="flex flex-col gap-4">
      {/* Info banner */}
      <div className="bg-cherry/5 border border-cherry/20 rounded-xl px-4 py-3">
        <p className="font-body text-xs text-coal/60">
          Sede: <span className="font-semibold text-cherry">{sede?.name}</span>
        </p>
      </div>

      {/* Tipo de entrega: domicilio o recoger en sede */}
      <div>
        <label className="label-field">¿Cómo quieres recibir tu pedido? *</label>
        <div className="grid grid-cols-2 gap-3">
          <button
            type="button"
            onClick={() => set('deliveryMode', 'delivery')}
            className={`flex items-center justify-center gap-2 py-3 rounded-xl border-2 text-sm font-semibold font-body transition-colors ${
              form.deliveryMode === 'delivery' ? 'border-cherry bg-cherry/10 text-cherry' : 'border-coal/20 text-coal/50'
            }`}
          >
            🛵 Domicilio
          </button>
          <button
            type="button"
            onClick={() => set('deliveryMode', 'pickup')}
            className={`flex items-center justify-center gap-2 py-3 rounded-xl border-2 text-sm font-semibold font-body transition-colors ${
              form.deliveryMode === 'pickup' ? 'border-cherry bg-cherry/10 text-cherry' : 'border-coal/20 text-coal/50'
            }`}
          >
            🏪 Recoger en sede
          </button>
        </div>
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
        <div ref={errorsRef} className="bg-pepper/10 border border-pepper/30 rounded-xl p-3 flex flex-col gap-1">
          {errors.map((e, i) => (
            <p key={i} className="flex items-center gap-2 text-sm text-pepper font-body">
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

      {form.deliveryMode === 'pickup' && (
        <div className="bg-mint/10 border border-mint/30 rounded-xl px-4 py-3 flex items-start gap-2">
          <MapPin size={16} className="text-mint flex-shrink-0 mt-0.5" />
          <p className="font-body text-xs text-coal/70 leading-relaxed">
            Recoges tu pedido en <strong>{sede?.name}</strong>{sede?.address ? ` — ${sede.address}` : ''}.
            Te avisaremos por este medio cuando esté listo para recoger.
          </p>
        </div>
      )}

      {form.deliveryMode === 'delivery' && (
      <div>
        <AddressBook
          user={user}
          sede={sede}
          currentAddress={form.fullAddress}
          onSelect={(a) => setForm(f => ({
            ...f,
            fullAddress: a.fullAddress,
            barrio:      a.barrio,
            reference:   a.reference,
            addrLat:     a.lat,
            addrLng:     a.lng,
          }))}
        />

        {/* Resumen de la dirección elegida + aviso NO restrictivo de barrio */}
        {form.fullAddress && (
          <div className="mt-2 bg-mint/10 border border-mint/30 rounded-xl px-4 py-2.5 flex items-start gap-2">
            <MapPin size={14} className="text-mint flex-shrink-0 mt-0.5" />
            <div className="min-w-0">
              <p className="font-body text-sm font-semibold text-coal">{form.fullAddress}</p>
              <p className="font-body text-[11px] text-coal/55 leading-relaxed mt-0.5">
                {form.barrio && <>📍 {form.barrio} · </>}
                {form.addrLat != null
                  ? 'Ubicada en el mapa. '
                  : ''}
                El valor del domicilio se confirma en caja antes de que pagues.
              </p>
            </div>
          </div>
        )}
      </div>
      )}

      <div>
        <label className="label-field">¿Qué vas a pedir? *</label>
        <textarea
          className={`textarea-field h-28 scroll-custom ${fromMenu ? 'bg-coal/5 text-coal/70' : ''}`}
          value={form.items}
          onChange={e => !fromMenu && set('items', e.target.value)}
          readOnly={fromMenu}
          placeholder="Ej: 1 hamburguesa clásica, 1 papas medianas, 1 gaseosa…"
        />
        {fromMenu && menuTotal > 0 && (
          <div className="mt-2 flex items-center justify-between bg-cherry/10 border border-cherry/20 rounded-xl px-4 py-2.5">
            <span className="font-body text-sm text-coal/70">Total del pedido</span>
            <span className="font-display text-lg text-cherry">
              ${menuTotal.toLocaleString('es-CO')}
            </span>
          </div>
        )}
      </div>

      {/* Canje de premios de fidelización ganados en esta sede */}
      {sortedRewards.length > 0 && (
        <div className="bg-mint/10 border border-mint/30 rounded-2xl p-4">
          <p className="font-display text-base tracking-wide text-mint flex items-center gap-2">
            🎁 Tienes {sortedRewards.length} {sortedRewards.length > 1 ? 'premios' : 'premio'} disponible{sortedRewards.length > 1 ? 's' : ''}
          </p>
          <p className="font-body text-xs text-coal/60 mt-1 leading-relaxed">
            {LOYALTY_REWARD.name} GRATIS (premio fidelización). Puedes usarlo ahora o guardarlo para otro pedido.
          </p>
          <div className="flex items-center gap-2 mt-3">
            {Array.from({ length: sortedRewards.length + 1 }, (_, n) => n).map(n => (
              <button
                key={n}
                type="button"
                onClick={() => setRedeemCount(n)}
                className={`flex-1 py-2 rounded-xl border-2 text-sm font-semibold font-body transition-colors ${
                  redeemCount === n ? 'border-mint bg-mint/20 text-mint' : 'border-coal/15 text-coal/50'
                }`}
              >
                {n === 0 ? 'Guardar' : `Usar ${n}`}
              </button>
            ))}
          </div>
        </div>
      )}

      <div>
        <label className="label-field">Indicaciones adicionales</label>
        <textarea className="textarea-field h-16 scroll-custom" value={form.notes}
          onChange={e => set('notes', e.target.value)}
          placeholder="Sin cebolla, extra salsa, timbre 2B…" />
      </div>

      {/* Aviso: el domicilio se cotiza después; el pago se elige luego */}
      <div className="bg-tangelo/10 border border-tangelo/30 rounded-2xl p-4 flex items-start gap-3">
        <span className="text-2xl leading-none">⏳</span>
        <div className="flex flex-col gap-1">
          <p className="font-display text-base tracking-wide text-tangelo">Falta cotizar tu domicilio</p>
          <p className="font-body text-xs text-coal/70 leading-relaxed">
            Al enviar tu pedido, la caja revisará si puede entregarlo y te enviará el
            <strong> valor del domicilio</strong>. El método de pago lo eliges
            <strong> después de la cotización</strong> — así evitas pagar por un pedido
            que luego no podamos entregar.
          </p>
        </div>
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
function ClientOrderCard({ order, onClick, unreadCount = 0 }) {
  const stepIdx  = STATUS_STEPS.findIndex(s => s.key === order.status)
  const step     = STATUS_STEPS[Math.max(0, stepIdx)]
  const progress = getProgress(order.status)
  const hasQuote = order.totalPrice > 0

  return (
    <button onClick={onClick} className={`order-card w-full text-left border-l-4 ${unreadCount > 0 ? 'border-tangelo' : 'border-cherry'}`}>
      <div className="flex items-start justify-between gap-2 mb-3">
        <div>
          {order.orderNumber && <p className="font-display text-xl text-cherry">#{order.orderNumber}</p>}
          <p className="font-body text-sm text-coal/60 line-clamp-1">{order.items}</p>
        </div>
        <span className="text-2xl">{step.emoji}</span>
      </div>

      {/* Quote highlight */}
      {hasQuote ? (
        <div className="mb-2 bg-tangelo/10 border border-tangelo/20 rounded-xl px-3 py-2 flex items-center justify-between">
          <span className="font-body text-xs font-semibold text-tangelo">
            {order.payment ? '💰 Total cotizado' : '💰 Elige cómo pagar'}
          </span>
          <span className="font-display text-base text-tangelo">{fmt(order.totalPrice)}</span>
        </div>
      ) : !CLOSED_STATUSES.includes(order.status) && (
        <div className="mb-2 bg-tangelo/10 border border-tangelo/20 rounded-xl px-3 py-2 flex items-center gap-1.5">
          <span className="text-sm">⏳</span>
          <span className="font-body text-xs font-semibold text-tangelo">Domicilio por cotizar — aún no pagues</span>
        </div>
      )}

      {/* Unread cashier message badge */}
      {unreadCount > 0 && (
        <div className="mb-2 flex items-center gap-1.5 bg-tangelo/10 border border-tangelo/30 rounded-xl px-3 py-2 animate-pulse">
          <MessageSquare size={13} className="text-tangelo flex-shrink-0" />
          <span className="font-body text-xs font-semibold text-tangelo">
            {unreadCount === 1 ? '1 mensaje nuevo del cajero' : `${unreadCount} mensajes nuevos del cajero`}
          </span>
          <span className="ml-auto text-[10px] font-body text-tangelo/70 font-semibold">Toca para ver →</span>
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
  const { user } = useAuth()
  const [elapsed,          setElapsed]         = useState(null)
  const [uploadProgress,   setUploadProgress]  = useState(null)
  const [uploadError,      setUploadError]     = useState('')
  const [clientMsgText,    setClientMsgText]   = useState('')
  const [sendingClientMsg, setSendingClientMsg] = useState(false)
  const [chatError,        setChatError]        = useState('')
  // Billete con el que paga el cliente (se envía a la caja)
  const [billAmount,  setBillAmount]  = useState(order.cashBillAmount ?? null)
  const [sendingBill, setSendingBill] = useState(false)
  const [billError,   setBillError]   = useState('')
  // Selección de método de pago (después de la cotización de la caja)
  const [payMethod,    setPayMethod]    = useState('')
  const [payMixtoEf,   setPayMixtoEf]   = useState('')
  const [payMixtoTr,   setPayMixtoTr]   = useState('')
  const [payError,     setPayError]     = useState('')
  const [savingPay,    setSavingPay]    = useState(false)

  const confirmPaymentMethod = async () => {
    if (!payMethod) { setPayError('Selecciona cómo vas a pagar'); return }
    if (payMethod === 'Mixto' && (!payMixtoEf || !payMixtoTr)) {
      setPayError('Indica cuánto pagarás en efectivo y cuánto en transferencia'); return
    }
    setPayError('')
    setSavingPay(true)
    try {
      await updateDoc(doc(db, 'orders', order.id), {
        payment:        payMethod,
        cashOnDelivery: payMethod === 'Efectivo' || payMethod === 'Mixto',
        ...(payMethod === 'Mixto'
          ? { mixtoEfectivo: payMixtoEf, mixtoTransferencia: payMixtoTr }
          : {}),
        updatedAt: serverTimestamp(),
      })
    } catch (err) {
      setPayError('No se pudo guardar el método de pago. Intenta de nuevo.')
    } finally { setSavingPay(false) }
  }

  // Envía a la caja el billete con el que pagará el cliente (y su cambio)
  const sendBill = async () => {
    if (billAmount === null || billAmount < order.totalPrice) {
      setBillError('Selecciona un billete que cubra el total'); return
    }
    setBillError('')
    setSendingBill(true)
    try {
      await updateDoc(doc(db, 'orders', order.id), {
        cashBillAmount: billAmount,
        cashChange:     billAmount - order.totalPrice,
        billSentAt:     serverTimestamp(),
        updatedAt:      serverTimestamp(),
      })
    } catch (err) {
      setBillError('No se pudo enviar. Revisa tu conexión e intenta de nuevo.')
    } finally { setSendingBill(false) }
  }

  const sendClientMessage = async () => {
    if (!clientMsgText.trim()) return
    setChatError('')
    setSendingClientMsg(true)
    try {
      await updateDoc(doc(db, 'orders', order.id), {
        clientMessages: arrayUnion({
          role: 'client',
          name: user?.displayName || 'Cliente',
          text: clientMsgText.trim(),
          ts:   Date.now(),
        }),
        updatedAt: serverTimestamp(),
      })
      setClientMsgText('')
    } catch (err) {
      console.error('Error al enviar mensaje:', err)
      setChatError('No se pudo enviar el mensaje. Revisa tu conexión e intenta de nuevo.')
    } finally { setSendingClientMsg(false) }
  }

  const handleUploadReceipt = (e) => {
    const file = e.target.files?.[0]
    if (!file) return
    const maxMB = 10
    if (file.size > maxMB * 1024 * 1024) { setUploadError(`El archivo no puede superar ${maxMB} MB`); return }
    setUploadError('')
    setUploadProgress(0)
    const path = `receipts/${order.id}/${Date.now()}_${file.name}`
    const sRef  = storageRef(storage, path)
    const task  = uploadBytesResumable(sRef, file)
    task.on('state_changed',
      snap => setUploadProgress(Math.round((snap.bytesTransferred / snap.totalBytes) * 100)),
      err  => { setUploadError('Error al subir: ' + err.message); setUploadProgress(null) },
      async () => {
        try {
          const url = await getDownloadURL(task.snapshot.ref)
          await updateDoc(doc(db, 'orders', order.id), {
            transferReceiptUrl:  url,
            transferReceiptName: file.name,
            updatedAt:           serverTimestamp(),
          })
          setUploadProgress(null)
        } catch (err) {
          setUploadError('Error al guardar comprobante: ' + err.message)
          setUploadProgress(null)
        }
      }
    )
  }

  useEffect(() => {
    if (!['accepted', 'in_transit'].includes(order.status)) { setElapsed(null); return }
    const ts = order.inTransitAt || order.acceptedAt
    if (!ts?.toDate) return
    const calc = () => setElapsed(Math.floor((Date.now() - ts.toDate().getTime()) / 60000))
    calc()
    const id = setInterval(calc, 30000)
    return () => clearInterval(id)
  }, [order.status, order.inTransitAt, order.acceptedAt])

  // Tiempo típico de entrega de la sede (mediana publicada por el scheduler
  // en config/eta_stats — lectura pública, best-effort).
  const [etaStats, setEtaStats] = useState(null)
  useEffect(() => {
    getDoc(doc(db, 'config', 'eta_stats'))
      .then(s => { if (s.exists()) setEtaStats(s.data()) })
      .catch(() => {})
  }, [])
  const sedeEta = (order.sedeId && etaStats?.[order.sedeId]) || null

  const stepIdx  = STATUS_STEPS.findIndex(s => s.key === order.status)
  const step     = stepIdx >= 0 ? STATUS_STEPS[stepIdx] : STATUS_STEPS[0]
  const progress = getProgress(order.status)
  const isDelivered = DELIVERED_STATUSES.includes(order.status)
  const hasQuote = order.totalPrice > 0

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
          {/* Tiempo típico de entrega (mediana histórica por sede, calculada por el scheduler) */}
          {sedeEta?.medianMin > 0 && !isDelivered && !CLOSED_STATUSES.includes(order.status) && (
            <p className="font-body text-xs text-cream/80 mt-2">
              🕒 Los pedidos de esta sede suelen llegar en <strong>~{sedeEta.medianMin} min</strong> desde que se envían
            </p>
          )}
        </div>

        <div className="p-5 flex flex-col gap-4">
          {/* Aviso grande: falta cotizar el domicilio (antes de la cotización) */}
          {!hasQuote && !CLOSED_STATUSES.includes(order.status) && (
            <div className="bg-tangelo/10 border-2 border-tangelo/40 rounded-2xl p-5 flex flex-col gap-3">
              <div className="flex items-center gap-2">
                <span className="text-3xl leading-none">⏳</span>
                <p className="font-display text-xl tracking-wide text-tangelo">Falta cotizar tu domicilio</p>
              </div>
              <p className="font-body text-sm text-coal/80 leading-relaxed">
                La caja está revisando tu pedido. Cuando confirme que puede entregarlo, te
                enviará el <strong>valor del domicilio</strong>.
              </p>
              <div className="bg-cream/60 rounded-xl px-4 py-3 flex items-center gap-2">
                <span className="text-lg">🔒</span>
                <p className="font-body text-xs text-coal/70 leading-relaxed">
                  Aún <strong>no puedes pagar</strong>: el método de pago se habilita cuando
                  recibas la cotización. Así evitas pagar por un pedido que luego no podamos entregar.
                </p>
              </div>
              {/* Resumen parcial: productos estimado + domicilio por cotizar */}
              {order.quotedPrice > 0 && (
                <div className="border-t border-tangelo/20 pt-3 flex flex-col gap-1.5">
                  <div className="flex justify-between font-body text-sm">
                    <span className="text-coal/60">Productos (estimado):</span>
                    <span className="font-semibold">{fmt(order.quotedPrice)}</span>
                  </div>
                  <div className="flex justify-between font-body text-sm">
                    <span className="text-coal/60">Domicilio:</span>
                    <span className="font-semibold text-tangelo">Por cotizar</span>
                  </div>
                </div>
              )}
            </div>
          )}

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
                <span className="font-semibold">{order.payment || 'Por elegir 👇'}</span>
              </div>
            </div>
          )}

          {/* Selector de método de pago — aparece tras la cotización de la caja */}
          {hasQuote && !order.payment && !isDelivered && !CLOSED_STATUSES.includes(order.status) && (
            <div className="bg-cherry/5 border-2 border-cherry/30 rounded-2xl p-4 flex flex-col gap-3">
              <p className="font-display text-base tracking-wide text-cherry">✅ ¡Domicilio cotizado! Elige cómo pagar</p>
              <p className="font-body text-xs text-coal/60">
                Total a pagar: <span className="font-bold text-tangelo">{fmt(order.totalPrice)}</span>
              </p>
              <select className={`input-field ${!payMethod ? 'text-coal/40' : ''}`}
                value={payMethod} onChange={e => setPayMethod(e.target.value)}>
                <option value="" disabled>— Selecciona cómo vas a pagar —</option>
                <option>Efectivo</option>
                <option>Transferencia</option>
                <option>Nequi</option>
                <option value="Mixto">Mixto (Efectivo + Transferencia)</option>
              </select>

              {payMethod === 'Mixto' && (
                <div className="bg-smoked/50 rounded-2xl p-4 flex flex-col gap-3">
                  <p className="font-body text-xs text-coal/70 font-semibold">
                    ¿Cuánto pagarás en cada forma? (el cajero confirma el total exacto)
                  </p>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="label-field">💵 En efectivo</label>
                      <input className="input-field" type="number" min="0"
                        value={payMixtoEf} onChange={e => setPayMixtoEf(e.target.value)} placeholder="$0" />
                    </div>
                    <div>
                      <label className="label-field">📲 En transferencia</label>
                      <input className="input-field" type="number" min="0"
                        value={payMixtoTr} onChange={e => setPayMixtoTr(e.target.value)} placeholder="$0" />
                    </div>
                  </div>
                </div>
              )}

              {payError && <p className="font-body text-xs text-pepper">{payError}</p>}
              <button onClick={confirmPaymentMethod} disabled={savingPay} className="btn-primary w-full">
                {savingPay ? 'Guardando…' : 'Confirmar método de pago'}
              </button>
            </div>
          )}

          {/* Calculadora de cambio — solo para efectivo con cotización */}
          {hasQuote && order.payment === 'Efectivo' && !isDelivered && (
            <div className="bg-mustard/10 border border-mustard/30 rounded-2xl p-4 flex flex-col gap-3">
              <p className="font-display text-base tracking-wide text-coal">💵 ¿Con qué billete vas a pagar?</p>
              <p className="font-body text-xs text-coal/60">
                Total a pagar: <span className="font-bold text-tangelo">{fmt(order.totalPrice)}</span>
              </p>

              {/* Billetes comunes */}
              <div className="flex flex-wrap gap-2">
                {[10000, 20000, 50000, 100000, 200000].filter(b => b >= order.totalPrice).map(b => (
                  <button key={b} onClick={() => setBillAmount(b)}
                    className={`px-3 py-1.5 rounded-xl border font-body text-sm font-semibold transition-colors ${
                      billAmount === b
                        ? 'bg-mustard text-cream border-mustard'
                        : 'bg-cream border-mustard/40 text-coal hover:bg-mustard/20'
                    }`}>
                    {fmt(b)}
                  </button>
                ))}
                <button onClick={() => setBillAmount(order.totalPrice)}
                  className={`px-3 py-1.5 rounded-xl border font-body text-sm font-semibold transition-colors ${
                    billAmount === order.totalPrice
                      ? 'bg-mint text-cream border-mint'
                      : 'bg-cream border-mint/40 text-coal hover:bg-mint/20'
                  }`}>
                  Exacto
                </button>
              </div>

              {/* Campo personalizado */}
              <div>
                <label className="label-field">O ingresa el valor de tu billete</label>
                <input
                  type="number"
                  className="input-field"
                  placeholder="Ej: 50000"
                  value={billAmount ?? ''}
                  onChange={e => {
                    const v = parseFloat(e.target.value)
                    setBillAmount(isNaN(v) ? null : v)
                  }}
                />
              </div>

              {/* Resultado */}
              {billAmount !== null && (
                billAmount < order.totalPrice ? (
                  <div className="bg-pepper/10 border border-pepper/30 rounded-xl px-4 py-3 flex items-center gap-2">
                    <span className="text-lg">⚠️</span>
                    <p className="font-body text-sm text-pepper font-semibold">
                      Ese valor no cubre el total ({fmt(order.totalPrice - billAmount)} de diferencia)
                    </p>
                  </div>
                ) : billAmount === order.totalPrice ? (
                  <div className="bg-mint/10 border border-mint/30 rounded-xl px-4 py-3 flex items-center gap-2">
                    <span className="text-lg">✅</span>
                    <p className="font-body text-sm text-mint font-semibold">Pagas exacto — no necesitas cambio</p>
                  </div>
                ) : (
                  <div className="bg-tangelo/10 border border-tangelo/30 rounded-xl px-4 py-3 flex flex-col gap-1">
                    <div className="flex items-center justify-between">
                      <p className="font-body text-sm text-coal font-semibold">Tu cambio será:</p>
                      <p className="font-display text-2xl text-tangelo">{fmt(billAmount - order.totalPrice)}</p>
                    </div>
                    <p className="font-body text-xs text-coal/50">El domiciliario te traerá ese cambio</p>
                  </div>
                )
              )}

              {/* Enviar el billete a la caja */}
              {billAmount !== null && billAmount >= order.totalPrice && (
                order.cashBillAmount === billAmount ? (
                  <div className="bg-mint/10 border border-mint/30 rounded-xl px-4 py-3 flex items-center gap-2">
                    <span className="text-lg">✅</span>
                    <p className="font-body text-sm text-mint font-semibold">
                      Enviado al cajero — tu pedido está en gestión. Sigue su avance aquí abajo.
                    </p>
                  </div>
                ) : (
                  <div className="flex flex-col gap-1.5">
                    <button onClick={sendBill} disabled={sendingBill} className="btn-primary w-full">
                      {sendingBill ? 'Enviando…' :
                        (order.cashBillAmount != null ? 'Actualizar billete y reenviar' : '📨 Enviar al cajero')}
                    </button>
                    {billError && <p className="font-body text-xs text-pepper">{billError}</p>}
                    <p className="font-body text-[11px] text-coal/50 text-center">
                      Avísale a la caja con qué billete pagarás para que preparen tu cambio.
                    </p>
                  </div>
                )
              )}
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

          {/* Transfer / Nequi receipt upload */}
          {['Transferencia', 'Nequi', 'Mixto'].includes(order.payment) &&
           !['completed', 'rejected', 'cancelled'].includes(order.status) && (
            <div className={`rounded-2xl p-4 flex flex-col gap-3 border ${order.transferValidated ? 'bg-mint/5 border-mint/30' : 'bg-tangelo/5 border-tangelo/20'}`}>
              <p className="font-display text-sm tracking-wide text-coal">
                {order.payment === 'Mixto' ? '📎 Comprobante de tu parte por transferencia' : `📎 Comprobante de ${order.payment}`}
              </p>

              {/* Desglose del pago mixto: efectivo + transferencia */}
              {order.payment === 'Mixto' && (
                <div className="bg-mustard/10 border border-mustard/30 rounded-xl p-3 flex flex-col gap-1.5">
                  <p className="font-body text-xs text-coal/70 font-semibold">Tu pago se divide así:</p>
                  <div className="flex justify-between font-body text-sm">
                    <span className="text-coal/60">💵 En efectivo (al recibir):</span>
                    <span className="font-semibold">{fmt(Number(order.mixtoEfectivo) || 0)}</span>
                  </div>
                  <div className="flex justify-between font-body text-sm">
                    <span className="text-coal/60">📲 Por transferencia / QR:</span>
                    <span className="font-semibold text-tangelo">{fmt(Number(order.mixtoTransferencia) || 0)}</span>
                  </div>
                  <p className="font-body text-[11px] text-coal/50">
                    Transfiere la parte digital con el QR de abajo y sube el comprobante. El resto lo pagas en efectivo al domiciliario.
                  </p>
                </div>
              )}

              {/* QR + cuenta/llave para transferir */}
              {!order.transferValidated && (
                <div className="flex flex-col items-center gap-2 bg-white rounded-2xl p-4 border border-coal/10">
                  <p className="font-body text-xs text-coal/60 text-center font-semibold">
                    Escanea el QR o transfiere a la cuenta
                  </p>
                  <img
                    src={import.meta.env.BASE_URL + 'qr-bancolombia.jpeg'}
                    alt="QR Bancolombia DELISTARS"
                    className="w-52 h-52 object-contain"
                  />
                  {/* Cuenta / llave para transferir (por si no puede escanear el QR) */}
                  <div className="w-full bg-smoked/50 rounded-xl px-3 py-2 flex flex-col items-center gap-0.5">
                    <p className="font-body text-[11px] text-coal/50 uppercase tracking-wider">Cuenta / llave para transferir</p>
                    <p className="font-body text-xs text-coal/70 font-semibold">Bancolombia Ahorros</p>
                    <p className="font-body text-lg font-bold text-coal tracking-widest text-center select-all">
                      420 679 938 91
                    </p>
                    <p className="font-body text-[11px] text-coal/50">DELISTARS</p>
                  </div>
                </div>
              )}

              {order.transferValidated ? (
                <div className="flex items-center gap-2 text-mint">
                  <span className="text-lg">✅</span>
                  <p className="font-body text-sm font-semibold">Pago validado por el cajero</p>
                </div>
              ) : order.transferReceiptUrl ? (
                <div className="flex flex-col gap-2">
                  <div className="flex items-center gap-2 text-tangelo">
                    <span>📄</span>
                    <p className="font-body text-xs font-semibold">Comprobante enviado — esperando validación</p>
                  </div>
                  <a href={order.transferReceiptUrl} target="_blank" rel="noreferrer"
                    className="font-body text-xs text-cherry underline underline-offset-2 truncate">
                    {order.transferReceiptName || 'Ver archivo'}
                  </a>
                  <label className="cursor-pointer text-xs font-body text-coal/50 underline underline-offset-2 w-fit">
                    Cambiar archivo
                    <input type="file" accept="image/*,.pdf" className="hidden" onChange={handleUploadReceipt} />
                  </label>
                </div>
              ) : (
                <div className="flex flex-col gap-2">
                  <p className="font-body text-xs text-coal/60">
                    Sube la foto o PDF de tu comprobante para que el cajero confirme el pago.
                  </p>
                  <label className={`flex items-center justify-center gap-2 w-full py-3 rounded-xl border-2 border-dashed cursor-pointer transition-colors
                    ${uploadProgress !== null ? 'border-tangelo/40 bg-tangelo/5' : 'border-coal/20 hover:border-tangelo/50 hover:bg-tangelo/5'}`}>
                    <input type="file" accept="image/*,.pdf" className="hidden" onChange={handleUploadReceipt} />
                    {uploadProgress !== null ? (
                      <span className="font-body text-sm text-tangelo">Subiendo {uploadProgress}%…</span>
                    ) : (
                      <span className="font-body text-sm text-coal/60">📤 Subir comprobante (imagen o PDF)</span>
                    )}
                  </label>
                  {uploadError && <p className="font-body text-xs text-pepper">{uploadError}</p>}
                </div>
              )}
            </div>
          )}

          {/* Timeline */}
          <div className="flex flex-col gap-2">
            {STATUS_STEPS.filter((s, i, arr) => {
              // En recoger en sede no hay domiciliario: ocultamos esos pasos
              if (order.deliveryMode === 'pickup' && ['assigned','accepted','in_transit','arrived'].includes(s.key)) return false
              const deliveredKeys = ['delivered_paid','pending_cuadre','completed']
              if (deliveredKeys.includes(s.key)) return i === arr.findIndex(x => deliveredKeys.includes(x.key))
              return true
            }).map((s, i) => {
              const currentIdx = STATUS_STEPS.findIndex(x => x.key === order.status)
              const done = CLOSED_STATUSES.includes(order.status)
                ? s.key === order.status
                : currentIdx >= 0 && currentIdx >= STATUS_STEPS.findIndex(x => x.key === s.key)
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

          {/* ETA / driver status */}
          {['accepted', 'preparing', 'in_transit', 'arrived'].includes(order.status) && (
            <div className="bg-cherry/5 border border-cherry/20 rounded-2xl p-4 flex flex-col gap-2">
              <p className="font-display text-base tracking-wide">
                {order.status === 'accepted'   ? '✅ Domiciliario aceptó el pedido' :
                 order.status === 'preparing'  ? '🍳 Tu pedido está siendo preparado' :
                 order.status === 'in_transit' ? '🛵 Tu pedido está en camino' :
                                                 '📍 Domiciliario llegó'}
              </p>
              {order.driverName && (
                <p className="font-body text-sm text-coal/70">
                  Domiciliario: <span className="font-semibold text-coal">{order.driverName}</span>
                </p>
              )}
              {order.driverPhone && (() => {
                const digits  = order.driverPhone.replace(/\D/g, '')
                const waPhone = digits.length >= 10 ? `57${digits.slice(-10)}` : digits
                return (
                  <div className="flex gap-2 mt-1">
                    <a href={`tel:${order.driverPhone}`}
                      className="flex-1 flex items-center justify-center gap-1.5 py-2 rounded-xl bg-cherry/10 border border-cherry/20 text-cherry font-body text-sm font-semibold hover:bg-cherry/20 transition-colors">
                      📞 Llamar
                    </a>
                    <a href={`https://wa.me/${waPhone}`} target="_blank" rel="noreferrer"
                      className="flex-1 flex items-center justify-center gap-1.5 py-2 rounded-xl bg-[#25D366]/10 border border-[#25D366]/30 text-[#25D366] font-body text-sm font-semibold hover:bg-[#25D366]/20 transition-colors">
                      📱 WhatsApp
                    </a>
                  </div>
                )
              })()}
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

          {order.status === 'cancelled' && (
            <div className="bg-coal/5 border border-coal/20 rounded-2xl p-4 text-center">
              <p className="text-3xl mb-2">🚫</p>
              <p className="font-display text-lg tracking-wide text-coal/70">Pedido cancelado</p>
              <p className="font-body text-xs text-coal/50 mt-3">
                Puedes hacer un nuevo pedido o escribirnos por WhatsApp.
              </p>
            </div>
          )}

          {/* Chat con el cajero */}
          {!['rejected','cancelled'].includes(order.status) && (
            <div className="card border-2 border-cherry/30 flex flex-col gap-3">
              <div className="flex items-center gap-2">
                <MessageSquare size={16} className="text-cherry" />
                <p className="font-display text-base tracking-wide text-coal">Chat con el cajero</p>
                {(order.clientMessages || []).filter(m => m.role === 'cashier').length > 0 && (
                  <span className="ml-auto inline-flex items-center gap-1 bg-cherry/10 text-cherry rounded-full px-2 py-0.5 text-[10px] font-body font-bold uppercase tracking-wider">
                    {(order.clientMessages || []).filter(m => m.role === 'cashier').length} del cajero
                  </span>
                )}
              </div>

              {(order.clientMessages?.length > 0) ? (
                <div className="flex flex-col gap-2">
                  {[...order.clientMessages].sort((a,b) => a.ts - b.ts).map((m, i) => (
                    <div key={i} className={`rounded-xl px-3 py-2 ${m.role === 'cashier' ? 'bg-tangelo/10 border border-tangelo/20 mr-4' : 'bg-cherry/5 border border-cherry/20 ml-4'}`}>
                      <p className={`font-body text-[10px] font-bold uppercase tracking-wider mb-0.5 ${m.role === 'cashier' ? 'text-tangelo' : 'text-cherry'}`}>
                        {m.role === 'cashier' ? '🧾 Cajero' : '🛍️ Tú'}
                      </p>
                      <p className="font-body text-sm text-coal">{m.text}</p>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="font-body text-xs text-coal/40">Puedes escribirle al cajero aquí si tienes alguna duda</p>
              )}

              {!isDelivered && (
                <div className="flex flex-col gap-1">
                  <div className="flex gap-2">
                    <textarea
                      className="textarea-field flex-1 h-14 scroll-custom text-sm"
                      placeholder="Escríbele al cajero…"
                      value={clientMsgText}
                      onChange={e => setClientMsgText(e.target.value)}
                    />
                    <button onClick={sendClientMessage} disabled={sendingClientMsg || !clientMsgText.trim()}
                      className="btn-primary px-3 self-end">
                      <Send size={16} />
                    </button>
                  </div>
                  {chatError && <p className="font-body text-xs text-pepper">{chatError}</p>}
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

// ─── Client history modal ─────────────────────────────────────────────────────
function ClientHistoryModal({ orders, onClose, onSelect }) {
  const [search,     setSearch]     = useState('')
  const [filterDate, setFilterDate] = useState('')

  const historical = orders
    .filter(o => [...DELIVERED_STATUSES, ...CLOSED_STATUSES].includes(o.status))
    .sort((a, b) => (b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0))

  const filtered = historical.filter(o => {
    const dateOk = !filterDate ||
      (o.createdAt?.toDate && format(o.createdAt.toDate(), 'yyyy-MM-dd') === filterDate)
    const q = search.trim().toLowerCase()
    const textOk = !q ||
      o.items?.toLowerCase().includes(q) ||
      o.fullAddress?.toLowerCase().includes(q) ||
      String(o.orderNumber || '').includes(q)
    return dateOk && textOk
  })

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
            <p className="font-body text-xs text-cream/70">{filtered.length} de {historical.length} pedido{historical.length !== 1 ? 's' : ''}</p>
          </div>
          <button onClick={onClose} className="text-cream/70 hover:text-cream"><X size={22} /></button>
        </div>

        {/* Búsqueda y filtro */}
        <div className="px-4 pt-3 pb-2 flex flex-col gap-2 border-b border-coal/10 flex-shrink-0">
          <div className="relative">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-coal/40" />
            <input
              type="text"
              className="input-field pl-8 py-2 text-sm"
              placeholder="Buscar por producto, dirección o #pedido…"
              value={search}
              onChange={e => setSearch(e.target.value)}
            />
            {search && (
              <button onClick={() => setSearch('')} className="absolute right-3 top-1/2 -translate-y-1/2 text-coal/30 hover:text-coal/60">
                <X size={14} />
              </button>
            )}
          </div>
          <div className="flex items-center gap-2">
            <input
              type="date"
              className="input-field py-1.5 text-sm flex-1"
              value={filterDate}
              onChange={e => setFilterDate(e.target.value)}
              max={format(new Date(), 'yyyy-MM-dd')}
            />
            {filterDate && (
              <button onClick={() => setFilterDate('')}
                className="text-xs font-body text-cherry underline whitespace-nowrap">
                Limpiar
              </button>
            )}
          </div>
        </div>

        <div className="overflow-y-auto scroll-custom p-4 flex flex-col gap-2 pb-8">
          {filtered.length === 0 ? (
            <div className="flex flex-col items-center gap-3 py-12 text-center">
              <p className="text-4xl">🔍</p>
              <p className="font-body text-coal/40">
                {historical.length === 0 ? 'Aún no tienes pedidos anteriores' : 'Sin resultados para esa búsqueda'}
              </p>
              {(search || filterDate) && (
                <button onClick={() => { setSearch(''); setFilterDate('') }}
                  className="text-xs font-body text-cherry underline">
                  Limpiar filtros
                </button>
              )}
            </div>
          ) : (
            filtered.map(o => {
              const isDelivered = DELIVERED_STATUSES.includes(o.status)
              return (
                <button key={o.id} onClick={() => onSelect(o)}
                  className="card w-full text-left flex items-center gap-3 hover:bg-smoked/50 transition-colors">
                  <span className="text-2xl flex-shrink-0">{isDelivered ? '✅' : '❌'}</span>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      {o.orderNumber && <span className="font-display text-base text-cherry">#{o.orderNumber}</span>}
                      <span className="font-body text-xs text-coal/40">{fmtDate(o.createdAt)}</span>
                      {o.rating > 0 && <span className="text-xs">{'⭐'.repeat(o.rating)}</span>}
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

// ─── Celebración de premio de fidelización ────────────────────────────────────
function LoyaltyCelebrationModal({ rewards, onClose }) {
  const count = rewards.length
  const resetting = rewards.some(r => r.cycleReset)
  // Nombres de las sedes donde se ganó cada premio (puede haber de más de una).
  const sedeNames = [...new Set(rewards.map(r => SEDES[r.sedeId]?.name).filter(Boolean))]
  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-coal/60 backdrop-blur-sm px-4">
      <div className="bg-cream rounded-3xl max-w-sm w-full p-6 text-center shadow-2xl animate-fade-in">
        <p className="text-5xl mb-2">🎉</p>
        <p className="font-display text-2xl text-cherry tracking-wide leading-tight">
          ¡Ganaste {count > 1 ? `${count} Hamburguesas Especiales` : 'una Hamburguesa Especial'} gratis!
        </p>
        <p className="font-body text-sm text-coal/70 mt-2 leading-relaxed">
          Por tus domicilios entregados en <strong>{sedeNames.join(' y ') || 'tu sede'}</strong>. La puedes usar ahora
          o guardarla para tu próximo pedido — tú decides cuándo.
        </p>
        {resetting && (
          <p className="font-body text-xs text-tangelo mt-3 bg-tangelo/10 border border-tangelo/30 rounded-xl px-3 py-2">
            Tu progreso de fidelización vuelve a empezar desde 0 — ¡sigue pidiendo para ganar más premios!
          </p>
        )}
        <button onClick={onClose} className="btn-primary w-full mt-5">¡Genial!</button>
      </div>
    </div>
  )
}

// ─── Client help modal ────────────────────────────────────────────────────────
// ─── Rating modal ────────────────────────────────────────────────────────────
function RatingModal({ order, onClose }) {
  const [stars,   setStars]   = useState(0)
  const [hover,   setHover]   = useState(0)
  const [comment, setComment] = useState('')
  const [saving,  setSaving]  = useState(false)

  const submit = async () => {
    if (!stars) return
    setSaving(true)
    try {
      await updateDoc(doc(db, 'orders', order.id), {
        rating:        stars,
        ratingComment: comment.trim() || null,
        ratedAt:       serverTimestamp(),
      })
    } catch (_) {}
    onClose()
  }

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-coal/60 backdrop-blur-sm animate-fade-in px-4">
      <div className="bg-cream w-full max-w-sm rounded-3xl shadow-2xl p-6 flex flex-col gap-4 animate-scale-in">
        <div className="text-center">
          <p className="text-4xl mb-2">🎉</p>
          <p className="font-display text-2xl text-coal tracking-wide">¡Pedido entregado!</p>
          {order.orderNumber && (
            <p className="font-body text-sm text-coal/50 mt-1">Pedido #{order.orderNumber}</p>
          )}
        </div>

        <div>
          <p className="font-body text-sm text-coal/70 text-center mb-3">
            ¿Cómo fue tu experiencia?
          </p>
          <div className="flex justify-center gap-2">
            {[1, 2, 3, 4, 5].map(n => (
              <button
                key={n}
                onClick={() => setStars(n)}
                onMouseEnter={() => setHover(n)}
                onMouseLeave={() => setHover(0)}
                className="text-4xl transition-transform hover:scale-110 active:scale-95"
              >
                {n <= (hover || stars) ? '⭐' : '☆'}
              </button>
            ))}
          </div>
          {stars > 0 && (
            <p className="text-center font-body text-xs text-coal/50 mt-1">
              {['', 'Muy malo', 'Malo', 'Regular', 'Bueno', '¡Excelente!'][stars]}
            </p>
          )}
        </div>

        <textarea
          className="textarea-field h-20 scroll-custom text-sm"
          placeholder="Comentario opcional (entrega rápida, buen trato…)"
          value={comment}
          onChange={e => setComment(e.target.value)}
        />

        <div className="flex gap-3">
          <button onClick={onClose}
            className="flex-1 py-2.5 rounded-xl border border-coal/20 font-body text-sm text-coal/50 hover:bg-smoked transition-colors">
            Omitir
          </button>
          <button
            onClick={submit}
            disabled={!stars || saving}
            className="flex-1 btn-primary py-2.5"
          >
            {saving ? 'Guardando…' : 'Enviar calificación'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ─── Client help sections ─────────────────────────────────────────────────────
const CLIENT_HELP_SECTIONS = [
  {
    id: 'pedido', emoji: '🍔', title: '¿Cómo hago un pedido?', color: 'text-cherry',
    content: [
      { type: 'steps', items: [
        'Toca el botón rojo "Hacer pedido" en la parte inferior de la pantalla.',
        'Llena tus datos: nombre, teléfono / WhatsApp y dirección de entrega. Si ya pediste antes, tus datos y dirección aparecen automáticamente.',
        'Escribe lo que quieres pedir en el campo "¿Qué vas a pedir?" con todos los detalles.',
        'Agrega indicaciones adicionales si las tienes (sin cebolla, timbre 2B, etc.).',
        'Selecciona cómo vas a pagar: Efectivo, Transferencia o Nequi.',
        'Si pagas por Transferencia o Nequi, escanea el código QR que aparece en pantalla para hacer el pago.',
        'Toca "🚀 Enviar pedido" y espera la cotización del cajero.',
      ]},
    ],
  },
  {
    id: 'cotizacion', emoji: '💰', title: '¿Qué es la cotización?', color: 'text-tangelo',
    content: [
      { type: 'p', text: 'Después de enviar tu pedido, un cajero revisa la disponibilidad y te envía el precio del pedido más el valor del domicilio. Verás el total directamente en tu pedido activo.' },
      { type: 'tip', text: 'No pagues hasta recibir la cotización. El cajero puede dejarte una nota con información adicional (disponibilidad, tiempo estimado, datos de pago, etc.).' },
    ],
  },
  {
    id: 'seguimiento', emoji: '📍', title: '¿Cómo sigo mi pedido?', color: 'text-mint',
    content: [
      { type: 'p', text: 'Toca tu pedido activo para ver el estado en tiempo real:' },
      { type: 'table', rows: [
        ['📋 Pedido enviado',        'Esperando cotización del cajero'],
        ['💰 Cotización recibida',   'Revisa el precio en el detalle del pedido'],
        ['🛵 Domiciliario asignado', 'Ya tienen un repartidor para ti'],
        ['✅ Domiciliario aceptó',   'El repartidor confirmó que va'],
        ['🏃 En camino',             'El repartidor está en ruta — puedes ver su ubicación'],
        ['📍 Llegó al destino',      'El domiciliario ya está en tu puerta'],
        ['🎉 ¡Entregado!',           'Pedido completado, ¡buen provecho!'],
      ]},
      { type: 'tip', text: 'Cuando el domiciliario está "En camino", aparece un botón para ver su ubicación en Google Maps en tiempo real.' },
    ],
  },
  {
    id: 'pago', emoji: '💳', title: 'Formas de pago', color: 'text-coal',
    content: [
      { type: 'table', rows: [
        ['💵 Efectivo',      'Pagas directamente al domiciliario cuando llega a tu puerta'],
        ['🏦 Transferencia', 'Transferencia bancaria a la cuenta de DeliStars antes de la entrega'],
        ['📱 Nequi',         'Pago por Nequi a la cuenta de DeliStars antes de la entrega'],
      ]},
      { type: 'tip', text: 'Para Transferencia y Nequi: al seleccionar ese método de pago en el formulario, aparece un código QR de Bancolombia (DELISTARS · Ahorros *3891) para escanear y pagar de inmediato.' },
    ],
  },
  {
    id: 'comprobante', emoji: '📎', title: 'Subir comprobante de pago', color: 'text-tangelo',
    content: [
      { type: 'p', text: 'Si pagas por Transferencia o Nequi, debes subir el comprobante para que el cajero confirme el pago:' },
      { type: 'steps', items: [
        'Abre el detalle de tu pedido activo.',
        'En la sección "Comprobante de Transferencia / Nequi", toca "Subir comprobante".',
        'Selecciona la foto o PDF del comprobante desde tu celular.',
        'Espera a que el cajero valide el pago — verás "✅ Pago validado" cuando esté confirmado.',
      ]},
      { type: 'tip', text: 'Puedes subir la foto del comprobante incluso antes de recibir la cotización para agilizar el proceso.' },
    ],
  },
  {
    id: 'cancelar', emoji: '❌', title: '¿Puedo cancelar un pedido?', color: 'text-coal',
    content: [
      { type: 'p', text: 'Para cancelar un pedido escríbenos por WhatsApp y con gusto te ayudamos.' },
      { type: 'tip', text: 'Encuentra el número de WhatsApp de tu sede en la pantalla principal.' },
    ],
  },
  {
    id: 'sede', emoji: '🏠', title: 'Sedes y zonas de cobertura', color: 'text-coal',
    content: [
      { type: 'p', text: 'Selecciona la sede más cercana a tu dirección de entrega. Puedes cambiarla tocando el ícono de ubicación 📍 en la parte superior o el botón "Cambiar" en la tarjeta de sede.' },
      { type: 'table', rows: [
        ['Santa Lucía',    'Cra. 87 #48e-3, Santa Rosa De Lima'],
        ['Santa Teresita', 'Cl 35B #87A-165, La América'],
      ]},
    ],
  },
  {
    id: 'horario', emoji: '🕕', title: 'Horario de atención', color: 'text-mustard',
    content: [
      { type: 'p', text: 'El servicio de domicilios está disponible normalmente de 5:30 PM a 11:30 PM. Si la plataforma aparece como "cerrada", intenta más tarde o escríbenos por WhatsApp.' },
      { type: 'tip', text: 'Cada sede tiene su propio número de WhatsApp. Lo encuentras en la tarjeta de sede del panel principal.' },
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
