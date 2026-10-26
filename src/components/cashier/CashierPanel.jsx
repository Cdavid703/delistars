import { useState, useEffect, useRef, useCallback } from 'react'
import { LogoWhatsApp, LogoGoogleMaps, LogoWaze } from '../common/LogosApps'
import { textoDeMensaje } from '../../utils/fotos'
import {
  collection, onSnapshot, query, where,
  serverTimestamp, doc, setDoc, updateDoc, getDocs
} from 'firebase/firestore'
import { db } from '../../services/firebase'
import DevolucionesSaldo from './DevolucionesSaldo'
import Reclamos from './Reclamos'
import CuadresEfectivo from '../common/CuadresEfectivo'
import EstadoDomiciliarios from './EstadoDomiciliarios'
import CampanaAvisos from '../common/CampanaAvisos'
import PuestoCaja from './PuestoCaja'
import usePuestoCaja from '../../hooks/usePuestoCaja'
import ImpresoraCaja from './ImpresoraCaja'
import { useAuth } from '../../contexts/AuthContext'
import { DEFAULT_DRIVERS, DEFAULT_DRIVER_NAMES, SEDES } from '../../services/roles'
import { estadoSede, textoEstado } from '../../utils/horarios'
import { cashAmount } from '../../utils/payments'
import { sonar, sonarMensaje, crearAlarma, sonidoDeEstado } from '../../utils/sonidos'
import BotonSilencio from '../common/BotonSilencio'
import BotonPushEquipo from '../common/BotonPushEquipo'
import Logo from '../common/Logo'
import RoleSwitcher from '../common/RoleSwitcher'
import OrderCard from './OrderCard'
import TableroCaja from './TableroCaja'
import ChipEstado from './ChipEstado'
import AgotadosCaja from './AgotadosCaja'
import useAgotados from '../../hooks/useAgotados'
import { porAsignar } from '../../utils/tableroCaja'
import PedidoCaja from './PedidoCaja'
import OrderDetail from './OrderDetail'
import AssignDeliveryDetail from './AssignDeliveryDetail'
import StatusBadge from '../common/StatusBadge'
import { DEVOLUCION_PENDIENTE_CAJA } from '../../utils/devolucion'
import { format } from 'date-fns'
import { es } from 'date-fns/locale'
import {
  Plus, LogOut, Users, MapPin, Power, BellRing, HelpCircle,
  ChevronDown, ChevronUp, BookOpen, X,
  Calculator, Search, Bike, PackageX, Navigation, Phone, MessageCircle, ChevronRight, Pencil, Check,
  Banknote, ShoppingBag, CircleCheck, Ban, FileText, ClipboardList, Tag, Lightbulb
} from 'lucide-react'

/** Medianoche siguiente en Colombia (UTC-5), en ISO: fin del "por hoy". */
function finDelDiaColombia() {
  const d = new Date(Date.now() - 5 * 3600 * 1000)
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() + 1, 5, 0, 0)).toISOString()
}

const TABS = [
  { id: 'active',    label: 'Activos' },
  { id: 'cuadre',   label: 'Cuadre' },
  { id: 'completed', label: 'Entregados' },
  { id: 'reclamos',  label: 'Reclamos' },
]

const ACTIVE_STATUSES   = ['pending', 'assigned', 'accepted', 'preparing', 'in_transit', 'arrived']
const CUADRE_STATUSES   = ['pending_cuadre']
const COMPLETE_STATUSES = ['completed', 'rejected', 'delivered_paid', 'delivered_cash']

const isToday = ts => {
  if (!ts?.toDate) return false
  return ts.toDate().toDateString() === new Date().toDateString()
}

const fmt = v => (v !== undefined && v !== null && v !== '') ? `$${Number(v).toLocaleString('es-CO')}` : '—'

// El audio vive en utils/sonidos.js: un solo contexto compartido por los tres
// paneles, con una melodía distinta por evento. Antes cada panel creaba el suyo,
// y varios contextos abiertos hacen que el navegador deje de sonar del todo.
const alarm = crearAlarma()

