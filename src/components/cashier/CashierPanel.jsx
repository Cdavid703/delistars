import { useState, useEffect, useRef, useCallback } from 'react'
import {
  collection, addDoc, onSnapshot, query, where,
  serverTimestamp, doc, setDoc, getDocs
} from 'firebase/firestore'
import { db, createOrderWithNumber } from '../../services/firebase'
import { useAuth } from '../../contexts/AuthContext'
import { DEFAULT_DRIVERS, DEFAULT_DRIVER_NAMES } from '../../services/roles'
import { cashAmount } from '../../utils/payments'
import Logo from '../common/Logo'
import RoleSwitcher from '../common/RoleSwitcher'
import OrderCard from './OrderCard'
import OrderForm from './OrderForm'
import OrderDetail from './OrderDetail'
import AssignDeliveryDetail from './AssignDeliveryDetail'
import StatusBadge from '../common/StatusBadge'
import { format } from 'date-fns'
import { es } from 'date-fns/locale'
import {
  Plus, LogOut, Users, MapPin, Power, BellRing, HelpCircle,
  ChevronDown, ChevronUp, BookOpen, X,
  Calculator, Search, Bike, Navigation, ExternalLink, Phone, MessageCircle, ChevronRight, Pencil, Check
} from 'lucide-react'

const TABS = [
  { id: 'active',    label: 'Activos' },
  { id: 'assign',    label: 'Asignar domicilio' },
  { id: 'cuadre',   label: 'Cuadre' },
  { id: 'completed', label: 'Entregados' },
]

const ACTIVE_STATUSES   = ['pending', 'assigned', 'accepted', 'preparing', 'in_transit', 'arrived']
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

function playMessageSound() {
  try {
    const ctx = new (window.AudioContext || window.webkitAudioContext)()
    if (ctx.state === 'suspended') ctx.resume()
    // Doble ráfaga de 3 tonos — mucho más audible que un bip simple
    const burst = (offset) => {
      [880, 1100, 880].forEach((freq, i) => {
        const osc = ctx.createOscillator(), gain = ctx.createGain()
        osc.connect(gain); gain.connect(ctx.destination)
        osc.type = 'sine'; osc.frequency.value = freq
        const t = ctx.currentTime + offset + i * 0.14
        gain.gain.setValueAtTime(0.55, t)
        gain.gain.exponentialRampToValueAtTime(0.001, t + 0.18)
        osc.start(t); osc.stop(t + 0.20)
      })
    }
    burst(0)
    burst(0.55)   // repite a los 0.55s para asegurar que se escuche
  } catch (_) {}
}

