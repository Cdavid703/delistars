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
import { Plus, LogOut, Users, MapPin, Power, BellRing } from 'lucide-react'

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
  const [newOrderAlert, setNewOrderAlert]   = useState(null) // order that just arrived
  const [alarmActive,   setAlarmActive]     = useState(false)

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
