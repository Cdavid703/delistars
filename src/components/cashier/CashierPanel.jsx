import { useState, useEffect, useRef, useCallback } from 'react'
import {
  collection, addDoc, onSnapshot, query, where,
  serverTimestamp, doc, setDoc, getDocs
} from 'firebase/firestore'
import { db } from '../../services/firebase'
import { useAuth } from '../../contexts/AuthContext'
import { DEFAULT_DRIVERS, DEFAULT_DRIVER_NAMES } from '../../services/roles'
import Logo from '../common/Logo'
import OrderCard from './OrderCard'
import OrderForm from './OrderForm'
import OrderDetail from './OrderDetail'
import AssignDeliveryDetail from './AssignDeliveryDetail'
import { format } from 'date-fns'
import { es } from 'date-fns/locale'
import {
  Plus, LogOut, Users, MapPin, Power, BellRing, HelpCircle,
  ChevronDown, ChevronUp, BookOpen, X, ShoppingBag,
  Calculator, Search, Bike
} from 'lucide-react'

const TABS = [
  { id: 'active',    label: 'Activos' },
  { id: 'assign',    label: 'Asignar domicilio' },
  { id: 'cuadre',   label: 'Cuadre' },
  { id: 'completed', label: 'Entregados' },
]

const ACTIVE_STATUSES   = ['pending', 'assigned', 'accepted', 'in_transit', 'arrived']
const ASSIGN_STATUSES   = ['quoted']
const CUADRE_STATUSES   = ['pending_cuadre']
const COMPLETE_STATUSES = ['completed', 'rejected', 'delivered_paid', 'delivered_cash']

const isToday = ts => {
  if (!ts?.toDate) return false
  return ts.toDate().toDateString() === new Date().toDateString()
}

const fmt = v => (v !== undefined && v !== null && v !== '') ? `$${Number(v).toLocaleString('es-CO')}` : '—'

// ─── Audio alarm ─────────────────────────────────────────────────────────────
function createAlarmPlayer() {
  let ctx = null; let intervalId = null
  const getCtx = () => {
    if (!ctx) ctx = new (window.AudioContext || window.webkitAudioContext)()
    if (ctx.state === 'suspended') ctx.resume()
    return ctx
  }
  const playPattern = () => {
    const c = getCtx(), now = c.currentTime
    const seq = [880, 1100, 880, 1100, 1320, 1100, 880]
    seq.forEach((freq, i) => {
      const osc = c.createOscillator(), gain = c.createGain()
      osc.connect(gain); gain.connect(c.destination)
      osc.type = 'square'; osc.frequency.value = freq
      const t = now + i * 0.16
      gain.gain.setValueAtTime(0.6, t)
      gain.gain.exponentialRampToValueAtTime(0.001, t + 0.14)
      osc.start(t); osc.stop(t + 0.15)
    })
  }
  return {
    play() { playPattern(); intervalId = setInterval(playPattern, 2000) },
    stop() { clearInterval(intervalId); intervalId = null },
  }
}
const alarm = createAlarmPlayer()

