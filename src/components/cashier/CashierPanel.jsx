import { useState, useEffect, useRef, useCallback } from 'react'
import {
  collection, addDoc, onSnapshot, query, where,
  serverTimestamp, doc, setDoc, getDocs, getDoc
} from 'firebase/firestore'
import { db } from '../../services/firebase'
import { useAuth } from '../../contexts/AuthContext'
import { DEFAULT_DRIVERS, DEFAULT_DRIVER_NAMES } from '../../services/roles'
import Logo from '../common/Logo'
import OrderCard from './OrderCard'
import OrderForm from './OrderForm'
import OrderDetail from './OrderDetail'
import { format } from 'date-fns'
import { es } from 'date-fns/locale'
import { Plus, LogOut, Users, MapPin, Power, BellRing, HelpCircle, ChevronDown, ChevronUp, BookOpen, X } from 'lucide-react'

const TABS = [
  { id: 'active',    label: 'Activos' },
  { id: 'cuadre',   label: 'Cuadre' },
  { id: 'completed', label: 'Entregados' },
]

const ACTIVE_STATUSES   = ['pending','assigned','accepted','in_transit','arrived','delivered_paid','delivered_cash']
const CUADRE_STATUSES   = ['pending_cuadre']
const COMPLETE_STATUSES = ['completed', 'rejected']

// ─── Audio alarm ─────────────────────────────────────────────────────────────
function createAlarmPlayer() {
  let ctx = null
  let intervalId = null

  const getCtx = () => {
    if (!ctx) ctx = new (window.AudioContext || window.webkitAudioContext)()
    if (ctx.state === 'suspended') ctx.resume()
    return ctx
  }

  const playPattern = () => {
    const c = getCtx()
    const now = c.currentTime
    const seq = [880, 1100, 880, 1100, 1320, 1100, 880]
    seq.forEach((freq, i) => {
      const osc  = c.createOscillator()
      const gain = c.createGain()
      osc.connect(gain)
      gain.connect(c.destination)
      osc.type = 'square'
      osc.frequency.value = freq
      const t = now + i * 0.16
      gain.gain.setValueAtTime(0.6, t)
      gain.gain.exponentialRampToValueAtTime(0.001, t + 0.14)
      osc.start(t)
      osc.stop(t + 0.15)
    })
  }

  return {
    play() {
      playPattern()
      intervalId = setInterval(playPattern, 2000)
    },
    stop() {
      clearInterval(intervalId)
      intervalId = null
    },
  }
}

const alarm = createAlarmPlayer()