export default function CashierPanel() {
  const { user, sede, logout, selectSede } = useAuth()
  const esAdminReclamos = useAuth().role === 'admin'
  const [tab,             setTab]            = useState('active')
  // Computador (≥1280 px): «Activos» se ve como tablero por etapa.
  const [ancho, setAncho] = useState(() => typeof window !== 'undefined' && window.matchMedia('(min-width: 1280px)').matches)
  useEffect(() => {
    const mq = window.matchMedia('(min-width: 1280px)')
    const cambio = () => setAncho(mq.matches)
    mq.addEventListener('change', cambio)
    return () => mq.removeEventListener('change', cambio)
  }, [])
  // Reloj de la caja: la demora de cada tarjeta se actualiza cada 30 s.
  const [ahora, setAhora] = useState(() => Date.now())
  useEffect(() => { const t = setInterval(() => setAhora(Date.now()), 30000); return () => clearInterval(t) }, [])
  const [reclamosAbiertos, setReclamosAbiertos] = useState(0)
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
  // Horario de la(s) sede(s). Administración define el horario semanal; la caja
  // puede abrir o cerrar a mano hasta el final del día (config/horarios.<sede>.manual).
  const [horarios, setHorarios] = useState(undefined)
  const [cambiandoSede, setCambiandoSede] = useState(null)
  const [ahoraMin, setAhoraMin] = useState(() => Date.now())
  const [newOrderAlert,   setNewOrderAlert]  = useState(null)
  // Aviso cuando un CLIENTE cancela un pedido que la caja tenía activo — sin
  // esto el pedido "desaparece" de Activos sin explicación y la caja queda
  // buscándolo (pasó en producción el mismo día que se habilitó cancelar).
  const [cancelAlert,     setCancelAlert]    = useState(null)
  const prevStatusRef = useRef(new Map())
  const [alarmActive,     setAlarmActive]    = useState(false)
  const [showManual,      setShowManual]     = useState(false)
  const [showAgotados,    setShowAgotados]   = useState(false)
  // Buscar un pedido de hoy por número, nombre o teléfono (entrega en sede por número, §10.1).
  const [buscar,          setBuscar]         = useState('')
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
    const unsub = onSnapshot(doc(db, 'config', 'horarios'),
      snap => setHorarios(snap.exists() ? snap.data() : null),
      () => setHorarios(null))
    const id = setInterval(() => setAhoraMin(Date.now()), 60000)
    return () => { unsub(); clearInterval(id) }
  }, [])
  const sedesHorario = sede?.id && SEDES[sede.id] ? [SEDES[sede.id]] : Object.values(SEDES)

  // Abrir/cerrar a mano hasta el final del día (medianoche de Colombia): al día
  // siguiente vuelve sola a su horario. modo null = volver al horario ya.
  const cambiarApertura = async (sedeId, modo) => {
    const hasta = finDelDiaColombia()
    setCambiandoSede(sedeId)
    try {
      await setDoc(doc(db, 'config', 'horarios'), {
        [sedeId]: { manual: modo ? { modo, hasta, por: user?.email || '' } : null },
        actualizadoPor: user?.email || '',
        actualizadoAt: serverTimestamp(),
      }, { merge: true })
    } catch (e) {
      console.error('No se pudo cambiar la apertura:', e)
      alert('No se pudo cambiar el estado de la sede. Intenta de nuevo.')
    } finally {
      setCambiandoSede(null)
    }
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
      if (prev !== undefined && count > prev && !played) { sonarMensaje(); played = true }
      clientMsgCountRef.current[o.id] = count
    })
  }, [orders])

  // Caja con varios aparatos (Fase 6): solo suena el principal; "Visto" queda
  // en el pedido y calla la alarma en todos. Visto no es aceptar.
  const puesto = usePuestoCaja(sede?.id, user?.email)
  const suenaRef = useRef(true)
  const alarmaMaxRef = useRef(180000)
  const ordersRef = useRef([])
  useEffect(() => { suenaRef.current = puesto.suena; if (!puesto.suena) alarm.stop() }, [puesto.suena])
  useEffect(() => onSnapshot(doc(db, 'config', 'caja'), (s) => {
    const seg = Number(s.data()?.alarmaMaxSeg)
    alarmaMaxRef.current = seg >= 15 && seg <= 1800 ? seg * 1000 : 180000
  }, () => {}), [])

  const dismissAlert = useCallback(() => {
    alarm.stop(); setAlarmActive(false); setNewOrderAlert(null)
    // Visto para todos los aparatos: los pedidos nuevos que aún nadie había visto.
    ordersRef.current.filter(o => o.status === 'pending' && !o.vistoPorCaja).forEach(o => {
      updateDoc(doc(db, 'orders', o.id), { vistoPorCaja: { at: serverTimestamp(), por: user?.email || '' } }).catch(() => {})
    })
  }, [user?.email])

  // Marca los mensajes del cliente como vistos. Se usa al abrir el pedido por
  // cualquier vía (detalle o pantalla de asignación), porque en ambas se puede
  // leer y responder el chat.
  const markChatSeen = (orderId) => {
    const o = orders.find(x => x.id === orderId)
    if (!o) return
    const count = (o.clientMessages || []).filter(m => m.role === 'client').length
    const updated = { ...cashierSeenCounts, [orderId]: count }
    setCashierSeenCounts(updated)
    try { localStorage.setItem('ds_cashier_chat_seen', JSON.stringify(updated)) } catch {}
  }

  const openAssign = (order) => {
    if (!order) return
    markChatSeen(order.id)
    setAssigning(order)
  }

  const openOrderDetail = (orderId) => {
    if (!orderId) return
    markChatSeen(orderId)
    setSelectedId(orderId)
  }

  // Marcar/desmarcar un pedido como facturado (ingresado al sistema de
  // facturación). Aplica a cualquier pedido, sin importar el medio de pago.
  // Cualquier cajero puede prenderlo y apagarlo; se guarda quién y cuándo.
  const toggleFacturado = async (order) => {
    if (!order?.id) return
    const nuevo = !order.facturado
    try {
      await updateDoc(doc(db, 'orders', order.id), {
        facturado:     nuevo,
        facturadoBy:   nuevo ? user.email : null,
        facturadoAt:   nuevo ? serverTimestamp() : null,
        updatedAt:     serverTimestamp(),
      })
    } catch (e) {
      console.error('No se pudo actualizar facturado', e)
    }
  }

  // Mapa de mensajes no leídos por pedido (mensajes del cliente que el cajero no ha visto)
  const unreadChatMap = Object.fromEntries(
    orders.map(o => {
      const clientMsgs = (o.clientMessages || []).filter(m => m.role === 'client').length
      return [o.id, Math.max(0, clientMsgs - (cashierSeenCounts[o.id] || 0))]
    })
  )
  const totalUnreadChat = Object.values(unreadChatMap).reduce((s, n) => s + n, 0)
  // Pedidos con mensajes del cliente sin leer, sin importar en qué pestaña
  // estén: el aviso debe llevar al pedido aunque no sea la pestaña actual.
  const ordersConMensajes = orders
    .filter(o => (unreadChatMap[o.id] || 0) > 0)
    .sort((a, b) => (b.createdAt?.seconds ?? 0) - (a.createdAt?.seconds ?? 0))

  // Devoluciones que le tocan a la caja (de cualquier día: una devolución
  // pendiente no se puede perder porque el pedido era de ayer).
  const devolucionesPendientes = orders
    .filter(o => DEVOLUCION_PENDIENTE_CAJA.includes(o.devolucion?.estado) || o.saldoAplicado?.porDevolver)
    .sort((a, b) => (a.createdAt?.seconds ?? 0) - (b.createdAt?.seconds ?? 0))

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
            if (!o.vistoPorCaja) {
              // Solo suena el aparato principal (o todos si no hay uno conectado).
              if (suenaRef.current) alarm.play(alarmaMaxRef.current)
              setAlarmActive(true); setNewOrderAlert(o)
            }
          }
        })
      }

      // Si ya no queda ningún pedido nuevo SIN VER (o por cotizar), la alarma
      // y el aviso se apagan solos en todos los aparatos: alguien tocó "Visto"
      // en otro aparato o ya lo cotizaron desde la lista.
      const sinVer = pendingDocs.filter(o => !o.vistoPorCaja)
      if (sinVer.length === 0) {
        alarm.stop()
        setAlarmActive(false)
        setNewOrderAlert(null)
      } else {
        // El aviso apuntaba a un pedido que ya se vio o se cotizó: se cierra.
        setNewOrderAlert(prev =>
          prev && !sinVer.some(o => o.id === prev.id) ? null : prev)
      }

      // Cliente canceló un pedido que estaba en curso → avisar a la caja.
      // (En la primera carga solo se toma la foto de estados, sin avisar.)
      const ACTIVE_BEFORE_CANCEL = ['pending', 'quoted', 'assigned', 'accepted', 'preparing']
      const firstLoad = prevStatusRef.current.size === 0 && docs.length > 0
      let sonóCambio = false
      docs.forEach(o => {
        const prev = prevStatusRef.current.get(o.id)
        const cambió = !firstLoad && prev && prev !== o.status
        if (cambió && o.status === 'cancelled' && ACTIVE_BEFORE_CANCEL.includes(prev)) {
          sonar('cancelado')
          setCancelAlert(o)
          sonóCambio = true
        } else if (cambió && !sonóCambio) {
          // Lo que antes pasaba callado: el domiciliario aceptó, entregó o
          // rechazó. La caja se enteraba solo si estaba mirando la lista.
          const cual = sonidoDeEstado('caja', o.status)
          if (cual) { sonar(cual); sonóCambio = true }
        }
        prevStatusRef.current.set(o.id, o.status)
      })

      ordersRef.current = docs
      setOrders(docs)
    })
  }, [sede])

  // Derivar el pedido seleccionado desde el array en vivo (así el modal refleja cambios en tiempo real)
  const selected = selectedId ? orders.find(o => o.id === selectedId) ?? null : null
  // Igual que `selected`: se toma la versión EN VIVO del pedido que se está
  // asignando, para que el chat con el cliente se actualice ahí mismo si el
  // cliente escribe mientras la caja tiene abierta esta pantalla.
  const assigningLive = assigning ? (orders.find(o => o.id === assigning.id) ?? assigning) : null

  useEffect(() => () => alarm.stop(), [])

  // Lista de domiciliarios EN VIVO: si el admin corrige/agrega uno mientras la
  // caja tiene la app abierta, la lista se actualiza sola. Antes se cargaba una
  // única vez al montar y una corrección de correo dejaba a la caja asignando
  // pedidos al correo viejo (el domiciliario no los veía) hasta refrescar.
  useEffect(() => {
    return onSnapshot(collection(db, 'roles_drivers'), snap => {
      const firestoreDrivers = snap.docs.map(d => ({
        id: d.id, ...d.data(),
        phone: d.data().phone || null,
      }))
      const firestoreIds = firestoreDrivers.map(d => d.id)
      const defaultDriverObjs = DEFAULT_DRIVERS
        .filter(email => !firestoreIds.includes(email))
        .map(email => ({ id: email, name: DEFAULT_DRIVER_NAMES[email] || email, phone: null }))
      setDrivers([...defaultDriverObjs, ...firestoreDrivers])
    }, () => {})
  }, [])

  const busqueda = buscar.trim()
  const coincide = (o) => {
    const dig = busqueda.replace(/\D/g, '')
    if (dig && dig.length <= 4) return String(o.orderNumber || '').replace(/^0+/, '') === dig.replace(/^0+/, '')
    if (dig.length >= 5) return String(o.phone || '').replace(/\D/g, '').includes(dig)
    const t = busqueda.toLowerCase()
    return String(o.name || o.clientName || '').toLowerCase().includes(t)
  }
  const filteredOrders = busqueda ? orders.filter(o => isToday(o.createdAt) && coincide(o)) : orders.filter(o => {
    // Los cotizados también son activos: los de recoger siguen hasta la entrega y
    // los domicilios sin domiciliario muestran «Asignar» en su tarjeta (antes
    // vivían en una pestaña aparte y el tablero no los veía).
    if (tab === 'active')    return (ACTIVE_STATUSES.includes(o.status) || o.status === 'quoted') && isToday(o.createdAt)
    if (tab === 'cuadre')    return CUADRE_STATUSES.includes(o.status) && isToday(o.createdAt)
    if (tab === 'completed') {
      // Los cancelados por el cliente también se listan aquí (como cancelado) para
      // que no "desaparezcan" sin rastro; se excluyen de las sumas del día.
      if (!COMPLETE_STATUSES.includes(o.status) && o.status !== 'cancelled') return false
      const target = historyDate ? new Date(historyDate + 'T00:00:00') : new Date()
      if (!o.createdAt?.toDate) return false
      return o.createdAt.toDate().toDateString() === target.toDateString()
    }
    return false
  })

  const pendingCount  = orders.filter(o => o.status === 'pending'                    && isToday(o.createdAt)).length
  const sinDomiciliario = orders.filter(o => porAsignar(o) && isToday(o.createdAt))
  const agotados = useAgotados(sede?.id)
  const cuadreCount   = orders.filter(o => CUADRE_STATUSES.includes(o.status)        && isToday(o.createdAt)).length

  const handleAddDriver = async () => {
    if (!newDriverEmail.trim()) return
    const email = newDriverEmail.trim().toLowerCase()
    try {
      await setDoc(doc(db, 'roles_drivers', email), {
        email, name: newDriverName.trim() || email,
        phone: newDriverPhone.trim() || null,
        addedBy: user.email, addedAt: serverTimestamp(),
      })
      setDriverMsg(`${email} agregado como domiciliario`)
      setNewDriverEmail(''); setNewDriverName(''); setNewDriverPhone('')
      const snap = await getDocs(collection(db, 'roles_drivers'))
      const fd = snap.docs.map(d => ({ id: d.id, ...d.data() }))
      const fids = fd.map(d => d.id)
      setDrivers([
        ...DEFAULT_DRIVERS.filter(e => !fids.includes(e)).map(e => ({ id: e, name: DEFAULT_DRIVER_NAMES[e] || e })),
        ...fd,
      ])
    } catch { setDriverMsg('No se pudo agregar el domiciliario') }
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
    } catch { setDriverMsg('No se pudo actualizar el teléfono') }
  }

  return (
    <div className="min-h-screen-safe xl:h-dvh xl:min-h-0 flex flex-col bg-gradient-soft">
      {/* Header */}
      <header className="page-header gap-2">
        <div className="flex items-center gap-2 min-w-0">
          <Logo variant="light" size="md" className="flex-shrink-0 xl:h-14" />
          <div className="min-w-0">
            <p className="font-display text-base text-coal tracking-wide leading-tight">
              {user?.displayName?.split(' ')[0] || user?.email?.split('@')[0] || 'Cajero'}
            </p>
            <div className="flex items-center gap-1.5 mt-0.5">
              <span className="font-body text-[10px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded-full bg-tangelo/15 text-tangelo">Cajero</span>
              <p className="font-body text-xs text-coal/50 truncate">{sede?.name}</p>
            </div>
          </div>
        </div>
        <div className="flex items-center gap-1.5 flex-wrap justify-end">
          <button onClick={() => setShowCuadreTurno(true)} title="Cuadre de turno"
            className="btn-icon text-coal/60 hover:text-mustard flex items-center gap-1 px-2 w-auto min-w-11">
            <Calculator size={18} />
            <span className="font-body text-xs font-semibold hidden sm:inline">Cuadre</span>
          </button>
          <RoleSwitcher />
          <button onClick={() => setShowAgotados(true)} title="Productos agotados en esta sede"
            className="btn-icon text-coal/60 hover:text-pepper flex items-center gap-1 px-2 w-auto min-w-11">
            <PackageX size={18} />
            <span className="font-body text-xs font-semibold hidden sm:inline">Agotados</span>
          </button>
          <button onClick={() => setShowManual(true)} className="btn-icon text-coal/60 hover:text-cherry flex items-center gap-1 px-2 w-auto min-w-11">
            <BookOpen size={18} />
            <span className="font-body text-xs font-semibold hidden sm:inline">Manual</span>
          </button>
          <button onClick={() => setShowTracking(true)} title="Ver ubicación domiciliarios"
            className="btn-icon text-coal/60 hover:text-mint relative flex items-center gap-1 px-2 w-auto min-w-11">
            <Navigation size={20} />
            <span className="font-body text-xs font-semibold hidden xl:inline">Mapa</span>
            {orders.filter(o => ['accepted','in_transit','arrived'].includes(o.status)).length > 0 && (
              <span className="absolute -top-0.5 -right-0.5 w-2.5 h-2.5 rounded-full bg-mint animate-pulse" />
            )}
          </button>
          <button onClick={() => setAddDriver(v => !v)} className="btn-icon flex items-center gap-1 px-2 w-auto min-w-11" title="Gestionar domiciliarios">
            <Users size={20} />
            <span className="font-body text-xs font-semibold hidden xl:inline">Domiciliarios</span>
          </button>
          <button onClick={() => selectSede(null)} className="btn-icon flex items-center gap-1 px-2 w-auto min-w-11" title="Cambiar sede">
            <MapPin size={20} />
            <span className="font-body text-xs font-semibold hidden xl:inline">Sede</span>
          </button>
          <button onClick={logout} className="btn-icon flex items-center gap-1 px-2 w-auto min-w-11" title="Cerrar sesión">
            <LogOut size={20} />
            <span className="font-body text-xs font-semibold hidden xl:inline">Salir</span>
          </button>
        </div>
      </header>

      {/* Estado del sonido — que la caja NUNCA se entere de que el audio está
          bloqueado por haber perdido un pedido. */}
      {/* En computador, sonido/avisos y la apertura de la sede van en una sola fila. */}
      <div className="xl:flex xl:items-center xl:gap-4 xl:mx-4">
      <div className="mx-4 xl:mx-0 mt-2 flex items-center gap-2 flex-wrap">
        <BotonSilencio />
        <BotonPushEquipo email={user?.email} rol="cashier" sedeId={sede?.id} />
        {/* Avisos de la caja de la sede (compartidos: lo que uno marca, lo ven todos) y los propios */}
        <CampanaAvisos
          destinos={[...(sede?.id === 'all' ? ['caja_santa_lucia', 'caja_santa_teresita'] : [sede?.id && `caja_${sede.id}`]), user?.email?.toLowerCase()]}
          onAbrirPedido={(id) => openOrderDetail(id)} />
      </div>

      {/* Estado de la sede para clientes y apertura/cierre a mano (hasta el final del día) */}
      {horarios !== undefined && (
        <div className="mx-4 xl:mx-0 xl:ml-auto mt-2 flex flex-wrap gap-2">
          {sedesHorario.map(s => {
            const e = estadoSede(horarios?.[s.id], ahoraMin)
            const ocupado = cambiandoSede === s.id
            return (
              <div key={s.id} className="flex items-center gap-2 flex-wrap">
                <div className={`flex items-center gap-2 rounded-full px-4 py-2 w-fit text-xs font-semibold font-body ${
                  e.abierta ? 'bg-mint/15 text-mint' : 'bg-coal/10 text-coal/50'}`}>
                  <Power size={12} />
                  {sedesHorario.length > 1 ? `${s.name}: ` : <span className="hidden sm:inline">Pedidos de clientes:&nbsp;</span>}{textoEstado(e, ahoraMin)}
                  {e.motivo === 'manual' && ' · a mano'}
                </div>
                <button disabled={ocupado} onClick={() => cambiarApertura(s.id, e.abierta ? 'cerrada' : 'abierta')}
                  className={`rounded-full px-4 py-2 text-xs font-semibold font-body text-white disabled:opacity-50 ${
                    e.abierta ? 'bg-coal' : 'bg-mint'}`}>
                  {e.abierta ? 'Cerrar' : 'Abrir'} por hoy
                </button>
                {e.motivo === 'manual' && (
                  <button disabled={ocupado} onClick={() => cambiarApertura(s.id, null)}
                    className="rounded-full px-4 py-2 text-xs font-semibold font-body border border-coal/20 text-coal/70 disabled:opacity-50">
                    Volver al horario
                  </button>
                )}
              </div>
            )
          })}
        </div>
      )}
      </div>

      {/* Driver management panel */}
      {addDriver && (
        <div className="mx-4 mt-3 card border border-mint/30 animate-fade-in">
          <p className="font-display text-base tracking-wide text-coal mb-3 flex items-center gap-2">
            <Bike size={18} className="text-mint" aria-hidden="true" /> Gestionar domiciliarios</p>

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
      <div className="flex items-center border-b border-coal/10 bg-cream/80 px-2 mt-2 overflow-x-auto">
        {TABS.map(t => (
          <button key={t.id} onClick={() => setTab(t.id)}
            className={`${tab === t.id ? 'tab-btn-active' : 'tab-btn-inactive'} whitespace-nowrap px-2`}>
            {t.label}
            {t.id === 'reclamos' && reclamosAbiertos > 0 && (
              <span key={reclamosAbiertos} className="ml-1 bg-tangelo text-cream text-[10px] font-bold px-1.5 py-0.5 rounded-full inline-block animate-pop">{reclamosAbiertos}</span>
            )}
            {t.id === 'active'  && pendingCount > 0 && (
              <span key={pendingCount} className="ml-1 bg-cherry text-cream text-[10px] font-bold px-1.5 py-0.5 rounded-full inline-block animate-pop">{pendingCount}</span>
            )}
            {t.id === 'active'  && totalUnreadChat > 0 && (
              <span className="ml-1 bg-cherry text-cream text-[10px] font-bold px-1.5 py-0.5 rounded-full flex items-center gap-0.5">
                <MessageCircle size={8} />{totalUnreadChat}
              </span>
            )}
            {t.id === 'cuadre' && cuadreCount  > 0 && (
              <span className="ml-1 bg-mustard text-coal text-[10px] font-bold px-1.5 py-0.5 rounded-full">{cuadreCount}</span>
            )}
          </button>
        ))}
        <label className="relative ml-auto my-1.5 flex-shrink-0">
          <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-coal/40" aria-hidden="true" />
          <input value={buscar} onChange={e => setBuscar(e.target.value)}
            onKeyDown={e => {
              if (e.key === 'Escape') setBuscar('')
              if (e.key === 'Enter' && filteredOrders.length === 1) { openOrderDetail(filteredOrders[0].id); setBuscar('') }
            }}
            placeholder="Buscar #, nombre o celular" aria-label="Buscar pedido de hoy"
            className="w-44 xl:w-56 rounded-full border border-coal/15 bg-white py-1.5 pl-8 pr-3 font-body text-xs outline-none focus:border-cherry/50" />
        </label>
        {!showForm && (
          <button onClick={() => setShowForm(true)} className="btn-primary btn-sm hidden xl:inline-flex ml-3 my-1.5 whitespace-nowrap flex-shrink-0">
            <Plus size={16} aria-hidden="true" /> Nuevo pedido
          </button>
        )}
      </div>

      {/* Mensajes sin leer del cliente. El banner ABRE el pedido directamente:
          antes solo decía "toca el pedido resaltado", pero si ese pedido estaba
          en otra pestaña (p. ej. ya cotizado → "Asignar") el cajero no lo
          encontraba y el mensaje quedaba sin responder. */}
      {devolucionesPendientes.length > 0 && (
        <div className="mx-4 mt-2 flex flex-col gap-1.5">
          {devolucionesPendientes.map(o => (
            <button key={o.id} onClick={() => openOrderDetail(o.id)}
              className="w-full bg-cherry text-cream rounded-xl px-3 py-2 flex items-center gap-3 text-left hover:bg-cherry/90 transition-colors">
              <Banknote size={18} className="text-mustard flex-shrink-0" aria-hidden="true" />
              <div className="flex-1 min-w-0">
                <p className="font-body text-sm font-bold">
                  Devolución pendiente{o.orderNumber ? ` · pedido #${o.orderNumber}` : ''}
                </p>
                <p className="font-body text-xs text-cream/85 truncate">
                  {o.saldoAplicado?.porDevolver && !DEVOLUCION_PENDIENTE_CAJA.includes(o.devolucion?.estado)
                    ? `${o.name || 'Cliente'} — devolverle el saldo a favor que usó`
                    : o.devolucion.estado === 'transferencia_solicitada'
                      ? `${o.name || 'Cliente'} pidió transferencia de $${Number(o.devolucion.monto).toLocaleString('es-CO')}`
                      : `${o.name || 'Cliente'} pidió $${Number(o.devolucion.monto).toLocaleString('es-CO')} como saldo a favor`}
                </p>
              </div>
              <span className="font-body text-xs font-bold">Ver →</span>
            </button>
          ))}
        </div>
      )}

      {/* Aparato principal de la caja (Fase 6): solo ese suena */}
      {/* Franja de estado: sonido, impresora y quién está en turno, en una fila.
          Solo se pone naranja lo que hay que resolver. */}
      <div className="mx-4 mt-2 flex flex-wrap items-center gap-2">
        <PuestoCaja puesto={puesto} />
        <ImpresoraCaja puesto={puesto} sedeId={sede?.id} />
        {/* Quién está en turno (Fase 5: los domicilios se asignan solos) */}
        <EstadoDomiciliarios sedeId={sede?.id} />
        {/* Lo agotado en la sede: para acordarse de volver a ofrecerlo. */}
        {agotados.ids.size > 0 && (
          <ChipEstado tono="neutro" icono={PackageX}
            texto={agotados.ids.size === 1 ? `Agotado: ${Object.values(agotados.nombres)[0] || '1 producto'}` : `${agotados.ids.size} productos agotados`}
            titulo={Object.values(agotados.nombres).join(', ')}
            accion={{ texto: 'Ver', onClick: () => setShowAgotados(true) }} />
        )}
        {/* Domicilios sin domiciliario: el que más lleva esperando se asigna primero. */}
        {sinDomiciliario.length > 0 && (
          <ChipEstado tono="atencion" icono={Bike}
            texto={sinDomiciliario.length === 1 ? '1 domicilio por asignar' : `${sinDomiciliario.length} domicilios por asignar`}
            titulo="Domicilios cotizados que todavía no tienen domiciliario"
            accion={{ texto: 'Asignar', onClick: () => openAssign([...sinDomiciliario].sort((a, b) => (a.createdAt?.toMillis?.() ?? 0) - (b.createdAt?.toMillis?.() ?? 0))[0]) }} />
        )}
      </div>

      {/* Saldo a favor de quien eliminó su cuenta: transferirlo */}
      <DevolucionesSaldo sedeId={sede?.id} />

      {ordersConMensajes.length > 0 && (
        <div className="mx-4 mt-2 flex flex-col gap-1.5">
          {ordersConMensajes.map(o => (
            <button key={o.id}
              onClick={() => o.status === 'quoted' && o.deliveryMode !== 'pickup' ? openAssign(o) : openOrderDetail(o.id)}
              className="w-full bg-cherry/10 rounded-xl px-3 py-2 flex items-center gap-3 hover:bg-cherry/15 transition-colors text-left">
              <span className="w-7 h-7 bg-cherry rounded-full flex items-center justify-center flex-shrink-0">
                <MessageCircle size={14} className="text-cream" aria-hidden="true" />
              </span>
              <div className="flex-1 min-w-0">
                <p className="font-body text-sm font-semibold text-cherry">
                  {unreadChatMap[o.id] === 1 ? '1 mensaje nuevo' : `${unreadChatMap[o.id]} mensajes nuevos`}
                  {o.orderNumber ? ` · Pedido #${o.orderNumber}` : ''} · {o.name || o.clientName || 'Cliente'}
                </p>
                <p className="font-body text-xs text-coal/60 truncate">
                  “{textoDeMensaje([...(o.clientMessages || [])].filter(m => m.role === 'client').slice(-1)[0])}”
                </p>
              </div>
              <span className="font-body text-xs font-bold text-cherry flex-shrink-0">Responder →</span>
            </button>
          ))}
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
            <span className="font-body text-xs font-semibold text-coal/70">Efectivo pendiente de recibir:</span>
            <span className="font-display text-lg text-mustard">{fmt(total)}</span>
          </div>
        )
      })()}

      {/* Summary for completed tab */}
      {tab === 'completed' && filteredOrders.length > 0 && (
        <EntregadosSummary
          orders={filteredOrders.filter(o => o.status !== 'cancelled')}
          sedeName={sede?.name || ''}
          fecha={historyDate
            ? format(new Date(historyDate + 'T00:00:00'), "EEEE dd 'de' MMMM yyyy", { locale: es })
            : today}
        />
      )}

      {/* Orders list */}
      {busqueda && (
        <p className="mx-4 mt-2 font-body text-xs text-coal/60">
          {filteredOrders.length === 0 ? `Ningún pedido de hoy coincide con «${busqueda}».` : `${filteredOrders.length === 1 ? 'Un pedido' : `${filteredOrders.length} pedidos`} de hoy con «${busqueda}» (todas las etapas). Enter abre el pedido si hay uno solo.`}
          <button onClick={() => setBuscar('')} className="ml-2 font-semibold text-cherry underline underline-offset-2">Quitar búsqueda</button>
        </p>
      )}
      {tab === 'active' && ancho && !busqueda ? (
        <main className="flex-1 min-h-0 p-4 pt-3">
          <TableroCaja orders={filteredOrders} ahora={ahora} unreadChatMap={unreadChatMap}
            onAbrir={(o) => openOrderDetail(o.id)} onToggleFacturado={(o) => toggleFacturado(o)} onAsignar={(o) => openAssign(o)} />
        </main>
      ) : (
      <main className="flex-1 min-h-0 overflow-y-auto scroll-custom p-4 pb-24 xl:pb-6 flex flex-col gap-3 stagger md:grid md:grid-cols-2 xl:grid-cols-3 md:items-start md:content-start">
        {tab === 'reclamos' && <div className="md:col-span-2 xl:col-span-3"><Reclamos sedeId={sede?.id} esAdmin={esAdminReclamos} onAbiertos={setReclamosAbiertos} /></div>}
        {tab !== 'reclamos' && filteredOrders.length === 0 && !showForm && (
          <div className="flex flex-col items-center justify-center gap-3 py-16 text-center md:col-span-2 xl:col-span-3">
            {tab === 'active' ? <ShoppingBag size={32} className="text-coal/25" aria-hidden="true" />
              : tab === 'cuadre' ? <Banknote size={32} className="text-coal/25" aria-hidden="true" />
              : <CircleCheck size={32} className="text-coal/25" aria-hidden="true" />}
            <p className="font-body text-coal/40">
              {tab === 'active'    ? 'No hay pedidos activos' :
               tab === 'cuadre'   ? 'No hay cuadres pendientes' :
               historyDate ? `No hay pedidos para el ${historyDate}` : 'No hay pedidos completados hoy'}
            </p>
          </div>
        )}
        {filteredOrders.map(order => (
          <OrderCard
            key={order.id}
            order={order}
            ahora={ahora}
            unreadCount={unreadChatMap[order.id] || 0}
            onClick={() => openOrderDetail(order.id)}
            onAsignar={() => openAssign(order)}
            onToggleFacturado={() => toggleFacturado(order)}
          />
        ))}
      </main>
      )}

      {/* Barra fija: el botón flotante tapaba el final de la última tarjeta */}
      {!showForm && (
        <div className="xl:hidden fixed bottom-0 inset-x-0 z-30 bg-cream/90 backdrop-blur-md border-t border-coal/10 px-4 pt-3"
          style={{ paddingBottom: 'calc(0.75rem + env(safe-area-inset-bottom))' }}>
          <button onClick={() => setShowForm(true)} className="btn-primary w-full max-w-lg mx-auto">
            <Plus size={20} aria-hidden="true" /> Nuevo pedido
          </button>
        </div>
      )}

      {/* Order form modal */}
      {showForm && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-coal/50 backdrop-blur-sm">
          <div className="bg-cream w-full max-w-lg rounded-t-3xl sm:rounded-3xl max-h-[92dvh] overflow-y-auto scroll-custom animate-sheet-up sm:animate-scale-in">
            <div className="sticky top-0 bg-cream/95 backdrop-blur-sm px-5 py-4 border-b border-coal/10 flex items-center justify-between">
              <p className="font-display text-xl text-coal tracking-wide">Nuevo pedido</p>
              <button onClick={() => setShowForm(false)} className="btn-icon"><Plus size={20} className="rotate-45" /></button>
            </div>
            <div className="p-5">
              <PedidoCaja sede={sede} onCancel={() => setShowForm(false)} />
            </div>
          </div>
        </div>
      )}

      {/* Manual de usuario modal */}
      {showAgotados && <AgotadosCaja sede={sede} onClose={() => setShowAgotados(false)} />}
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
          // key: sin esto React REUSA el componente al pasar de un pedido a otro
          // sin cerrar el modal (pasa al tocar "Ver pedido" en el aviso de pedido
          // nuevo), y los campos conservan los valores del pedido ANTERIOR — el
          // precio cotizado incluido. En producción llegó a la caja un pedido de
          // $36.000 con $60.000 precargados del pedido de antes.
          key={selected.id}
          order={selected}
          onClose={() => setSelectedId(null)}
          drivers={drivers}
          alarmActive={alarmActive}
          onDismissAlarm={dismissAlert}
          unreadClientMsgs={unreadChatMap[selected.id] || 0}
          onReassign={order => { setSelectedId(null); openAssign(order) }}
        />
      )}

      {/* Assign delivery modal */}
      {assigningLive && (
        <AssignDeliveryDetail
          key={assigningLive.id}   // mismo motivo que en OrderDetail
          order={assigningLive}
          drivers={drivers}
          pedidos={orders}
          unreadClientMsgs={unreadChatMap[assigningLive.id] || 0}
          onClose={() => setAssigning(null)}
        />
      )}

      {/* Cuadre de turno modal */}
      {showCuadreTurno && (
        <CuadreTurnoModal
          sede={sede} esAdmin={esAdminReclamos}
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
            <BellRing size={48} className="text-cherry" aria-hidden="true" />
            <p className="font-display text-3xl text-cherry tracking-widest text-center">¡NUEVO PEDIDO!</p>
            <p className="font-body text-sm text-coal/70 text-center">Pedido recibido de un cliente. Atender de inmediato.</p>
            {!puesto.suena && <p className="font-body text-[11px] text-coal/45 text-center -mt-2">Suena en el aparato principal. «Visto» lo calla en todos.</p>}
            <div className="w-full bg-smoked/60 rounded-2xl p-4">
              <p className="font-body text-sm font-semibold text-coal">{newOrderAlert.name || newOrderAlert.clientName || 'Cliente'}</p>
              <p className="font-body text-xs text-coal/60 mt-0.5 line-clamp-2">{newOrderAlert.items}</p>
              <p className="font-body text-xs text-coal/50 mt-1 flex items-center gap-1.5">
                <MapPin size={12} className="flex-shrink-0" aria-hidden="true" /> {newOrderAlert.fullAddress}
              </p>
            </div>
            <div className="flex gap-3 w-full">
              <button onClick={dismissAlert}
                className="flex-1 flex items-center justify-center gap-2 px-4 py-3 rounded-xl border-2 border-coal/20 text-coal/60 font-semibold text-sm hover:bg-smoked transition-colors">
                Visto
              </button>
              <button onClick={() => { dismissAlert(); openOrderDetail(newOrderAlert?.id ?? null) }} className="flex-1 btn-primary">
                <BellRing size={16} /> Ver pedido
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Aviso: el cliente canceló un pedido que estaba en curso */}
      {cancelAlert && (
        <div className="fixed inset-x-0 top-0 z-[95] p-3 animate-fade-in">
          <div className="mx-auto max-w-lg bg-coal text-cream rounded-2xl shadow-2xl p-4 flex items-start gap-3">
            <Ban size={20} className="flex-shrink-0 mt-0.5" aria-hidden="true" />
            <div className="flex-1 min-w-0">
              <p className="font-display text-base tracking-wide">
                Pedido{cancelAlert.orderNumber ? ` #${cancelAlert.orderNumber}` : ''} CANCELADO por el cliente
              </p>
              <p className="font-body text-xs text-cream/70 mt-0.5">
                {cancelAlert.name || cancelAlert.clientName || 'Cliente'} canceló antes del despacho.
                No hay que prepararlo — queda en "Entregados" como cancelado.
              </p>
            </div>
            <div className="flex flex-col gap-1.5 flex-shrink-0">
              <button onClick={() => { const id = cancelAlert.id; setCancelAlert(null); openOrderDetail(id) }}
                className="px-3 py-1.5 rounded-lg bg-cream/15 text-cream font-body text-xs font-semibold hover:bg-cream/25 transition-colors">
                Ver
              </button>
              <button onClick={() => setCancelAlert(null)}
                className="px-3 py-1.5 rounded-lg text-cream/60 font-body text-xs font-semibold hover:text-cream transition-colors">
                Entendido
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
          className="btn btn-sm border border-cherry/30 text-cherry [@media(hover:hover)]:hover:bg-cherry/10"
        >
          <FileText size={15} aria-hidden="true" /> Exportar PDF
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
                  : driver.locData ? 'Compartiendo ubicación' : 'Sin actividad'}
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
                <LogoWhatsApp size={16} /> WhatsApp
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
                  <p className="font-body text-xs text-coal/70 truncate">{o.name}</p>
                  <p className="font-body text-xs text-coal/50 truncate mt-0.5">{o.fullAddress}</p>
                </div>
              ))}
            </div>
          )}

          {/* Ubicación */}
          {hasPos ? (
            <div className="flex flex-col gap-2">
              <p className="font-body text-xs text-coal/40 text-center">
                Ubicación actualizada {useLocData ? fmtAgoMs(locTsMs) : fmtAgo(latestOrderPos?.driverUpdatedAt)}
              </p>
              <div className="flex gap-2">
                <a href={`https://www.google.com/maps/search/?api=1&query=${lat},${lng}`}
                  target="_blank" rel="noreferrer"
                  className="flex-1 flex items-center justify-center gap-1.5 py-2.5 rounded-xl border-2 border-mint/40 text-mint text-sm font-semibold font-body hover:bg-mint/10 transition-colors">
                  <LogoGoogleMaps size={16} /> Google Maps
                </a>
                <a href={`https://waze.com/ul?ll=${lat},${lng}&navigate=yes`}
                  target="_blank" rel="noreferrer"
                  className="flex-1 flex items-center justify-center gap-1.5 py-2.5 rounded-xl border-2 border-coal/20 text-coal/60 text-sm font-semibold font-body hover:bg-smoked transition-colors">
                  <LogoWaze size={16} /> Waze
                </a>
              </div>
            </div>
          ) : (
            <div className="bg-coal/5 rounded-xl px-4 py-3 text-center">
              <p className="font-body text-xs text-coal/50">Sin ubicación aún</p>
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
      <div className="bg-cream w-full max-w-lg rounded-t-3xl sm:rounded-3xl max-h-[90dvh] overflow-y-auto scroll-custom animate-sheet-up sm:animate-scale-in">

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
                        : hasGps ? 'Compartiendo GPS' : 'Sin actividad'}
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
function CuadreTurnoModal({ orders, drivers, sede, esAdmin, onClose }) {
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
      <div className="bg-cream w-full max-w-lg rounded-t-3xl sm:rounded-3xl max-h-[90dvh] overflow-y-auto scroll-custom animate-sheet-up sm:animate-scale-in">
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

          {/* Entregas de efectivo, fondos para cambio y diferencias (§13.2, §13.3) */}
          <CuadresEfectivo modo="caja" sedeId={sede?.id} esAdmin={esAdmin} drivers={drivers} pedidos={completedToday} />

          {/* Total pedidos */}
          <div className="card">
            <p className="font-display text-base tracking-wide mb-1">Pedidos completados hoy</p>
            <p className="font-body text-2xl font-bold text-coal">{filtered.length} pedidos</p>
          </div>

          {/* Cash */}
          <div className="card border border-mustard/30">
            <p className="font-display text-base tracking-wide mb-2">Efectivo a entregar en caja</p>
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
            <p className="font-display text-base tracking-wide mb-3">Valor de domicilios</p>
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
    id: 'flujo', icon: ClipboardList, title: 'Flujo de un pedido',
    content: [
      { type: 'steps', items: [
        'El cliente hace el pedido → aparece en "Activos" como PENDIENTE.',
        'Si dice "Pedido completo": el cliente ya vio el total y eligió cómo paga (billete o comprobante). Revisa y toca "Aceptar pedido".',
        'Si no (dirección sin ubicar, pidió revisar el domicilio o pedido escrito a mano): llena número, precio y domicilio y toca "Enviar cotización al cliente".',
        'Las transferencias se marcan aparte con "Confirmar pago recibido" al ver el comprobante.',
        'Si el sistema no le asignó domiciliario, la tarjeta dice "Sin domiciliario" (en el tablero, columna Confirmados): toca "Asignar" y completa el envío al domiciliario.',
        'El domiciliario acepta, va en camino y marca la entrega.',
        'Si fue efectivo, el pedido aparece en "Cuadre" para confirmar el dinero recibido.',
      ]},
    ],
  },
  {
    id: 'plataforma', icon: Power, title: 'Interruptor de plataforma',
    content: [
      { type: 'table', rows: [
        ['Verde parpadeando', 'Plataforma ACTIVA — clientes pueden pedir'],
        ['Gris apagado',      'Plataforma APAGADA — clientes ven pantalla cerrada'],
      ]},
      { type: 'tip', text: 'Se abre y cierra sola con el horario de la sede (hoy, 5:00 PM – 11:00 PM). Úsalo solo si necesitas prenderla antes o apagarla antes por algo puntual.' },
    ],
  },
  {
    id: 'alarma', icon: BellRing, title: 'Notificación de nuevo pedido',
    content: [
      { type: 'table', rows: [
        ['"Ver pedido"', 'Silencia la alarma y abre el detalle'],
        ['"Silenciar"',  'Para el sonido, el pedido queda en Activos'],
      ]},
    ],
  },
  {
    id: 'cuadre_turno', icon: Banknote, title: 'Cuadre de turno',
    content: [
      { type: 'p', text: 'Usa el botón "Cuadre" en el encabezado para ver el resumen del turno.' },
      { type: 'table', rows: [
        ['Efectivo a caja',    'Suma de todos los pedidos en efectivo de hoy'],
        ['Pago al domiciliario', 'Total de domicilios agrupados por valor'],
      ]},
    ],
  },
  {
    id: 'estados', icon: Tag, title: 'Estados de los pedidos',
    content: [
      { type: 'table', rows: [
        ['PENDIENTE',   'Pedido nuevo: por aceptar (si llegó completo) o por cotizar'],
        ['COTIZADO',    'Cajero envió precio, esperando pago del cliente'],
        ['ASIGNADO',    'Domiciliario asignado, esperando que acepte'],
        ['ACEPTADO',     'Domiciliario confirmó que va a entregar'],
        ['EN CAMINO',   'Domiciliario en ruta al cliente'],
        ['LLEGÓ',       'Domiciliario llegó al destino'],
        ['PDTE. CUADRE','Efectivo pendiente de recibir del domiciliario'],
        ['COMPLETADO',  'Cuadre confirmado, pedido cerrado'],
        ['RECHAZADO',   'Pedido rechazado por el cajero'],
      ]},
    ],
  },
]