export default function CashierPanel() {
  const { user, sede, logout, selectSede, setViewingAs } = useAuth()
  const [tab,             setTab]            = useState('active')
  const [orders,          setOrders]         = useState([])
  const [drivers,         setDrivers]        = useState([])
  const [showForm,        setShowForm]       = useState(false)
  const [selected,        setSelected]       = useState(null)
  const [assigning,       setAssigning]      = useState(null)
  const [addDriver,       setAddDriver]      = useState(false)
  const [newDriverEmail,  setNewDriverEmail] = useState('')
  const [newDriverName,   setNewDriverName]  = useState('')
  const [driverMsg,       setDriverMsg]      = useState('')
  const [platformActive,  setPlatformActive] = useState(null)
  const [newOrderAlert,   setNewOrderAlert]  = useState(null)
  const [alarmActive,     setAlarmActive]    = useState(false)
  const [showManual,      setShowManual]     = useState(false)
  const [showCuadreTurno, setShowCuadreTurno] = useState(false)
  const [historyDate,     setHistoryDate]    = useState('')

  const prevPendingIdsRef = useRef(null)
  const today = format(new Date(), "EEEE dd 'de' MMMM yyyy", { locale: es })

  useEffect(() => {
    return onSnapshot(doc(db, 'config', 'client_platform'), snap => {
      setPlatformActive(snap.exists() ? snap.data().active : false)
    })
  }, [])

  const togglePlatform = async () => {
    await setDoc(doc(db, 'config', 'client_platform'), {
      active: !platformActive, updatedBy: user.email, updatedAt: serverTimestamp(),
    })
  }

  const dismissAlert = useCallback(() => {
    alarm.stop(); setAlarmActive(false); setNewOrderAlert(null)
  }, [])

  useEffect(() => {
    if (!sede) return
    const q = query(collection(db, 'orders'), where('sedeId', '==', sede.id))
    return onSnapshot(q, snap => {
      const docs = snap.docs.map(d => ({ id: d.id, ...d.data() }))
      docs.sort((a, b) => (b.createdAt?.seconds ?? 0) - (a.createdAt?.seconds ?? 0))

      const pendingDocs = docs.filter(o => o.status === 'pending')
      if (prevPendingIdsRef.current === null) {
        prevPendingIdsRef.current = new Set(pendingDocs.map(o => o.id))
      } else {
        pendingDocs.forEach(o => {
          if (!prevPendingIdsRef.current.has(o.id)) {
            prevPendingIdsRef.current.add(o.id)
            alarm.play(); setAlarmActive(true); setNewOrderAlert(o)
          }
        })
      }
      setOrders(docs)
    })
  }, [sede])

  useEffect(() => () => alarm.stop(), [])

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
    if (tab === 'assign')    return ASSIGN_STATUSES.includes(o.status)
    if (tab === 'cuadre')    return CUADRE_STATUSES.includes(o.status)
    if (tab === 'completed') {
      if (!COMPLETE_STATUSES.includes(o.status)) return false
      const target = historyDate ? new Date(historyDate + 'T00:00:00') : new Date()
      if (!o.createdAt?.toDate) return false
      return o.createdAt.toDate().toDateString() === target.toDateString()
    }
    return false
  })

  const pendingCount  = orders.filter(o => o.status === 'pending').length
  const assignCount   = orders.filter(o => ASSIGN_STATUSES.includes(o.status)).length
  const cuadreCount   = orders.filter(o => CUADRE_STATUSES.includes(o.status)).length

  const handleCreateOrder = async (data) => {
    const driver = drivers.find(d => d.id === data.driverId)
    await addDoc(collection(db, 'orders'), {
      ...data,
      sedeId:        sede.id,
      sedeName:      sede.name,
      status:        'assigned',
      cashierId:     user.uid,
      cashierName:   user.displayName,
      driverEmail:   driver?.id || '',
      driverName:    driver?.name || driver?.id || '',
      cashOnDelivery: data.payment === 'Efectivo',
      assignedAt:    serverTimestamp(),
      createdAt:     serverTimestamp(),
      updatedAt:     serverTimestamp(),
    })
    setShowForm(false)
  }

  const handleAddDriver = async () => {
    if (!newDriverEmail.trim()) return
    const email = newDriverEmail.trim().toLowerCase()
    try {
      await setDoc(doc(db, 'roles_drivers', email), {
        email, name: newDriverName.trim() || email,
        addedBy: user.email, addedAt: serverTimestamp(),
      })
      setDriverMsg(`✅ ${email} agregado como domiciliario`)
      setNewDriverEmail(''); setNewDriverName('')
      const snap = await getDocs(collection(db, 'roles_drivers'))
      const fd = snap.docs.map(d => ({ id: d.id, ...d.data() }))
      const fids = fd.map(d => d.id)
      setDrivers([
        ...DEFAULT_DRIVERS.filter(e => !fids.includes(e)).map(e => ({ id: e, name: DEFAULT_DRIVER_NAMES[e] || e })),
        ...fd,
      ])
    } catch { setDriverMsg('❌ Error al agregar domiciliario') }
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
          <button onClick={togglePlatform} title={platformActive ? 'Plataforma ACTIVA' : 'Plataforma APAGADA'}
            className={`btn-icon relative ${platformActive ? 'text-mint' : 'text-coal/40'}`}>
            <Power size={20} />
            <span className={`absolute top-1 right-1 w-2 h-2 rounded-full ${platformActive ? 'bg-mint animate-pulse' : 'bg-coal/30'}`} />
          </button>
          <button onClick={() => setShowCuadreTurno(true)} title="Cuadre de turno"
            className="btn-icon text-coal/60 hover:text-mustard flex items-center gap-1 px-2">
            <Calculator size={18} />
            <span className="font-body text-xs font-semibold hidden sm:inline">Cuadre</span>
          </button>
          <button onClick={() => setViewingAs('client')} title="Ver como cliente"
            className="btn-icon text-coal/60 hover:text-cherry flex items-center gap-1 px-2">
            <ShoppingBag size={18} />
            <span className="font-body text-xs font-semibold hidden sm:inline">Cliente</span>
          </button>
          <button onClick={() => setShowManual(true)} className="btn-icon text-coal/60 hover:text-cherry flex items-center gap-1 px-2">
            <BookOpen size={18} />
            <span className="font-body text-xs font-semibold hidden sm:inline">Manual</span>
          </button>
          <button onClick={() => setAddDriver(v => !v)} className="btn-icon" title="Gestionar domiciliarios">
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
            <input className="input-field" placeholder="Correo de Google *"
              value={newDriverEmail} onChange={e => setNewDriverEmail(e.target.value)} />
            <input className="input-field" placeholder="Nombre (opcional)"
              value={newDriverName} onChange={e => setNewDriverName(e.target.value)} />
            <button onClick={handleAddDriver} className="btn-mint btn-sm">Agregar</button>
            {driverMsg && <p className="font-body text-sm">{driverMsg}</p>}
          </div>
        </div>
      )}

      {/* Tabs */}
      <div className="flex border-b border-coal/10 bg-cream/80 px-2 mt-2 overflow-x-auto">
        {TABS.map(t => (
          <button key={t.id} onClick={() => setTab(t.id)}
            className={`${tab === t.id ? 'tab-btn-active' : 'tab-btn-inactive'} whitespace-nowrap px-3`}>
            {t.label}
            {t.id === 'active'  && pendingCount > 0 && (
              <span className="ml-1 bg-cherry text-cream text-[10px] font-bold px-1.5 py-0.5 rounded-full animate-pulse">{pendingCount}</span>
            )}
            {t.id === 'assign'  && assignCount  > 0 && (
              <span className="ml-1 bg-tangelo text-cream text-[10px] font-bold px-1.5 py-0.5 rounded-full">{assignCount}</span>
            )}
            {t.id === 'cuadre' && cuadreCount  > 0 && (
              <span className="ml-1 bg-mustard text-coal text-[10px] font-bold px-1.5 py-0.5 rounded-full">{cuadreCount}</span>
            )}
          </button>
        ))}
      </div>

      {/* History date picker (only in completed tab) */}
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

      {/* Summary for completed tab */}
      {tab === 'completed' && filteredOrders.length > 0 && (
        <EntregadosSummary orders={filteredOrders} />
      )}

      {/* Orders list */}
      <main className="flex-1 overflow-y-auto scroll-custom p-4 flex flex-col gap-3">
        {filteredOrders.length === 0 && !showForm && (
          <div className="flex flex-col items-center justify-center gap-3 py-16 text-center">
            <p className="font-display text-4xl">
              {tab === 'active' ? '🍔' : tab === 'assign' ? '🛵' : tab === 'cuadre' ? '💰' : '✅'}
            </p>
            <p className="font-body text-coal/40">
              {tab === 'active'    ? 'No hay pedidos activos' :
               tab === 'assign'   ? 'No hay pedidos cotizados pendientes de asignar' :
               tab === 'cuadre'   ? 'No hay cuadres pendientes' :
               historyDate ? `No hay pedidos para el ${historyDate}` : 'No hay pedidos completados hoy'}
            </p>
          </div>
        )}
        {filteredOrders.map(order => (
          <OrderCard
            key={order.id}
            order={order}
            onClick={() => tab === 'assign' ? setAssigning(order) : setSelected(order)}
          />
        ))}
      </main>

      {/* FAB: new order */}
      {!showForm && (
        <div className="fixed bottom-6 right-4 z-30">
          <button onClick={() => setShowForm(true)} className="btn-primary shadow-glow gap-2 pr-5">
            <Plus size={20} /> Nuevo pedido
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
              <OrderForm drivers={drivers} onSubmit={handleCreateOrder} onCancel={() => setShowForm(false)} />
            </div>
          </div>
        </div>
      )}

      {/* Manual de usuario modal */}
      {showManual && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-coal/50 backdrop-blur-sm animate-fade-in"
          onClick={e => { if (e.target === e.currentTarget) setShowManual(false) }}>
          <div className="bg-cream w-full max-w-2xl rounded-3xl max-h-[90dvh] flex flex-col shadow-2xl animate-scale-in mx-4">
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
            <div className="overflow-y-auto scroll-custom p-5 flex flex-col gap-3">
              <ManualTab />
            </div>
          </div>
        </div>
      )}

      {/* Order detail modal */}
      {selected && (
        <OrderDetail
          order={selected}
          onClose={() => setSelected(null)}
          drivers={drivers}
          alarmActive={alarmActive}
          onDismissAlarm={dismissAlert}
        />
      )}

      {/* Assign delivery modal */}
      {assigning && (
        <AssignDeliveryDetail
          order={assigning}
          drivers={drivers}
          onClose={() => setAssigning(null)}
        />
      )}

      {/* Cuadre de turno modal */}
      {showCuadreTurno && (
        <CuadreTurnoModal
          orders={orders}
          drivers={drivers}
          onClose={() => setShowCuadreTurno(false)}
        />
      )}

      {/* ══ NEW ORDER ALERT MODAL ══ */}
      {newOrderAlert && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center animate-fade-in">
          <div className="absolute inset-0 bg-cherry animate-pulse opacity-90" />
          <div className="relative z-10 mx-4 bg-cream rounded-3xl shadow-2xl p-8 max-w-sm w-full flex flex-col items-center gap-4 animate-scale-in">
            <div className="text-6xl animate-bounce">🔔</div>
            <p className="font-display text-3xl text-cherry tracking-widest text-center">¡NUEVO PEDIDO!</p>
            <p className="font-body text-sm text-coal/70 text-center">Pedido recibido de un cliente. Atender de inmediato.</p>
            <div className="w-full bg-smoked/60 rounded-2xl p-4">
              <p className="font-body text-sm font-semibold text-coal">{newOrderAlert.name || newOrderAlert.clientName || 'Cliente'}</p>
              <p className="font-body text-xs text-coal/60 mt-0.5 line-clamp-2">{newOrderAlert.items}</p>
              <p className="font-body text-xs text-coal/50 mt-1">📍 {newOrderAlert.fullAddress}</p>
            </div>
            <div className="flex gap-3 w-full">
              <button onClick={dismissAlert}
                className="flex-1 flex items-center justify-center gap-2 px-4 py-3 rounded-xl border-2 border-coal/20 text-coal/60 font-semibold text-sm hover:bg-smoked transition-colors">
                Silenciar
              </button>
              <button onClick={() => { dismissAlert(); setSelected(newOrderAlert) }} className="flex-1 btn-primary">
                <BellRing size={16} /> Ver pedido
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

// ─── Entregados summary ───────────────────────────────────────────────────────
function EntregadosSummary({ orders }) {
  const cashOrders    = orders.filter(o => o.cashOnDelivery || o.payment === 'Efectivo')
  const digitalOrders = orders.filter(o => !o.cashOnDelivery && o.payment !== 'Efectivo')
  const totalRevenue  = orders.reduce((s, o) => s + (o.totalPrice || 0), 0)
  const totalFees     = orders.reduce((s, o) => s + (o.deliveryPrice || 0), 0)

  return (
    <div className="mx-4 mt-3 bg-gradient-to-r from-cherry/10 to-tangelo/10 border border-cherry/20 rounded-2xl p-4 flex flex-col gap-3">
      <p className="font-display text-base tracking-wide text-coal">Resumen del día</p>
      <div className="grid grid-cols-3 gap-2 text-center">
        <div className="bg-cream/80 rounded-xl p-2">
          <p className="font-display text-2xl text-cherry">{orders.length}</p>
          <p className="font-body text-[10px] text-coal/50 uppercase tracking-wider">Domicilios</p>
        </div>
        <div className="bg-cream/80 rounded-xl p-2">
          <p className="font-display text-2xl text-mustard">{cashOrders.length}</p>
          <p className="font-body text-[10px] text-coal/50 uppercase tracking-wider">Efectivo</p>
        </div>
        <div className="bg-cream/80 rounded-xl p-2">
          <p className="font-display text-2xl text-mint">{digitalOrders.length}</p>
          <p className="font-body text-[10px] text-coal/50 uppercase tracking-wider">Digital</p>
        </div>
      </div>
      {totalRevenue > 0 && (
        <div className="flex flex-col gap-1.5">
          <div className="flex justify-between items-center bg-cream/60 rounded-lg px-3 py-2">
            <span className="font-body text-xs text-coal/60">Total recaudado:</span>
            <span className="font-display text-base text-coal">{fmt(totalRevenue)}</span>
          </div>
          <div className="flex justify-between items-center bg-cream/60 rounded-lg px-3 py-2">
            <span className="font-body text-xs text-coal/60">Total en domicilios:</span>
            <span className="font-display text-base text-mint">{fmt(totalFees)}</span>
          </div>
        </div>
      )}
    </div>
  )
}

// ─── Cuadre de turno modal ────────────────────────────────────────────────────
function CuadreTurnoModal({ orders, drivers, onClose }) {
  const [selectedDriver, setSelectedDriver] = useState('')

  const completedToday = orders.filter(o =>
    COMPLETE_STATUSES.includes(o.status) && isToday(o.createdAt)
  )

  const filtered = selectedDriver
    ? completedToday.filter(o => o.driverEmail === selectedDriver)
    : completedToday

  const cashOrders    = filtered.filter(o => o.cashOnDelivery || o.payment === 'Efectivo')
  const totalCash     = cashOrders.reduce((s, o) => s + (o.totalPrice || 0), 0)

  const feeOrders     = filtered.filter(o => o.deliveryPrice > 0)
  const feeGroups     = {}
  feeOrders.forEach(o => {
    const f = o.deliveryPrice
    if (!feeGroups[f]) feeGroups[f] = { count: 0, total: 0 }
    feeGroups[f].count++; feeGroups[f].total += f
  })
  const totalFees = feeOrders.reduce((s, o) => s + (o.deliveryPrice || 0), 0)

  return (
    <div className="fixed inset-0 z-[100] flex items-end sm:items-center justify-center bg-coal/50 backdrop-blur-sm animate-fade-in"
      onClick={e => { if (e.target === e.currentTarget) onClose() }}>
      <div className="bg-cream w-full max-w-lg rounded-t-3xl sm:rounded-3xl max-h-[90dvh] overflow-y-auto scroll-custom animate-scale-in">
        <div className="sticky top-0 bg-gradient-to-r from-mustard to-tangelo px-6 py-5 rounded-t-3xl flex items-center justify-between">
          <div>
            <p className="font-display text-2xl text-cream tracking-wide">Cuadre de turno</p>
            <p className="font-body text-xs text-cream/70 capitalize">
              {format(new Date(), "EEEE dd 'de' MMMM yyyy", { locale: es })}
            </p>
          </div>
          <button onClick={onClose} className="text-cream/70 hover:text-cream"><X size={22} /></button>
        </div>

        <div className="p-5 flex flex-col gap-4">
          {/* Driver filter */}
          <div>
            <label className="label-field">Filtrar por domiciliario</label>
            <select className="input-field" value={selectedDriver} onChange={e => setSelectedDriver(e.target.value)}>
              <option value="">Todos los domiciliarios</option>
              {drivers.map(d => <option key={d.id} value={d.id}>{d.name || d.id}</option>)}
            </select>
          </div>

          {/* Total pedidos */}
          <div className="card">
            <p className="font-display text-base tracking-wide mb-1">📦 Pedidos completados hoy</p>
            <p className="font-body text-2xl font-bold text-coal">{filtered.length} pedidos</p>
          </div>

          {/* Cash */}
          <div className="card border border-mustard/30">
            <p className="font-display text-base tracking-wide mb-2">💵 Efectivo a entregar en caja</p>
            {cashOrders.length === 0 ? (
              <p className="font-body text-sm text-coal/50">No hay pedidos en efectivo</p>
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

          {/* Fee groups */}
          <div className="card border border-mint/30">
            <p className="font-display text-base tracking-wide mb-3">🛵 Valor de domicilios</p>
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
                  <span className="font-body font-semibold text-sm">Total a pagar al domiciliario:</span>
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

// ─── Manual de usuario ────────────────────────────────────────────────────────
const MANUAL_SECTIONS = [
  {
    id: 'flujo', emoji: '📋', title: 'Flujo de un pedido', color: 'text-cherry',
    content: [
      { type: 'steps', items: [
        'El cliente hace el pedido → aparece en "Activos" como PENDIENTE.',
        'Abre el pedido y llena: número de orden, precio del pedido, domicilio y nota opcional.',
        'Toca "Enviar cotización al cliente" → el cliente ve el precio en su app.',
        'El cliente paga por WhatsApp o presencialmente.',
        'Ve a la pestaña "Asignar domicilio", selecciona el pedido y completa el envío al domiciliario.',
        'El domiciliario acepta, va en camino y marca la entrega.',
        'Si fue efectivo, el pedido aparece en "Cuadre" para confirmar el dinero recibido.',
      ]},
    ],
  },
  {
    id: 'plataforma', emoji: '⚡', title: 'Interruptor de plataforma', color: 'text-mint',
    content: [
      { type: 'table', rows: [
        ['Verde parpadeando', 'Plataforma ACTIVA — clientes pueden pedir'],
        ['Gris apagado',      'Plataforma APAGADA — clientes ven pantalla cerrada'],
      ]},
      { type: 'tip', text: 'Actívala al inicio del turno (6:00 PM) y apágala al cierre (11:00 PM).' },
    ],
  },
  {
    id: 'alarma', emoji: '🔔', title: 'Notificación de nuevo pedido', color: 'text-cherry',
    content: [
      { type: 'table', rows: [
        ['"Ver pedido"', 'Silencia la alarma y abre el detalle'],
        ['"Silenciar"',  'Para el sonido, el pedido queda en Activos'],
      ]},
    ],
  },
  {
    id: 'cuadre_turno', emoji: '💰', title: 'Cuadre de turno', color: 'text-mustard',
    content: [
      { type: 'p', text: 'Usa el botón "Cuadre" en el encabezado para ver el resumen del turno.' },
      { type: 'table', rows: [
        ['Efectivo a caja',    'Suma de todos los pedidos en efectivo de hoy'],
        ['Pago al domiciliario', 'Total de domicilios agrupados por valor'],
      ]},
    ],
  },
  {
    id: 'estados', emoji: '🏷️', title: 'Estados de los pedidos', color: 'text-coal',
    content: [
      { type: 'table', rows: [
        ['📋 PENDIENTE',   'Pedido de cliente esperando cotización'],
        ['💰 COTIZADO',    'Cajero envió precio, esperando pago del cliente'],
        ['🛵 ASIGNADO',    'Domiciliario asignado, esperando que acepte'],
        ['✅ ACEPTADO',     'Domiciliario confirmó que va a entregar'],
        ['🏃 EN CAMINO',   'Domiciliario en ruta al cliente'],
        ['📍 LLEGÓ',       'Domiciliario llegó al destino'],
        ['💰 PDTE. CUADRE','Efectivo pendiente de recibir del domiciliario'],
        ['☑️ COMPLETADO',  'Cuadre confirmado, pedido cerrado'],
        ['❌ RECHAZADO',   'Pedido rechazado por el cajero'],
      ]},
    ],
  },
]

function ManualSection({ section }) {
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

function ManualTab() {
  return (
    <div className="flex flex-col gap-3 pb-8">
      <div className="flex items-center gap-3 mb-1">
        <div className="w-10 h-10 rounded-full bg-cherry/10 flex items-center justify-center flex-shrink-0">
          <HelpCircle size={20} className="text-cherry" />
        </div>
        <div>
          <p className="font-display text-xl text-coal tracking-wide">Manual del cajero</p>
          <p className="font-body text-xs text-coal/50">Toca cada sección para ver los detalles</p>
        </div>
      </div>
      {MANUAL_SECTIONS.map(section => <ManualSection key={section.id} section={section} />)}
      <div className="mt-2 text-center">
        <p className="font-body text-xs text-coal/30">DeliStars · Plataforma de Domicilios · v2.0</p>
      </div>
    </div>
  )
}