export default function CashierPanel() {
  const { user, sede, logout, selectSede } = useAuth()
  const [tab,          setTab]         = useState('active')
  const [orders,       setOrders]      = useState([])
  const [drivers,      setDrivers]     = useState([])
  const [showForm,     setShowForm]    = useState(false)
  const [selected,     setSelected]    = useState(null)
  const [addDriver,    setAddDriver]   = useState(false)
  const [newDriverEmail, setNewDriverEmail] = useState('')
  const [newDriverName,  setNewDriverName]  = useState('')
  const [driverMsg,    setDriverMsg]   = useState('')
  const [platformActive, setPlatformActive] = useState(null)
  const [newOrderAlert, setNewOrderAlert]   = useState(null)
  const [alarmActive,   setAlarmActive]     = useState(false)
  const [showManual,    setShowManual]      = useState(false)

  const prevPendingIdsRef = useRef(null) // null = first load not done yet
  const today = format(new Date(), "EEEE dd 'de' MMMM yyyy", { locale: es })

  // ── Platform toggle listener ──────────────────────────────────────────────
  useEffect(() => {
    return onSnapshot(doc(db, 'config', 'client_platform'), snap => {
      setPlatformActive(snap.exists() ? snap.data().active : false)
    })
  }, [])

  const togglePlatform = async () => {
    const newState = !platformActive
    await setDoc(doc(db, 'config', 'client_platform'), {
      active:    newState,
      updatedBy: user.email,
      updatedAt: serverTimestamp(),
    })
  }

  // ── Dismiss notification ──────────────────────────────────────────────────
  const dismissAlert = useCallback(() => {
    alarm.stop()
    setAlarmActive(false)
    setNewOrderAlert(null)
  }, [])

  // ── Orders listener ───────────────────────────────────────────────────────
  useEffect(() => {
    if (!sede) return
    const q = query(collection(db, 'orders'), where('sedeId', '==', sede.id))
    return onSnapshot(q, snap => {
      const docs = snap.docs.map(d => ({ id: d.id, ...d.data() }))
      docs.sort((a, b) => (b.createdAt?.seconds ?? 0) - (a.createdAt?.seconds ?? 0))

      // New-pending-order detection
      const pendingDocs = docs.filter(o => o.status === 'pending')
      if (prevPendingIdsRef.current === null) {
        // First snapshot — record existing, don't alert
        prevPendingIdsRef.current = new Set(pendingDocs.map(o => o.id))
      } else {
        pendingDocs.forEach(o => {
          if (!prevPendingIdsRef.current.has(o.id)) {
            prevPendingIdsRef.current.add(o.id)
            alarm.play()
            setAlarmActive(true)
            setNewOrderAlert(o)
          }
        })
      }

      setOrders(docs)
    })
  }, [sede])

  // ── Cleanup alarm on unmount ──────────────────────────────────────────────
  useEffect(() => () => alarm.stop(), [])

  // ── Load drivers ──────────────────────────────────────────────────────────
  useEffect(() => {
    const loadDrivers = async () => {
      const snap = await getDocs(collection(db, 'roles_drivers'))
      const firestoreDrivers = snap.docs.map(d => ({ id: d.id, ...d.data() }))
      const firestoreIds = firestoreDrivers.map(d => d.id)
      const defaultDriverObjs = DEFAULT_DRIVERS
        .filter(email => !firestoreIds.includes(email))
        .map(email => ({ id: email, name: DEFAULT_DRIVER_NAMES[email] || email }))
      setDrivers([...defaultDriverObjs, ...firestoreDrivers])
    }
    loadDrivers()
  }, [])

  const filteredOrders = orders.filter(o => {
    if (tab === 'active')    return ACTIVE_STATUSES.includes(o.status)
    if (tab === 'cuadre')    return CUADRE_STATUSES.includes(o.status)
    if (tab === 'completed') return COMPLETE_STATUSES.includes(o.status)
    return false
  })

  const cuadreCount = orders.filter(o => CUADRE_STATUSES.includes(o.status)).length
  const pendingCount = orders.filter(o => o.status === 'pending').length

  const handleCreateOrder = async (data) => {
    const driver = drivers.find(d => d.id === data.driverId)
    await addDoc(collection(db, 'orders'), {
      ...data,
      sedeId:      sede.id,
      sedeName:    sede.name,
      status:      'assigned',
      cashierId:   user.uid,
      cashierName: user.displayName,
      driverEmail: driver?.id || '',
      driverName:  driver?.name || driver?.id || '',
      createdAt:   serverTimestamp(),
      updatedAt:   serverTimestamp(),
    })
    setShowForm(false)
  }

  const handleAddDriver = async () => {
    if (!newDriverEmail.trim()) return
    const email = newDriverEmail.trim().toLowerCase()
    try {
      await setDoc(doc(db, 'roles_drivers', email), {
        email,
        name:    newDriverName.trim() || email,
        addedBy: user.email,
        addedAt: serverTimestamp(),
      })
      setDriverMsg(`✅ ${email} agregado como domiciliario`)
      setNewDriverEmail(''); setNewDriverName('')
      const snap = await getDocs(collection(db, 'roles_drivers'))
      const firestoreDrivers = snap.docs.map(d => ({ id: d.id, ...d.data() }))
      const firestoreIds = firestoreDrivers.map(d => d.id)
      const defaultDriverObjs = DEFAULT_DRIVERS
        .filter(e => !firestoreIds.includes(e))
        .map(e => ({ id: e, name: DEFAULT_DRIVER_NAMES[e] || e }))
      setDrivers([...defaultDriverObjs, ...firestoreDrivers])
    } catch {
      setDriverMsg('❌ Error al agregar domiciliario')
    }
  }

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
          {/* Platform toggle */}
          <button
            onClick={togglePlatform}
            title={platformActive ? 'Plataforma cliente: ACTIVA — click para apagar' : 'Plataforma cliente: APAGADA — click para activar'}
            className={`btn-icon relative ${platformActive ? 'text-mint' : 'text-coal/40'}`}
          >
            <Power size={20} />
            <span className={`absolute top-1 right-1 w-2 h-2 rounded-full ${platformActive ? 'bg-mint animate-pulse' : 'bg-coal/30'}`} />
          </button>

          <button
            onClick={() => setShowManual(true)}
            title="Manual de usuario"
            className="btn-icon text-coal/60 hover:text-cherry flex items-center gap-1 px-2"
          >
            <BookOpen size={18} />
            <span className="font-body text-xs font-semibold hidden sm:inline">Manual</span>
          </button>
          <button onClick={() => setAddDriver(v => !v)} className="btn-icon relative" title="Gestionar domiciliarios">
            <Users size={20} />
          </button>
          <button onClick={() => selectSede(null)} className="btn-icon" title="Cambiar sede">
            <MapPin size={20} />
          </button>
          <button onClick={logout} className="btn-icon" title="Cerrar sesión">
            <LogOut size={20} />
          </button>
        </div>
      </header>

      {/* Platform status banner */}
      {platformActive !== null && (
        <div className={`mx-4 mt-2 flex items-center gap-2 rounded-full px-4 py-2 w-fit text-xs font-semibold font-body ${
          platformActive ? 'bg-mint/15 text-mint' : 'bg-coal/10 text-coal/50'
        }`}>
          <Power size={12} />
          Plataforma clientes: {platformActive ? 'ACTIVA' : 'APAGADA'}
        </div>
      )}

      {/* Add driver panel */}
      {addDriver && (
        <div className="mx-4 mt-3 card border border-mint/30 animate-fade-in">
          <p className="font-display text-base tracking-wide text-coal mb-3">Agregar domiciliario</p>
          <div className="flex flex-col gap-2">
            <input className="input-field" placeholder="Correo de Google del domiciliario *"
              value={newDriverEmail} onChange={e => setNewDriverEmail(e.target.value)} />
            <input className="input-field" placeholder="Nombre (opcional)"
              value={newDriverName} onChange={e => setNewDriverName(e.target.value)} />
            <button onClick={handleAddDriver} className="btn-mint btn-sm">Agregar</button>
            {driverMsg && <p className="font-body text-sm">{driverMsg}</p>}
          </div>
        </div>
      )}

      {/* Tabs */}
      <div className="flex border-b border-coal/10 bg-cream/80 px-4 mt-2">
        {TABS.map(t => (
          <button key={t.id} onClick={() => setTab(t.id)}
            className={tab === t.id ? 'tab-btn-active' : 'tab-btn-inactive'}>
            {t.label}
            {t.id === 'cuadre' && cuadreCount > 0 && (
              <span className="ml-1 bg-mustard text-coal text-[10px] font-bold px-1.5 py-0.5 rounded-full">
                {cuadreCount}
              </span>
            )}
            {t.id === 'active' && pendingCount > 0 && (
              <span className="ml-1 bg-cherry text-cream text-[10px] font-bold px-1.5 py-0.5 rounded-full animate-pulse">
                {pendingCount}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* Orders list */}
      <main className="flex-1 overflow-y-auto scroll-custom p-4 flex flex-col gap-3">
        {filteredOrders.length === 0 && !showForm && (
          <div className="flex flex-col items-center justify-center gap-3 py-16 text-center">
            <p className="font-display text-4xl">🍔</p>
            <p className="font-body text-coal/40">
              {tab === 'active' ? 'No hay pedidos activos' : tab === 'cuadre' ? 'No hay cuadres pendientes' : 'No hay pedidos completados hoy'}
            </p>
          </div>
        )}
        {filteredOrders.map(order => (
          <OrderCard key={order.id} order={order} onClick={() => setSelected(order)} />
        ))}
      </main>

      {/* FAB: new order */}
      {!showForm && (
        <div className="fixed bottom-6 right-4 z-30">
          <button onClick={() => setShowForm(true)} className="btn-primary shadow-glow gap-2 pr-5">
            <Plus size={20} />
            Nuevo pedido
          </button>
        </div>
      )}

      {/* Order form modal */}
      {showForm && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-coal/50 backdrop-blur-sm">
          <div className="bg-cream w-full max-w-lg rounded-t-3xl sm:rounded-3xl max-h-[92dvh] overflow-y-auto scroll-custom animate-slide-in-right">
            <div className="sticky top-0 bg-cream/95 backdrop-blur-sm px-5 py-4 border-b border-coal/10 flex items-center justify-between">
              <p className="font-display text-xl text-coal tracking-wide">Nuevo domicilio</p>
              <button onClick={() => setShowForm(false)} className="btn-icon"><Plus size={20} className="rotate-45" /></button>
            </div>
            <div className="p-5">
              <OrderForm
                drivers={drivers}
                onSubmit={handleCreateOrder}
                onCancel={() => setShowForm(false)}
              />
            </div>
          </div>
        </div>
      )}

      {/* Manual de usuario modal */}
      {showManual && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-coal/50 backdrop-blur-sm animate-fade-in"
          onClick={e => { if (e.target === e.currentTarget) setShowManual(false) }}>
          <div className="bg-cream w-full max-w-2xl rounded-3xl max-h-[90dvh] flex flex-col shadow-2xl animate-scale-in mx-4">
            {/* Header del modal */}
            <div className="sticky top-0 bg-gradient-to-r from-cherry to-tangelo px-6 py-5 rounded-t-3xl flex items-center justify-between flex-shrink-0">
              <div className="flex items-center gap-3">
                <BookOpen size={22} className="text-cream" />
                <div>
                  <p className="font-display text-xl text-cream tracking-wide">Manual de usuario</p>
                  <p className="font-body text-xs text-cream/70">Guía completa del panel de cajero</p>
                </div>
              </div>
              <button onClick={() => setShowManual(false)} className="text-cream/70 hover:text-cream transition-colors">
                <X size={22} />
              </button>
            </div>
            {/* Contenido scrolleable */}
            <div className="overflow-y-auto scroll-custom p-5 flex flex-col gap-3">
              <ManualTab />
            </div>
          </div>
        </div>
      )}

      {/* Order detail modal */}
      {selected && <OrderDetail order={selected} onClose={() => setSelected(null)} drivers={drivers} />}

      {/* ══ NEW ORDER ALERT MODAL ══ */}
      {newOrderAlert && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center animate-fade-in">
          {/* Flashing overlay */}
          <div className="absolute inset-0 bg-cherry animate-pulse opacity-90" />

          <div className="relative z-10 mx-4 bg-cream rounded-3xl shadow-2xl p-8 max-w-sm w-full flex flex-col items-center gap-4 animate-scale-in">
            <div className="text-6xl animate-bounce">🔔</div>
            <p className="font-display text-3xl text-cherry tracking-widest text-center">
              ¡NUEVO PEDIDO!
            </p>
            <p className="font-body text-sm text-coal/70 text-center">
              Pedido recibido de un cliente. Atender de inmediato.
            </p>

            {/* Order summary */}
            <div className="w-full bg-smoked/60 rounded-2xl p-4">
              <p className="font-body text-sm font-semibold text-coal">
                {newOrderAlert.name || newOrderAlert.clientName || 'Cliente'}
              </p>
              <p className="font-body text-xs text-coal/60 mt-0.5 line-clamp-2">
                {newOrderAlert.items}
              </p>
              <p className="font-body text-xs text-coal/50 mt-1">
                📍 {newOrderAlert.fullAddress}
              </p>
            </div>

            <div className="flex gap-3 w-full">
              <button
                onClick={dismissAlert}
                className="flex-1 flex items-center justify-center gap-2 px-4 py-3 rounded-xl border-2 border-coal/20 text-coal/60 font-semibold text-sm hover:bg-smoked transition-colors"
              >
                Silenciar
              </button>
              <button
                onClick={() => {
                  dismissAlert()
                  setSelected(newOrderAlert)
                }}
                className="flex-1 btn-primary"
              >
                <BellRing size={16} /> Ver pedido
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

// ─── Manual de usuario ────────────────────────────────────────────────────────
const MANUAL_SECTIONS = [
  {
    id: 'plataforma',
    emoji: '⚡',
    title: 'Interruptor de plataforma',
    color: 'text-mint',
    content: [
      { type: 'p', text: 'El botón ⚡ en el encabezado enciende o apaga el acceso de los clientes a la app.' },
      { type: 'table', rows: [
        ['Verde parpadeando', 'Plataforma ACTIVA — clientes pueden pedir'],
        ['Gris apagado',      'Plataforma APAGADA — clientes ven pantalla cerrada'],
      ]},
      { type: 'tip', text: 'Actívala al inicio del turno (6:00 PM) y apágala al cierre (11:00 PM).' },
    ],
  },
  {
    id: 'alarma',
    emoji: '🔔',
    title: 'Notificación de nuevo pedido',
    color: 'text-cherry',
    content: [
      { type: 'p', text: 'Cuando un cliente envía un pedido desde la app, suena una alarma fuerte y aparece una pantalla roja parpadeante.' },
      { type: 'table', rows: [
        ['"Ver pedido"',  'Silencia la alarma y abre el detalle del pedido directamente'],
        ['"Silenciar"',   'Para el sonido, el pedido queda en la pestaña Activos'],
      ]},
      { type: 'tip', text: 'Mantén el volumen del dispositivo al máximo para no perderte ningún pedido.' },
    ],
  },
  {
    id: 'confirmar',
    emoji: '✅',
    title: 'Confirmar un pedido de cliente',
    color: 'text-mint',
    content: [
      { type: 'p', text: 'Los pedidos que vienen de la app llegan en estado PENDIENTE (número rojo en la pestaña Activos). Para confirmarlos:' },
      { type: 'steps', items: [
        'Abre el pedido tocándolo en la lista.',
        'Revisa la dirección, el pedido y la distancia estimada.',
        'Selecciona el domiciliario en el menú desplegable.',
        'Toca "Confirmar" — el domiciliario recibe la notificación al instante.',
      ]},
    ],
  },
  {
    id: 'rechazar',
    emoji: '❌',
    title: 'Rechazar un pedido',
    color: 'text-pepper',
    content: [
      { type: 'p', text: 'Si el pedido no puede atenderse (distancia muy larga, sin domiciliario, dirección incorrecta):' },
      { type: 'steps', items: [
        'Abre el pedido pendiente.',
        'Toca el botón rojo "Rechazar".',
        'Elige un motivo rápido o escribe el tuyo.',
        'Toca "Confirmar rechazo" — el cliente ve el motivo en su panel.',
      ]},
      { type: 'tip', text: 'El cliente ve exactamente lo que escribes. Sé claro y amable.' },
    ],
  },
  {
    id: 'distancia',
    emoji: '📍',
    title: 'Verificación de distancia',
    color: 'text-mustard',
    content: [
      { type: 'p', text: 'Al abrir un pedido, la plataforma calcula automáticamente la distancia desde la sede hasta la dirección de entrega.' },
      { type: 'table', rows: [
        ['Verde',   'Menos de 3 km — zona cómoda'],
        ['Amarillo','Entre 3 y 5 km — verifica'],
        ['Rojo',    'Más de 5 km — fuera de cobertura recomendada'],
      ]},
      { type: 'p', text: 'Usa el botón "Ver ruta" para abrir Google Maps con la ruta exacta desde la sede hasta el cliente.' },
    ],
  },
  {
    id: 'nuevo',
    emoji: '➕',
    title: 'Crear pedido manualmente',
    color: 'text-tangelo',
    content: [
      { type: 'p', text: 'Cuando un cliente llame o escriba por WhatsApp, usa el botón rojo "+ Nuevo pedido" en la parte inferior.' },
      { type: 'table', rows: [
        ['Nombre y teléfono',   'Obligatorios'],
        ['Dirección',           'Obligatoria — calle, número, apartamento'],
        ['Barrio / Referencia', 'Opcionales pero útiles'],
        ['Pedido',              'Descripción libre de lo que ordenó'],
        ['Forma de pago',       'Efectivo, Nequi, Daviplata o Transferencia'],
        ['Domiciliario',        'Selecciona quién lo entregará'],
      ]},
      { type: 'tip', text: 'Los pedidos manuales nacen en estado ASIGNADO, sin pasar por pendiente.' },
    ],
  },
  {
    id: 'cuadre',
    emoji: '💰',
    title: 'Cuadre de caja',
    color: 'text-mustard',
    content: [
      { type: 'p', text: 'Los pedidos pagados en efectivo pasan a la pestaña CUADRE cuando el domiciliario los marca como entregados.' },
      { type: 'steps', items: [
        'Ve a la pestaña Cuadre (número amarillo indica cuántos hay).',
        'Abre el pedido correspondiente.',
        'Cuando el domiciliario te entregue el dinero, toca "Dinero recibido ✓".',
        'El pedido pasa a Entregados y queda cerrado.',
      ]},
      { type: 'tip', text: 'No marques "Dinero recibido" antes de tener el efectivo en mano.' },
    ],
  },
  {
    id: 'domiciliarios',
    emoji: '🛵',
    title: 'Gestionar domiciliarios',
    color: 'text-coal',
    content: [
      { type: 'p', text: 'Toca el ícono 👥 en el encabezado para agregar un nuevo domiciliario.' },
      { type: 'steps', items: [
        'Escribe el correo de Google del domiciliario.',
        'Escribe su nombre completo (opcional pero recomendado).',
        'Toca "Agregar" — queda activo de inmediato.',
      ]},
      { type: 'tip', text: 'Solo los administradores pueden eliminar domiciliarios del sistema.' },
    ],
  },
  {
    id: 'estados',
    emoji: '🏷️',
    title: 'Estados de los pedidos',
    color: 'text-coal',
    content: [
      { type: 'table', rows: [
        ['📋 PENDIENTE',        'Pedido de cliente esperando confirmación'],
        ['🛵 ASIGNADO',         'Domiciliario asignado, esperando que acepte'],
        ['✅ ACEPTADO',          'Domiciliario confirmó que va a entregar'],
        ['🏃 EN CAMINO',        'Domiciliario en ruta al cliente'],
        ['📍 LLEGÓ',            'Domiciliario llegó al destino'],
        ['🎉 ENTREGADO',        'Pedido entregado exitosamente'],
        ['💰 PDTE. CUADRE',     'Efectivo pendiente de recibir del domiciliario'],
        ['☑️ COMPLETADO',       'Cuadre confirmado, pedido cerrado'],
        ['❌ RECHAZADO',        'Pedido rechazado por el cajero'],
      ]},
    ],
  },
]

function ManualSection({ section }) {
  const [open, setOpen] = useState(false)

  return (
    <div className="card overflow-hidden p-0">
      <button
        onClick={() => setOpen(v => !v)}
        className="w-full flex items-center justify-between gap-3 px-4 py-4 text-left hover:bg-smoked/50 transition-colors"
      >
        <div className="flex items-center gap-3">
          <span className="text-2xl">{section.emoji}</span>
          <span className={`font-display text-base tracking-wide ${section.color}`}>{section.title}</span>
        </div>
        {open ? <ChevronUp size={18} className="text-coal/40 flex-shrink-0" /> : <ChevronDown size={18} className="text-coal/40 flex-shrink-0" />}
      </button>

      {open && (
        <div className="px-4 pb-4 flex flex-col gap-3 border-t border-coal/10 pt-3 animate-fade-in">
          {section.content.map((block, i) => {
            if (block.type === 'p') {
              return <p key={i} className="font-body text-sm text-coal/80 leading-relaxed">{block.text}</p>
            }
            if (block.type === 'tip') {
              return (
                <div key={i} className="flex items-start gap-2 bg-mustard/10 border border-mustard/20 rounded-xl px-3 py-2">
                  <span className="text-mustard text-sm flex-shrink-0">💡</span>
                  <p className="font-body text-xs text-coal/70">{block.text}</p>
                </div>
              )
            }
            if (block.type === 'steps') {
              return (
                <div key={i} className="flex flex-col gap-2">
                  {block.items.map((step, j) => (
                    <div key={j} className="flex items-start gap-3">
                      <span className="w-6 h-6 rounded-full bg-cherry text-cream text-xs font-bold flex items-center justify-center flex-shrink-0 mt-0.5">
                        {j + 1}
                      </span>
                      <p className="font-body text-sm text-coal/80 leading-relaxed">{step}</p>
                    </div>
                  ))}
                </div>
              )
            }
            if (block.type === 'table') {
              return (
                <div key={i} className="flex flex-col divide-y divide-coal/10 rounded-xl overflow-hidden border border-coal/10">
                  {block.rows.map(([col1, col2], j) => (
                    <div key={j} className={`flex gap-3 px-3 py-2 ${j % 2 === 0 ? 'bg-smoked/40' : 'bg-cream'}`}>
                      <span className="font-body text-xs font-semibold text-coal w-32 flex-shrink-0">{col1}</span>
                      <span className="font-body text-xs text-coal/60">{col2}</span>
                    </div>
                  ))}
                </div>
              )
            }
            return null
          })}
        </div>
      )}
    </div>
  )
}

function ManualTab() {
  return (
    <div className="flex flex-col gap-3 pb-8">
      {/* Header */}
      <div className="flex items-center gap-3 mb-1">
        <div className="w-10 h-10 rounded-full bg-cherry/10 flex items-center justify-center flex-shrink-0">
          <HelpCircle size={20} className="text-cherry" />
        </div>
        <div>
          <p className="font-display text-xl text-coal tracking-wide">Manual del cajero</p>
          <p className="font-body text-xs text-coal/50">Toca cada sección para ver los detalles</p>
        </div>
      </div>

      {MANUAL_SECTIONS.map(section => (
        <ManualSection key={section.id} section={section} />
      ))}

      {/* Footer */}
      <div className="mt-2 text-center">
        <p className="font-body text-xs text-coal/30">DeliStars · Plataforma de Domicilios · v1.0</p>
      </div>
    </div>
  )
}