function ManualSection({ section }) {
  const [open, setOpen] = useState(false)
  const Icon = section.icon
  return (
    <div className="card overflow-hidden p-0 shrink-0">
      <button onClick={() => setOpen(v => !v)}
        className="w-full flex items-center justify-between gap-3 px-4 py-4 text-left hover:bg-smoked/50 transition-colors">
        <div className="flex items-center gap-3">
          <Icon size={18} className="text-cherry flex-shrink-0" aria-hidden="true" />
          <span className="font-display text-base tracking-wide text-coal">{section.title}</span>
        </div>
        <ChevronDown size={18} aria-hidden="true"
          className={`text-coal/40 flex-shrink-0 transition-transform duration-200 ${open ? 'rotate-180' : ''}`}
          style={{ transitionTimingFunction: 'var(--ease-out)' }} />
      </button>
      {/* Se despliega con la altura, no de golpe: la fila de arriba no salta y
          se ve de dónde sale el texto. */}
      <div className={`grid transition-[grid-template-rows] duration-300 ${open ? 'grid-rows-[1fr]' : 'grid-rows-[0fr]'}`}
        style={{ transitionTimingFunction: 'var(--ease-out)' }}>
        <div className="overflow-hidden">
        <div className="px-4 pb-4 flex flex-col gap-3 border-t border-coal/10 pt-3">
          {section.content.map((block, i) => {
            if (block.type === 'p') return <p key={i} className="font-body text-sm text-coal/80 leading-relaxed">{block.text}</p>
            if (block.type === 'tip') return (
              <div key={i} className="flex items-start gap-2 bg-mustard/10 border border-mustard/20 rounded-xl px-3 py-2">
                <Lightbulb size={14} className="text-mustard flex-shrink-0 mt-0.5" aria-hidden="true" />
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
        </div>
      </div>
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