export default function CashierPanel() {
  const { user, sede, logout, selectSede } = useAuth()
  const [tab,             setTab]            = useState('active')
  const [orders,          setOrders]         = useState([])
  const [drivers,         setDrivers]        = useState([])
  const [showForm,        setShowForm]       = useState(false)
  const [selectedId,      setSelectedId]     = useState(null)
  const [assigning,       setAssigning]      = useState(null)
  const [addDriver,       setAddDriver]      = useState(false)
  const [newDriverEmail,  setNewDriverEmail] = useState('')
  const [newDriverName,   setNewDriverName]  = useState('')
  const [newDriverPhone,  setNewDriverPhone] = useState('')
  const [driverMsg,       setDriverMsg]      = useState('')
  const [editingDriver,   setEditingDriver]  = useState(null)
  const [editPhone,       setEditPhone]      = useState('')
  const [platformActive,  setPlatformActive] = useState(null)
  const [newOrderAlert,   setNewOrderAlert]  = useState(null)
  const [alarmActive,     setAlarmActive]    = useState(false)
  const [showManual,      setShowManual]     = useState(false)
  const [showCuadreTurno, setShowCuadreTurno] = useState(false)
  const [showTracking,    setShowTracking]   = useState(false)
  const [historyDate,     setHistoryDate]    = useState('')

  const [cashierSeenCounts, setCashierSeenCounts] = useState(() => {
    try { return JSON.parse(localStorage.getItem('ds_cashier_chat_seen') || '{}') } catch { return {} }
  })

  const prevPendingIdsRef    = useRef(null)
  const clientMsgCountRef    = useRef(null)   // null = primera carga, no reproducir
  const seenInitializedRef   = useRef(false)  // inicializar seenCounts una sola vez
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

  // Inicializar seenCounts en la primera carga de pedidos:
  // los pedidos que ya existían en Firestore se marcan como "vistos"
  // para que no aparezcan como no leídos retroactivamente.
  useEffect(() => {
    if (seenInitializedRef.current || orders.length === 0) return
    seenInitializedRef.current = true
    const updated = { ...cashierSeenCounts }
    let changed = false
    orders.forEach(o => {
      if (!(o.id in updated)) {
        // Pedido no trackeado → marcar mensajes actuales como vistos
        updated[o.id] = (o.clientMessages || []).filter(m => m.role === 'client').length
        changed = true
      }
    })
    if (changed) {
      setCashierSeenCounts(updated)
      try { localStorage.setItem('ds_cashier_chat_seen', JSON.stringify(updated)) } catch {}
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [orders])

  // Sonido al recibir mensaje nuevo del cliente en el chat
  useEffect(() => {
    if (clientMsgCountRef.current === null) {
      // Primera carga: solo inicializar si ya hay pedidos cargados
      if (orders.length === 0) return   // esperar al primer snapshot real
      clientMsgCountRef.current = {}
      orders.forEach(o => {
        clientMsgCountRef.current[o.id] = (o.clientMessages || []).filter(m => m.role === 'client').length
      })
      return
    }
    let played = false
    orders.forEach(o => {
      const count = (o.clientMessages || []).filter(m => m.role === 'client').length
      const prev  = clientMsgCountRef.current[o.id]
      // Solo sonar si el pedido ya estaba registrado (prev !== undefined) y el conteo subió
      if (prev !== undefined && count > prev && !played) { playMessageSound(); played = true }
      clientMsgCountRef.current[o.id] = count
    })
  }, [orders])

  const dismissAlert = useCallback(() => {
    alarm.stop(); setAlarmActive(false); setNewOrderAlert(null)
  }, [])

  // Marcar mensajes del cliente como vistos al abrir el pedido
  const openOrderDetail = (orderId) => {
    if (!orderId) return
    const o = orders.find(x => x.id === orderId)
    if (o) {
      const count = (o.clientMessages || []).filter(m => m.role === 'client').length
      const updated = { ...cashierSeenCounts, [orderId]: count }
      setCashierSeenCounts(updated)
      try { localStorage.setItem('ds_cashier_chat_seen', JSON.stringify(updated)) } catch {}
    }
    setSelectedId(orderId)
  }

  // Mapa de mensajes no leídos por pedido (mensajes del cliente que el cajero no ha visto)
  const unreadChatMap = Object.fromEntries(
    orders.map(o => {
      const clientMsgs = (o.clientMessages || []).filter(m => m.role === 'client').length
      return [o.id, Math.max(0, clientMsgs - (cashierSeenCounts[o.id] || 0))]
    })
  )
  const totalUnreadChat = Object.values(unreadChatMap).reduce((s, n) => s + n, 0)

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

  // Derivar el pedido seleccionado desde el array en vivo (así el modal refleja cambios en tiempo real)
  const selected = selectedId ? orders.find(o => o.id === selectedId) ?? null : null

  useEffect(() => () => alarm.stop(), [])

  useEffect(() => {
    const loadDrivers = async () => {
      const snap = await getDocs(collection(db, 'roles_drivers'))
      const firestoreDrivers = snap.docs.map(d => ({
        id: d.id, ...d.data(),
        phone: d.data().phone || null,
      }))
      const firestoreIds = firestoreDrivers.map(d => d.id)
      const defaultDriverObjs = DEFAULT_DRIVERS
        .filter(email => !firestoreIds.includes(email))
        .map(email => ({ id: email, name: DEFAULT_DRIVER_NAMES[email] || email, phone: null }))
      setDrivers([...defaultDriverObjs, ...firestoreDrivers])
    }
    loadDrivers()
  }, [])

  const isPickup = o => o.deliveryMode === 'pickup'
  const filteredOrders = orders.filter(o => {
    // Recoger en sede no pasa por asignación de domiciliario: el pedido cotizado
    // se queda en "Activos" para que el cajero lo gestione hasta la entrega.
    if (tab === 'active')    return (ACTIVE_STATUSES.includes(o.status) || (o.status === 'quoted' && isPickup(o))) && isToday(o.createdAt)
    if (tab === 'assign')    return ASSIGN_STATUSES.includes(o.status) && !isPickup(o) && isToday(o.createdAt)
    if (tab === 'cuadre')    return CUADRE_STATUSES.includes(o.status) && isToday(o.createdAt)
    if (tab === 'completed') {
      if (!COMPLETE_STATUSES.includes(o.status)) return false
      const target = historyDate ? new Date(historyDate + 'T00:00:00') : new Date()
      if (!o.createdAt?.toDate) return false
      return o.createdAt.toDate().toDateString() === target.toDateString()
    }
    return false
  })

  const pendingCount  = orders.filter(o => o.status === 'pending'                    && isToday(o.createdAt)).length
  const assignCount   = orders.filter(o => ASSIGN_STATUSES.includes(o.status)        && o.deliveryMode !== 'pickup' && isToday(o.createdAt)).length
  const cuadreCount   = orders.filter(o => CUADRE_STATUSES.includes(o.status)        && isToday(o.createdAt)).length

  const handleCreateOrder = async (data) => {
    const driver = drivers.find(d => d.id === data.driverId)
    const driverEmail = (driver?.id || data.driverId || '').toLowerCase().trim()
    const manualNumber = data.orderNumber?.trim() || ''
    const orderData = {
      ...data,
      sedeId:        sede.id,
      sedeName:      sede.name,
      status:        'assigned',
      cashierId:     user.uid,
      cashierName:   user.displayName,
      driverEmail,
      driverName:    driver?.name || driver?.id || '',
      cashOnDelivery: data.payment === 'Efectivo' || data.payment === 'Mixto',
      assignedAt:    serverTimestamp(),
      createdAt:     serverTimestamp(),
      updatedAt:     serverTimestamp(),
    }
    try {
      if (manualNumber) {
        // El cajero escribió un número a mano: se respeta tal cual.
        await addDoc(collection(db, 'orders'), { ...orderData, orderNumber: manualNumber })
      } else {
        // Número + pedido en una sola transacción atómica (sin saltos).
        await createOrderWithNumber(sede.id, orderData)
      }
      setShowForm(false)
    } catch (err) {
      console.error('[CashierPanel] crear pedido ERROR:', err)
      throw err   // re-lanzar para que OrderForm muestre el error
    }
  }

  const handleAddDriver = async () => {
    if (!newDriverEmail.trim()) return
    const email = newDriverEmail.trim().toLowerCase()
    try {
      await setDoc(doc(db, 'roles_drivers', email), {
        email, name: newDriverName.trim() || email,
        phone: newDriverPhone.trim() || null,
        addedBy: user.email, addedAt: serverTimestamp(),
      })
      setDriverMsg(`✅ ${email} agregado como domiciliario`)
      setNewDriverEmail(''); setNewDriverName(''); setNewDriverPhone('')
      const snap = await getDocs(collection(db, 'roles_drivers'))
      const fd = snap.docs.map(d => ({ id: d.id, ...d.data() }))
      const fids = fd.map(d => d.id)
      setDrivers([
        ...DEFAULT_DRIVERS.filter(e => !fids.includes(e)).map(e => ({ id: e, name: DEFAULT_DRIVER_NAMES[e] || e })),
        ...fd,
      ])
    } catch { setDriverMsg('❌ Error al agregar domiciliario') }
  }

  const handleUpdatePhone = async (driver) => {
    try {
      await setDoc(doc(db, 'roles_drivers', driver.id), {
        email: driver.id,
        name:  driver.name,
        phone: editPhone.trim() || null,
      }, { merge: true })
      const snap = await getDocs(collection(db, 'roles_drivers'))
      const fd   = snap.docs.map(d => ({ id: d.id, ...d.data(), phone: d.data().phone || null }))
      const fids = fd.map(d => d.id)
      setDrivers([
        ...DEFAULT_DRIVERS.filter(e => !fids.includes(e)).map(e => ({ id: e, name: DEFAULT_DRIVER_NAMES[e] || e, phone: null })),
        ...fd,
      ])
      setEditingDriver(null)
      setEditPhone('')
    } catch { setDriverMsg('❌ Error al actualizar teléfono') }
  }

  return (
    <div className="min-h-screen-safe flex flex-col bg-gradient-soft">
      {/* Header */}
      <header className="page-header">
        <div className="flex items-center gap-3">
          <Logo variant="light" size="sm" />
          <div>
            <p className="font-display text-base text-coal tracking-wide leading-tight">
              {user?.displayName?.split(' ')[0] || user?.email?.split('@')[0] || 'Cajero'}
            </p>
            <div className="flex items-center gap-1.5 mt-0.5">
              <span className="font-body text-[10px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded-full bg-tangelo/15 text-tangelo">Cajero</span>
              <p className="font-body text-xs text-coal/50">{sede?.name}</p>
            </div>
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
          <RoleSwitcher />
          <button onClick={() => setShowManual(true)} className="btn-icon text-coal/60 hover:text-cherry flex items-center gap-1 px-2">
            <BookOpen size={18} />
            <span className="font-body text-xs font-semibold hidden sm:inline">Manual</span>
          </button>
          <button onClick={() => setShowTracking(true)} title="Ver ubicación domiciliarios"
            className="btn-icon text-coal/60 hover:text-mint relative">
            <Navigation size={20} />
            {orders.filter(o => ['accepted','in_transit','arrived'].includes(o.status)).length > 0 && (
              <span className="absolute -top-0.5 -right-0.5 w-2.5 h-2.5 rounded-full bg-mint animate-pulse" />
            )}
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

      {/* Driver management panel */}
      {addDriver && (
        <div className="mx-4 mt-3 card border border-mint/30 animate-fade-in">
          <p className="font-display text-base tracking-wide text-coal mb-3">🚴 Gestionar domiciliarios</p>

          {/* Existing drivers list */}
          {drivers.length > 0 && (
            <div className="mb-4">
              <p className="font-body text-[10px] uppercase tracking-wider text-coal/40 mb-2">Registrados actualmente</p>
              <div className="flex flex-col gap-1.5">
                {drivers.map(d => (
                  <div key={d.id} className="flex flex-col gap-1.5 bg-smoked/50 rounded-xl px-3 py-2">
                    <div className="flex items-center gap-2">
                      <Bike size={14} className="text-mint flex-shrink-0" />
                      <div className="flex-1 min-w-0">
                        <p className="font-body text-sm font-semibold text-coal truncate">{d.name || d.id}</p>
                        <p className="font-body text-[11px] text-coal/40 truncate">{d.id}</p>
                      </div>
                      {editingDriver !== d.id && (
                        <>
                          {d.phone ? (
                            <a href={`tel:${d.phone}`} className="font-body text-xs text-mint whitespace-nowrap">{d.phone}</a>
                          ) : (
                            <span className="font-body text-[10px] text-coal/30">sin tel.</span>
                          )}
                          <button onClick={() => { setEditingDriver(d.id); setEditPhone(d.phone || '') }}
                            className="text-coal/30 hover:text-mint transition-colors flex-shrink-0" title="Editar teléfono">
                            <Pencil size={13} />
                          </button>
                        </>
                      )}
                    </div>
                    {editingDriver === d.id && (
                      <div className="flex items-center gap-2 pt-0.5">
                        <input
                          className="input-field py-1.5 text-sm flex-1"
                          placeholder="Teléfono WhatsApp"
                          type="tel"
                          value={editPhone}
                          onChange={e => setEditPhone(e.target.value)}
                          autoFocus
                        />
                        <button onClick={() => handleUpdatePhone(d)}
                          className="w-8 h-8 rounded-xl bg-mint flex items-center justify-center flex-shrink-0">
                          <Check size={14} className="text-cream" />
                        </button>
                        <button onClick={() => { setEditingDriver(null); setEditPhone('') }}
                          className="w-8 h-8 rounded-xl bg-smoked flex items-center justify-center flex-shrink-0">
                          <X size={14} className="text-coal/50" />
                        </button>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Add driver form */}
          <div className="border-t border-coal/10 pt-3">
            <p className="font-body text-[10px] uppercase tracking-wider text-coal/40 mb-2">Agregar nuevo</p>
            <div className="flex flex-col gap-2">
              <input className="input-field" placeholder="Correo de Google *"
                value={newDriverEmail} onChange={e => setNewDriverEmail(e.target.value)} />
              <input className="input-field" placeholder="Nombre"
                value={newDriverName} onChange={e => setNewDriverName(e.target.value)} />
              <input className="input-field" placeholder="Teléfono WhatsApp (ej: 3001234567)"
                value={newDriverPhone} onChange={e => setNewDriverPhone(e.target.value)}
                type="tel" />
              <button onClick={handleAddDriver} className="btn-mint btn-sm">Agregar</button>
              {driverMsg && <p className="font-body text-sm">{driverMsg}</p>}
            </div>
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
            {t.id === 'active'  && totalUnreadChat > 0 && (
              <span className="ml-1 bg-cherry text-cream text-[10px] font-bold px-1.5 py-0.5 rounded-full flex items-center gap-0.5">
                <MessageCircle size={8} />{totalUnreadChat}
              </span>
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

      {/* Banner global de mensajes sin leer del cliente */}
      {totalUnreadChat > 0 && (
        <div className="mx-4 mt-2 bg-cherry/10 border border-cherry/30 rounded-2xl px-4 py-3 flex items-center gap-3">
          <div className="w-9 h-9 bg-cherry rounded-full flex items-center justify-center flex-shrink-0 animate-bounce">
            <MessageCircle size={18} className="text-cream" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="font-body text-sm font-semibold text-cherry">
              {totalUnreadChat === 1 ? '1 mensaje sin leer de un cliente' : `${totalUnreadChat} mensajes sin leer de clientes`}
            </p>
            <p className="font-body text-xs text-coal/50">Toca el pedido resaltado para responder</p>
          </div>
        </div>
      )}

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

      {/* Cash pending banner for cuadre tab */}
      {tab === 'cuadre' && filteredOrders.length > 0 && (() => {
        const total = filteredOrders.reduce((s, o) => s + (o.totalPrice || 0), 0)
        return (
          <div className="mx-4 mt-2 bg-mustard/15 border border-mustard/30 rounded-xl px-4 py-2.5 flex items-center justify-between">
            <span className="font-body text-xs font-semibold text-coal/70">💵 Efectivo pendiente de recibir:</span>
            <span className="font-display text-lg text-mustard">{fmt(total)}</span>
          </div>
        )
      })()}

      {/* Summary for completed tab */}
      {tab === 'completed' && filteredOrders.length > 0 && (
        <EntregadosSummary
          orders={filteredOrders}
          sedeName={sede?.name || ''}
          fecha={historyDate
            ? format(new Date(historyDate + 'T00:00:00'), "EEEE dd 'de' MMMM yyyy", { locale: es })
            : today}
        />
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
            unreadCount={unreadChatMap[order.id] || 0}
            onClick={() => tab === 'assign' ? setAssigning(order) : openOrderDetail(order.id)}
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
          onClose={() => setSelectedId(null)}
          drivers={drivers}
          alarmActive={alarmActive}
          onDismissAlarm={dismissAlert}
          onReassign={order => { setSelectedId(null); setAssigning(order) }}
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

      {/* Driver tracking modal */}
      {showTracking && (
        <DriverTrackingModal
          orders={orders}
          drivers={drivers}
          sede={sede}
          onClose={() => setShowTracking(false)}
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
              <button onClick={() => { dismissAlert(); openOrderDetail(newOrderAlert?.id ?? null) }} className="flex-1 btn-primary">
                <BellRing size={16} /> Ver pedido
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

// ─── PDF export ───────────────────────────────────────────────────────────────
function exportarPDF(orders, fecha, sedeName) {
  const f       = v => (v !== undefined && v !== null && v !== '') ? `$${Number(v).toLocaleString('es-CO')}` : '—'
  const esc     = s => String(s ?? '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#x27;')
  const cashOrders    = orders.filter(o => o.cashOnDelivery || o.payment === 'Efectivo' || o.payment === 'Mixto')
  const digitalOrders = orders.filter(o => !o.cashOnDelivery && o.payment !== 'Efectivo' && o.payment !== 'Mixto')
  const totalRevenue  = orders.reduce((s, o) => s + (o.totalPrice || 0), 0)
  const totalFees     = orders.reduce((s, o) => s + (o.deliveryPrice || 0), 0)

  const rows = orders.map((o, i) => `
    <tr>
      <td>${i + 1}</td>
      <td><strong>#${esc(o.orderNumber || '—')}</strong></td>
      <td>${esc(o.name || o.clientName || '—')}</td>
      <td style="max-width:160px">${esc((o.items || '—').slice(0, 60))}${(o.items || '').length > 60 ? '…' : ''}</td>
      <td>${esc(o.driverName || '—')}</td>
      <td>${esc(o.payment || '—')}</td>
      <td>${f(o.quotedPrice)}</td>
      <td>${f(o.deliveryPrice)}</td>
      <td><strong>${f(o.totalPrice)}</strong></td>
    </tr>`).join('')

  const html = `<!DOCTYPE html><html lang="es"><head><meta charset="UTF-8">
  <title>Resumen DeliStars — ${fecha}</title>
  <style>
    *{margin:0;padding:0;box-sizing:border-box}
    body{font-family:Arial,sans-serif;padding:28px;color:#1a1a1a;font-size:12px}
    .header{display:flex;align-items:center;gap:16px;border-bottom:3px solid #e63946;padding-bottom:14px;margin-bottom:20px}
    .header img{height:56px}
    .header h1{font-size:22px;color:#e63946;letter-spacing:2px;font-weight:900}
    .header p{font-size:11px;color:#666;margin-top:3px}
    .boxes{display:grid;grid-template-columns:repeat(5,1fr);gap:10px;margin-bottom:20px}
    .box{background:#f8f8f8;border:1px solid #eee;border-radius:8px;padding:10px;text-align:center}
    .box .v{font-size:20px;font-weight:700;color:#e63946}
    .box .l{font-size:9px;color:#999;text-transform:uppercase;letter-spacing:1px;margin-top:3px}
    table{width:100%;border-collapse:collapse}
    th{background:#e63946;color:#fff;padding:7px 5px;text-align:left;font-size:11px}
    td{padding:5px;border-bottom:1px solid #eee;font-size:11px}
    tr:nth-child(even) td{background:#fafafa}
    .footer{margin-top:18px;text-align:center;font-size:10px;color:#aaa;border-top:1px solid #eee;padding-top:10px}
    @media print{body{padding:15px}}
  </style></head><body>
  <div class="header">
    <img src="${window.location.origin}/logo_sello.png" alt="DeliStars" />
    <div>
      <h1>DELISTARS</h1>
      <p>Resumen de pedidos entregados — Sede ${sedeName}</p>
      <p>${fecha}</p>
    </div>
  </div>
  <div class="boxes">
    <div class="box"><div class="v">${orders.length}</div><div class="l">Domicilios</div></div>
    <div class="box"><div class="v">${cashOrders.length}</div><div class="l">Efectivo</div></div>
    <div class="box"><div class="v">${digitalOrders.length}</div><div class="l">Digital</div></div>
    <div class="box"><div class="v" style="color:#2a9d8f">${f(totalRevenue)}</div><div class="l">Total recaudado</div></div>
    <div class="box"><div class="v" style="color:#e76f51">${f(totalFees)}</div><div class="l">En domicilios</div></div>
  </div>
  <table>
    <thead><tr><th>#</th><th>Pedido</th><th>Cliente</th><th>Items</th><th>Domiciliario</th><th>Pago</th><th>Valor</th><th>Domicilio</th><th>Total</th></tr></thead>
    <tbody>${rows}</tbody>
  </table>
  <div class="footer">
    Generado por DeliStars · ${new Date().toLocaleString('es-CO')} · Total domicilios: ${f(totalFees)}
  </div>
  <script>window.onload=()=>window.print()</script>
  </body></html>`

  const win = window.open('', '_blank', 'width=960,height=720')
  if (win) { win.document.write(html); win.document.close() }
}

// ─── Entregados summary ───────────────────────────────────────────────────────
function EntregadosSummary({ orders, sedeName, fecha }) {
  const cashOrders    = orders.filter(o => o.cashOnDelivery || o.payment === 'Efectivo' || o.payment === 'Mixto')
  const digitalOrders = orders.filter(o => !o.cashOnDelivery && o.payment !== 'Efectivo' && o.payment !== 'Mixto')
  const totalRevenue  = orders.reduce((s, o) => s + (o.totalPrice || 0), 0)
  const totalFees     = orders.reduce((s, o) => s + (o.deliveryPrice || 0), 0)

  return (
    <div className="mx-4 mt-3 bg-gradient-to-r from-cherry/10 to-tangelo/10 border border-cherry/20 rounded-2xl p-4 flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <p className="font-display text-base tracking-wide text-coal">Resumen del día</p>
        <button
          onClick={() => exportarPDF(orders, fecha, sedeName)}
          className="flex items-center gap-1.5 text-xs font-body font-semibold text-cherry border border-cherry/30 rounded-lg px-3 py-1.5 hover:bg-cherry/10 transition-colors"
        >
          📄 Exportar PDF
        </button>
      </div>
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

// ─── Driver tracking modal ────────────────────────────────────────────────────
function DriverTrackingModal({ orders, drivers, sede, onClose }) {
  const [driverLocations, setDriverLocations] = useState([])
  const [selectedDriver, setSelectedDriver] = useState(null)

  useEffect(() => {
    if (!sede?.id) return
    const q = query(
      collection(db, 'driver_locations'),
      where('sedeId', '==', sede.id),
      where('active', '==', true)
    )
    return onSnapshot(q, snap => {
      setDriverLocations(snap.docs.map(d => ({ id: d.id, ...d.data() })))
    })
  }, [sede])

  const activeOrders = orders.filter(o => ['accepted', 'in_transit', 'arrived'].includes(o.status))

  // Construir mapa de drivers desde pedidos activos y GPS
  const driverMap = {}

  activeOrders.forEach(o => {
    const key = o.driverEmail || o.driverName || 'unknown'
    if (!driverMap[key]) driverMap[key] = { name: o.driverName || o.driverEmail || 'Domiciliario', orders: [], locData: null, phone: null }
    driverMap[key].orders.push(o)
  })

  driverLocations.forEach(loc => {
    const key = loc.driverEmail
    if (!driverMap[key]) driverMap[key] = { name: loc.driverName || loc.driverEmail || 'Domiciliario', orders: [], locData: null, phone: null }
    driverMap[key].locData = loc
  })

  // Asegurar que todos los domiciliarios registrados aparezcan
  drivers.forEach(d => {
    const key = d.id
    if (!driverMap[key]) driverMap[key] = { name: d.name || d.id, orders: [], locData: null, phone: null }
    if (d.phone) driverMap[key].phone = d.phone
  })

  const driverList = Object.entries(driverMap).map(([key, val]) => ({ key, ...val }))

  const fmtAgo = ts => {
    if (!ts?.toDate) return null
    const mins = Math.floor((Date.now() - ts.toDate().getTime()) / 60000)
    if (mins < 1) return 'hace menos de 1 min'
    if (mins < 60) return `hace ${mins} min`
    return `hace ${Math.floor(mins / 60)}h ${mins % 60}m`
  }

  const fmtAgoMs = ms => {
    if (!ms) return null
    const mins = Math.floor((Date.now() - ms) / 60000)
    if (mins < 1) return 'hace menos de 1 min'
    if (mins < 60) return `hace ${mins} min`
    return `hace ${Math.floor(mins / 60)}h ${mins % 60}m`
  }

  const activeDriver = selectedDriver ? driverList.find(d => d.key === selectedDriver) : null

  const renderDriverDetail = (driver) => {
    const ordersWithPos = driver.orders
      .filter(o => o.driverLat && o.driverLng)
      .sort((a, b) => (b.driverUpdatedAt?.seconds || 0) - (a.driverUpdatedAt?.seconds || 0))
    const latestOrderPos = ordersWithPos[0]
    const locLat = driver.locData?.lat
    const locLng = driver.locData?.lng
    const locTs  = driver.locData?.updatedAt
    const orderTsMs  = latestOrderPos?.driverUpdatedAt?.seconds ? latestOrderPos.driverUpdatedAt.seconds * 1000 : 0
    const locTsMs    = locTs?.toDate ? locTs.toDate().getTime() : (driver.locData?.ts || 0)
    const useLocData = locLat && (!latestOrderPos || locTsMs > orderTsMs)
    const lat = useLocData ? locLat : latestOrderPos?.driverLat
    const lng = useLocData ? locLng : latestOrderPos?.driverLng
    const hasPos = lat && lng
    const isOnRoute = driver.orders.length > 0

    return (
      <div className="p-4 flex flex-col gap-4">
        {/* Back button */}
        <button onClick={() => setSelectedDriver(null)}
          className="flex items-center gap-1.5 text-sm font-body text-coal/50 hover:text-coal w-fit">
          <ChevronRight size={14} className="rotate-180" /> Todos los domiciliarios
        </button>

        <div className={`card flex flex-col gap-3 ${isOnRoute ? 'border border-mint/20' : 'border border-coal/10'}`}>
          {/* Driver name + status */}
          <div className="flex items-center gap-3">
            <div className={`w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0 ${isOnRoute ? 'bg-mint/15' : 'bg-smoked'}`}>
              <Bike size={18} className={isOnRoute ? 'text-mint' : 'text-coal/40'} />
            </div>
            <div className="flex-1">
              <p className="font-display text-base tracking-wide text-coal">{driver.name}</p>
              <p className={`font-body text-xs ${isOnRoute ? 'text-mint' : driver.locData ? 'text-mustard' : 'text-coal/40'}`}>
                {isOnRoute
                  ? `${driver.orders.length} pedido${driver.orders.length !== 1 ? 's' : ''} en curso`
                  : driver.locData ? '📡 Compartiendo ubicación' : 'Sin actividad'}
              </p>
            </div>
          </div>

          {/* Contact buttons */}
          {driver.phone && (
            <div className="flex gap-2">
              <a href={`tel:${driver.phone}`}
                className="flex-1 flex items-center justify-center gap-1.5 py-2.5 rounded-xl border-2 border-coal/20 text-coal/70 text-sm font-semibold font-body hover:bg-smoked transition-colors">
                <Phone size={15} /> Llamar
              </a>
              <a href={`https://wa.me/57${driver.phone}`} target="_blank" rel="noreferrer"
                className="flex-1 flex items-center justify-center gap-1.5 py-2.5 rounded-xl border-2 border-[#25D366]/40 text-[#25D366] text-sm font-semibold font-body hover:bg-[#25D366]/10 transition-colors">
                <MessageCircle size={15} /> WhatsApp
              </a>
            </div>
          )}

          {/* Pedidos activos */}
          {driver.orders.length > 0 && (
            <div className="flex flex-col gap-2">
              {driver.orders.map(o => (
                <div key={o.id} className="bg-smoked/50 rounded-xl px-3 py-2.5">
                  <div className="flex items-center gap-2 mb-1">
                    {o.orderNumber && <span className="font-display text-sm text-cherry">#{o.orderNumber}</span>}
                    <StatusBadge status={o.status} />
                  </div>
                  <p className="font-body text-xs text-coal/70 truncate">👤 {o.name}</p>
                  <p className="font-body text-xs text-coal/50 truncate mt-0.5">📍 {o.fullAddress}</p>
                </div>
              ))}
            </div>
          )}

          {/* Ubicación */}
          {hasPos ? (
            <div className="flex flex-col gap-2">
              <p className="font-body text-xs text-coal/40 text-center">
                📡 Ubicación actualizada {useLocData ? fmtAgoMs(locTsMs) : fmtAgo(latestOrderPos?.driverUpdatedAt)}
              </p>
              <div className="flex gap-2">
                <a href={`https://www.google.com/maps/search/?api=1&query=${lat},${lng}`}
                  target="_blank" rel="noreferrer"
                  className="flex-1 flex items-center justify-center gap-1.5 py-2.5 rounded-xl border-2 border-mint/40 text-mint text-sm font-semibold font-body hover:bg-mint/10 transition-colors">
                  <Navigation size={15} /> Google Maps
                </a>
                <a href={`https://waze.com/ul?ll=${lat},${lng}&navigate=yes`}
                  target="_blank" rel="noreferrer"
                  className="flex-1 flex items-center justify-center gap-1.5 py-2.5 rounded-xl border-2 border-coal/20 text-coal/60 text-sm font-semibold font-body hover:bg-smoked transition-colors">
                  <ExternalLink size={15} /> Waze
                </a>
              </div>
            </div>
          ) : (
            <div className="bg-coal/5 rounded-xl px-4 py-3 text-center">
              <p className="font-body text-xs text-coal/50">📍 Sin ubicación aún</p>
              <p className="font-body text-[10px] text-coal/30 mt-0.5">
                GPS se activa al iniciar entrega o al activar GPS en la app
              </p>
            </div>
          )}
        </div>
      </div>
    )
  }

  return (
    <div className="fixed inset-0 z-[60] flex items-end sm:items-center justify-center bg-coal/50 backdrop-blur-sm animate-fade-in"
      onClick={e => { if (e.target === e.currentTarget) onClose() }}>
      <div className="bg-cream w-full max-w-lg rounded-t-3xl sm:rounded-3xl max-h-[90dvh] overflow-y-auto scroll-custom animate-scale-in">

        {/* Header */}
        <div className="sticky top-0 bg-gradient-to-r from-mint to-mustard px-5 py-5 rounded-t-3xl flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Navigation size={20} className="text-cream" />
            <div>
              <p className="font-display text-xl text-cream tracking-wide">
                {activeDriver ? activeDriver.name : 'Domiciliarios'}
              </p>
              <p className="font-body text-xs text-cream/70">
                {activeDriver ? 'Seleccionado' : `${driverList.length} domiciliario${driverList.length !== 1 ? 's' : ''} registrado${driverList.length !== 1 ? 's' : ''}`}
              </p>
            </div>
          </div>
          <button onClick={onClose} className="text-cream/70 hover:text-cream"><X size={22} /></button>
        </div>

        {/* Driver detail view */}
        {activeDriver ? renderDriverDetail(activeDriver) : (
          <div className="p-4 flex flex-col gap-2">
            <p className="font-body text-xs text-coal/40 uppercase tracking-wider mb-1">Selecciona un domiciliario</p>
            {driverList.map((driver) => {
              const isOnRoute = driver.orders.length > 0
              const hasGps = !!driver.locData
              return (
                <button key={driver.key} onClick={() => setSelectedDriver(driver.key)}
                  className="flex items-center gap-3 bg-smoked/40 hover:bg-smoked rounded-2xl px-4 py-3 transition-colors text-left w-full">
                  <div className={`w-9 h-9 rounded-full flex items-center justify-center flex-shrink-0 ${isOnRoute ? 'bg-mint/15' : hasGps ? 'bg-mustard/15' : 'bg-coal/8'}`}>
                    <Bike size={16} className={isOnRoute ? 'text-mint' : hasGps ? 'text-mustard' : 'text-coal/40'} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-display text-sm tracking-wide text-coal truncate">{driver.name}</p>
                    <p className={`font-body text-xs truncate ${isOnRoute ? 'text-mint' : hasGps ? 'text-mustard' : 'text-coal/40'}`}>
                      {isOnRoute
                        ? `${driver.orders.length} pedido${driver.orders.length !== 1 ? 's' : ''} en curso`
                        : hasGps ? '📡 Compartiendo GPS' : 'Sin actividad'}
                    </p>
                  </div>
                  {driver.phone && <Phone size={13} className="text-coal/30 flex-shrink-0" />}
                  <ChevronRight size={16} className="text-coal/30 flex-shrink-0" />
                </button>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}

// ─── Cuadre de turno modal ────────────────────────────────────────────────────
function CuadreTurnoModal({ orders, drivers, onClose }) {
  const [selectedDriver, setSelectedDriver] = useState('')

  const completedToday = orders.filter(o =>
    ([...COMPLETE_STATUSES, 'pending_cuadre']).includes(o.status) && isToday(o.createdAt)
  )

  const filtered = selectedDriver
    ? completedToday.filter(o => o.driverEmail === selectedDriver)
    : completedToday

  const cashOrders    = filtered.filter(o => o.cashOnDelivery || o.payment === 'Efectivo' || o.payment === 'Mixto')
  const cashPending   = cashOrders.filter(o => o.status === 'pending_cuadre')
  const totalCash     = cashOrders.reduce((s, o) => s + cashAmount(o), 0)

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
                  <span className="font-body font-semibold text-sm">Total efectivo:</span>
                  <span className="font-display text-2xl text-mustard">{fmt(totalCash)}</span>
                </div>
                {cashPending.length > 0 && (
                  <div className="bg-cherry/10 rounded-xl px-4 py-2 flex items-center justify-between mt-1">
                    <span className="font-body text-xs text-coal/60">Pendiente de recibir ({cashPending.length}):</span>
                    <span className="font-display text-base text-cherry">{fmt(cashPending.reduce((s, o) => s + cashAmount(o), 0))}</span>
                  </div>
                )}
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
      { type: 'tip', text: 'Se abre y cierra sola todos los días (5:30 PM – 11:30 PM). Úsalo solo si necesitas prenderla antes o apagarla antes por algo puntual.' },
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
