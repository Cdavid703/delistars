import { useState, useEffect, useRef, useMemo, lazy, Suspense } from 'react'
import {
  collection, query, where, onSnapshot, serverTimestamp, getDocs, limit,
  doc, getDoc, setDoc, updateDoc, addDoc, arrayUnion
} from 'firebase/firestore'
import {
  db, storage,
  availableRewardsForSede, markRewardNotified,
  enablePush, pushPermission,
} from '../../services/firebase'
import { llamarPedidos, ErrorApi, nuevaClave } from '../../services/pedidosApi'
import { etapaDe } from '../../utils/etapas'
import { ref as storageRef, uploadBytesResumable, getDownloadURL } from 'firebase/storage'
import { useAuth } from '../../contexts/AuthContext'
import Logo from '../common/Logo'
import RoleSwitcher from '../common/RoleSwitcher'
import AddressBook from './AddressBook'
import useBackClose from '../../hooks/useBackClose'
import { parseHandoff, parseMenuCart, carritoParaApi } from '../../utils/handoff'
import { precioDomicilio, kmLineaRecta, distanciaParaCobrar, explicarTarifa, LINEA_RECTA } from '../../utils/tarifaDomicilio'
import { medirRuta } from '../../services/recorrido'
import { sugerirOtraSede } from '../../utils/checkoutRuta'
import { debeOfrecerPromos } from '../../utils/promociones'
import { validarCodigo, CODIGOS } from '../../utils/codigos'
import { estadoSede, textoEstado } from '../../utils/horarios'
import {
  aplicaPagoAdelantado, totalAPagar, erroresPago, llevaComprobante,
} from '../../utils/pagoAdelantado'
import {
  devolucionInicial, puedeElegirSaldo, erroresDatosDevolucion, saldoDisponible, aplicarSaldo, MEDIOS_DEVOLUCION,
} from '../../utils/devolucion'
import { sonar, sonarMensaje, sonidoDeEstado } from '../../utils/sonidos'
import BotonSilencio from '../common/BotonSilencio'
// Mapa en vivo del domiciliario: Leaflet diferido, solo se descarga en "en camino".
const LiveDriverMap = lazy(() => import('./LiveDriverMap'))
import { format } from 'date-fns'
import { es } from 'date-fns/locale'
import {
  MapPin, ShoppingBag, Navigation, Search,
  LogOut, Info, Star, Plus, X, AlertCircle, Clock, MessageSquare,
  HelpCircle, ChevronDown, ChevronUp, Send, UserRound,
  ClipboardList, Wallet, Bike, ChefHat, CircleCheck, CircleX, Ban, Mail, Gift, Trash2, Banknote, MessageCircle,
  CreditCard, Paperclip, Lightbulb, Store, Check, Upload, Smartphone, Building2, Shuffle,
  Bell, BellOff, Lock, Phone, Pencil
} from 'lucide-react'
import { SEDES } from '../../services/roles'
import { datosTransferencia, INSTRUCCION_TRANSFERENCIA } from '../../utils/datosTransferencia'
import { usePWAInstall } from '../../hooks/usePWAInstall'
import AccesoCuenta from '../common/AccesoCuenta'
import { AvisoVerificarCorreo, CompletarPerfil } from './CuentaCliente'
import MiCuenta from './MiCuenta'
import CampanaAvisos from '../common/CampanaAvisos'
import ChatDomiciliario from '../common/ChatDomiciliario'
import ReclamoPedido from './ReclamoPedido'
import { motivoCerrado, textoCerrado, MAX_TEXTO } from '../../utils/chat'
import { faltaVerificarCorreo } from '../../utils/erroresAuth'

const STATUS_STEPS = [
  { key: 'pending',       label: 'Pedido enviado' },
  { key: 'quoted',        label: 'Cotización recibida' },
  { key: 'assigned',      label: 'Domiciliario asignado' },
  // 'accepted' y 'preparing' son UN SOLO paso para el cliente: apenas el
  // domiciliario toma el pedido, la cocina ya lo está haciendo. Fundirlos evita
  // dos pasos casi iguales y, sobre todo, que la barra retroceda si la caja
  // marca preparación antes de que el domiciliario acepte (o al revés).
  { key: 'preparing',     label: 'Aceptado y en preparación' },
  { key: 'in_transit',    label: 'En camino' },
  { key: 'arrived',       label: 'Llegó al destino' },
  { key: 'delivered_paid',label: '¡Entregado!' },
  { key: 'pending_cuadre',label: '¡Entregado!' },
  { key: 'completed',     label: '¡Entregado!' },
  { key: 'rejected',      label: 'Pedido rechazado' },
  { key: 'cancelled',     label: 'Pedido cancelado' },
]

const STEP_ICON = {
  pending: ClipboardList, quoted: Wallet, assigned: Bike, preparing: ChefHat, in_transit: Navigation,
  arrived: MapPin, delivered_paid: CircleCheck, pending_cuadre: CircleCheck, completed: CircleCheck,
  rejected: CircleX, cancelled: Ban,
}
/** Icono del paso actual del pedido, en un disco discreto (tarjetas) o suelto (encabezados). */
// Las líneas del pedido traen el precio al final entre "(= $…)": separarlo
// deja el producto a la izquierda y la plata alineada, como un recibo.
function ListaItems({ texto, className = '' }) {
  const lineas = (texto || '').split('\n').filter(l => l.trim())
  if (lineas.length === 0) return null
  return (
    <div className={`divide-y divide-coal/10 ${className}`}>
      {lineas.map((linea, i) => {
        const m = linea.match(/^(.*?)\s*\(=\s*(\$[\d.,]+)\)\s*$/)
        return (
          <div key={i} className="flex items-start justify-between gap-3 py-2">
            <p className="font-body text-sm text-coal/80 leading-relaxed min-w-0">{m ? m[1] : linea}</p>
            {m && <p className="font-body text-sm font-semibold text-coal tabular flex-shrink-0">{m[2]}</p>}
          </div>
        )
      })}
    </div>
  )
}

function StepIcon({ step, size = 18, className = '', disco = true }) {
  const Icon = STEP_ICON[step?.key] || ClipboardList
  if (!disco) return <Icon size={size} className={className} aria-hidden="true" />
  return (
    <span className={`inline-flex items-center justify-center w-9 h-9 rounded-full bg-smoked text-coal/70 flex-shrink-0 ${className}`} aria-hidden="true">
      <Icon size={size} />
    </span>
  )
}

const DELIVERED_STATUSES = ['delivered_paid', 'pending_cuadre', 'completed']
const CLOSED_STATUSES    = ['rejected', 'cancelled']

// Pasos positivos para calcular el progreso (excluye estados de cierre)
// El cliente ve 'accepted' como 'preparing' (ver STATUS_STEPS). Todo lo que
// mire el estado del lado del cliente debe pasar por aquí primero.
const pasoCliente = status => (status === 'accepted' ? 'preparing' : status)

// Etiqueta del paso: en "recoger en sede" no hay domiciliario que acepte nada.
// Con pago adelantado no hubo cotización: 'quoted' significa que la caja aceptó.
const labelPaso = (step, order) => {
  // Etapa nueva "Listo" (Fase 2): el status sigue en 'preparing'.
  if (step.key === 'preparing' && order?.etapa === 'listo') {
    return order?.deliveryMode === 'pickup' ? '¡Listo para recoger!' : 'Listo, pronto sale'
  }
  if (step.key === 'preparing' && order?.deliveryMode === 'pickup') return 'En preparación'
  if (step.key === 'quoted'  && order?.pagoAdelantado) return 'Pedido aceptado'
  if (step.key === 'pending' && order?.pagoAdelantado) return 'Pedido y pago enviados'
  return step.label
}

/** ¿La ubicación del domiciliario tiene menos de 3 minutos? */
const ubicFresca = ts => !!ts?.toMillis && Date.now() - ts.toMillis() < 3 * 60000

// Hora estimada de llegada, SOLO con el pedido en camino (especificación §8.1):
//   1. `vivo` = { min, en }: ruta desde la ubicación reciente del domiciliario.
//   2. order.etaLlegadaAt: la hora calculada cuando el domiciliario salió.
//      Es lo normal: al navegar con Google Maps su celular pausa la página
//      y deja de mandar ubicación.
function calcularEta(order, vivo = null) {
  if (vivo && order?.status === 'in_transit') {
    const llegada = new Date(vivo.en + vivo.min * 60000)
    const faltan  = Math.max(0, Math.round((llegada.getTime() - Date.now()) / 60000))
    return { llegada, faltan, tarde: false, enVivo: true }
  }
  if (order?.status === 'in_transit' && Number.isFinite(order.etaLlegadaAt)) {
    const llegada = new Date(order.etaLlegadaAt)
    const faltan  = Math.round((llegada.getTime() - Date.now()) / 60000)
    return { llegada, faltan, tarde: faltan < -8, porRuta: true }
  }
  // Antes de salir no se muestra ningún estimado (especificación §8.1: no
  // mostrar tiempo de preparación; decisión C4 del 18 oct 2026).
  return null
}

const horaCorta = d => format(d, 'h:mm a', { locale: es }).replace('a. m.', 'AM').replace('p. m.', 'PM')

const PROGRESS_KEYS = ['pending','quoted','assigned','preparing','in_transit','arrived','delivered_paid']
const getProgress = status => {
  if (CLOSED_STATUSES.includes(status)) return 0
  if (DELIVERED_STATUSES.includes(status)) return 100
  const idx = PROGRESS_KEYS.indexOf(pasoCliente(status))
  return idx === -1 ? 0 : Math.round(((idx + 1) / PROGRESS_KEYS.length) * 100)
}

const isToday = ts => {
  if (!ts?.toDate) return false
  const d = ts.toDate(), n = new Date()
  return d.toDateString() === n.toDateString()
}

const fmt = v => (v !== undefined && v !== null && v !== '') ? `$${Number(v).toLocaleString('es-CO')}` : null

// Sube el comprobante de transferencia a receipts/{orderId}/ y devuelve la URL.
// Es la misma ruta que usa el cliente al subirlo desde el seguimiento.
function subirComprobante(orderId, file, onProgreso) {
  return new Promise((resolve, reject) => {
    const task = uploadBytesResumable(storageRef(storage, `receipts/${orderId}/${Date.now()}_${file.name}`), file)
    task.on('state_changed',
      snap => onProgreso?.(Math.round((snap.bytesTransferred / snap.totalBytes) * 100)),
      reject,
      () => getDownloadURL(task.snapshot.ref).then(resolve, reject),
    )
  })
}

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

// ¿El cliente llega con un pedido a medio armar? Puede venir del paquete del
// menú, de un borrador, o —si esos caducaron— del carrito del menú, que dura
// más. Se consulta en un solo lugar para que las tres rutas coincidan y el
// checkout nunca quede vacío teniendo un carrito disponible.
function hayPedidoPendiente() {
  return !!localStorage.getItem('ds_cart_handoff')
      || !!readOrderDraft()
      || !!parseMenuCart(localStorage.getItem('ds_cart_items'))
}

// El sonido vive en utils/sonidos.js: un solo contexto de audio, que se
// despierta solo, y una melodía distinta por evento.

export default function ClientPanel() {
  const { user, role, effectiveRole, setViewingAs, sede, selectSede, logout } = useAuth()
  const { canInstall, install } = usePWAInstall()
  const [orders,         setOrders]         = useState([])
  const [ordersLoaded,   setOrdersLoaded]   = useState(false)
  const [selectedId,     setSelectedId]     = useState(null)
  const [showForm,       setShowForm]       = useState(hayPedidoPendiente)
  // ¿El cliente entró con contexto (carrito del menú o un borrador de pedido
  // sin terminar)? Si no, no debe quedarse en el panel de domicilios: se le
  // envía al menú a escoger productos.
  const enteredWithCart = useRef(hayPedidoPendiente())
  // Horarios por sede (config/horarios, los define administración). La sede
  // abre y cierra sola según la hora de Colombia; se recalcula cada minuto.
  const [horarios, setHorarios] = useState(undefined)
  const [ahoraMin, setAhoraMin] = useState(() => Date.now())
  useEffect(() => {
    const id = setInterval(() => setAhoraMin(Date.now()), 60000)
    return () => clearInterval(id)
  }, [])
  const estadoDe = id => estadoSede(horarios?.[id], ahoraMin)
  const estadoMiSede = sede?.id && SEDES[sede.id] ? estadoDe(sede.id) : null
  const platformActive = horarios === undefined ? null : (estadoMiSede ? estadoMiSede.abierta : true)
  const otraSedeAbierta = estadoMiSede && !estadoMiSede.abierta
    ? Object.values(SEDES).find(s => s.id !== sede.id && estadoDe(s.id).abierta)
    : null
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
  const prevEstadoRef      = useRef(null)  // ídem, para los cambios de estado
  const hoyTexto = format(new Date(), "EEEE d 'de' MMMM 'de' yyyy", { locale: es })
  const today = hoyTexto.charAt(0).toUpperCase() + hoyTexto.slice(1)

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

  // Permiso de promociones (undefined = cargando). Se ofrece a los clientes
  // con correo que no han respondido, también a los antiguos: ver PromosOptIn.
  const [promociones, setPromociones] = useState(undefined)
  // Nombre y teléfono del perfil: si faltan, se piden una sola vez (Fase 4).
  const [perfil, setPerfil] = useState(undefined)
  useEffect(() => {
    if (!user?.uid || !user?.email) return
    return onSnapshot(doc(db, 'customers', user.uid), snap => {
      setLoyaltyProgress(snap.exists() ? (snap.data().loyalty || {}) : {})
      setPromociones(snap.exists() ? (snap.data().promociones ?? null) : null)
      setPerfil(snap.exists()
        ? { name: snap.data().name || '', phone: snap.data().phone || '', promociones: snap.data().promociones ?? null }
        : { name: '', phone: '', promociones: null })
    }, () => {})
  }, [user?.uid, user?.email])
  // Enlace de un pedido (/p/<id> → ?pedido=<id>, Fase 6): se abre su detalle
  // apenas llegan los pedidos de la cuenta.
  const pedidoDelEnlace = useRef(new URLSearchParams(window.location.search).get('pedido'))
  useEffect(() => {
    const id = pedidoDelEnlace.current
    if (!id || !orders.some(o => o.id === id)) return
    pedidoDelEnlace.current = null
    setSelectedId(id)
    window.history.replaceState(null, '', window.location.pathname)
  }, [orders])

  // Mi cuenta (Fase 4, paso 4) y la eliminación pedida: mientras corren los 30
  // días se le recuerda y no puede pedir.
  const [miCuenta, setMiCuenta] = useState(false)
  const [eliminacion, setEliminacion] = useState(null)
  useEffect(() => {
    if (!user?.uid || user.isAnonymous) return
    return onSnapshot(doc(db, 'eliminaciones', user.uid),
      snap => setEliminacion(snap.exists() && snap.data().estado === 'pendiente' ? snap.data() : null), () => {})
  }, [user?.uid, user?.isAnonymous])
  // Sube cuando el cliente confirma su correo (Firebase actualiza la cuenta sin avisar).
  const [, setCorreoConfirmado] = useState(0)

  // Premios recién ganados que el cliente todavía no ha visto.
  useEffect(() => {
    const now = Date.now()
    const unseen = loyaltyRewards.filter(r =>
      r.status === 'available' && !r.notified && (r.expiresAt?.toMillis?.() ?? Infinity) > now
    )
    if (unseen.length > 0) setCelebrateRewards(unseen)
  }, [loyaltyRewards])

  // Saldo a favor por devoluciones. Solo clientes con cuenta de Google.
  const [creditos, setCreditos] = useState([])
  useEffect(() => {
    if (!user?.uid || !user?.email) return
    return onSnapshot(collection(db, 'customers', user.uid, 'credits'), snap => {
      setCreditos(snap.docs.map(d => ({ id: d.id, ...d.data() })))
    }, () => {})
  }, [user?.uid, user?.email])
  const creditosSede = creditos.filter(c => c.estado === 'disponible' && c.sedeId === sede?.id)
  const saldoSede    = saldoDisponible(creditos, sede?.id)

  const sedeLoyalty    = (sede?.id && loyaltyProgress[sede.id]) || { count: 0, totalDelivered: 0 }
  const availableForSede = availableRewardsForSede(loyaltyRewards, sede?.id)
  const premiosOtraSede  = Object.keys(SEDES)
    .filter(id => id !== sede?.id)
    .flatMap(id => availableRewardsForSede(loyaltyRewards, id))

  const dismissCelebration = () => {
    celebrateRewards.forEach(r => markRewardNotified(user.uid, r.id).catch(() => {}))
    setCelebrateRewards([])
  }

  useEffect(() => {
    return onSnapshot(
      doc(db, 'config', 'horarios'),
      snap => setHorarios(snap.exists() ? snap.data() : null),
      _err => setHorarios(null), // sin poder leer: no se bloquea (horario por defecto)
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
    if (hayPedidoPendiente()) return
    if (ordersLoaded && orders.length === 0) {
      // Resetea "ver como cliente" para que el equipo no quede atrapado: al
      // volver a /domicilios/ recupera su panel en vez de re-redirigirse.
      if (effectiveRole !== role) { try { setViewingAs(null) } catch {} }
      // Al equipo se le manda al menú como siempre. Al cliente NO: puede ser
      // alguien que sí pidió y perdió la sesión, y mandarlo al menú es
      // justamente lo que lo hace pedir otra vez. Se le ofrece recuperarlo.
      if (effectiveRole !== 'client') window.location.replace('/')
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
      if (prev !== undefined && count > prev && !played) { sonarMensaje(); played = true }
      cashierMsgCountRef.current[o.id] = count
    })
  }, [orders])

  // Sonido cuando un pedido cambia de estado: cotizado, aceptado, en camino,
  // llegó, entregado o cancelado. Antes todo esto pasaba callado y el cliente
  // se enteraba solo si estaba mirando la pantalla.
  useEffect(() => {
    if (prevEstadoRef.current === null) {
      // Primera carga: se guarda la foto de estados sin sonar, para no timbrar
      // por pedidos que ya estaban ahí desde antes de abrir la app.
      if (orders.length === 0) return
      prevEstadoRef.current = {}
      orders.forEach(o => { prevEstadoRef.current[o.id] = o.status })
      return
    }
    let sonó = false
    orders.forEach(o => {
      const prev = prevEstadoRef.current[o.id]
      if (prev !== undefined && prev !== o.status && !sonó) {
        const cual = sonidoDeEstado('cliente', o.status)
        // Un solo sonido por tanda: si cambian dos pedidos a la vez, no se
        // encima un timbre sobre otro.
        if (cual) { sonar(cual); sonó = true }
      }
      prevEstadoRef.current[o.id] = o.status
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
          <Clock size={48} className="text-cream/80 mb-4" aria-hidden="true" />
          <h1 className="font-display text-3xl text-cream tracking-widest mb-3">{sede?.name} está cerrada</h1>
          <p className="font-body text-cream/80 text-sm max-w-xs">
            Mientras tanto puedes ver el menú y armar tu carrito en la página principal.
          </p>
          <div className="mt-4 bg-cream/10 rounded-2xl px-6 py-4 flex items-center gap-3">
            <Clock size={18} className="text-cream/70 flex-shrink-0" />
            <p className="font-body text-cream text-sm font-semibold text-left">
              {textoEstado(estadoMiSede, ahoraMin)}
            </p>
          </div>
          {otraSedeAbierta && (
            <button onClick={() => selectSede(otraSedeAbierta)}
              className="mt-4 inline-flex items-center gap-2 bg-cream/20 text-cream font-display tracking-wide px-5 py-3 rounded-2xl hover:bg-cream/30 transition-colors">
              {otraSedeAbierta.name} está abierta: pedir allá
            </button>
          )}
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

  // Cliente sin pedidos: al menú a pedir. Un invitado antiguo (sesión anónima)
  // entra a su cuenta: si ya pidió con ella, ahí están sus pedidos.
  if (ordersLoaded && orders.length === 0 && effectiveRole === 'client' && !showForm && !hayPedidoPendiente()) {
    return <SinPedidos anonimo={!!user?.isAnonymous} onSalir={logout} />
  }

  const handleCreateOrder = async (data) => {
    // Aviso de pedido duplicado. En los últimos 30 días hubo 8 casos del mismo
    // cliente pidiendo dos veces en menos de 15 minutos, y la caja tuvo que
    // rechazar uno ("Pedido duplicado", "lo realizo dos veces"). Casi siempre
    // es alguien que quería AGREGAR algo y armó un pedido nuevo, pagando dos
    // domicilios. Si ya hay uno en curso, se le ofrece sumarlo al que tiene.
    const reciente = orders.find(o =>
      !CLOSED_STATUSES.includes(o.status) &&
      !DELIVERED_STATUSES.includes(o.status) &&
      o.createdAt?.toMillis &&
      (Date.now() - o.createdAt.toMillis()) < 30 * 60 * 1000
    )
    if (reciente) {
      const min = Math.max(1, Math.round((Date.now() - reciente.createdAt.toMillis()) / 60000))
      const aparte = window.confirm(
        `Ya tienes un pedido en curso, enviado hace ${min} min.\n\n` +
        `Si lo que quieres es agregarle algo, pulsa Cancelar y te llevamos a ese ` +
        `pedido para sumarlo ahí: llega todo junto y pagas un solo domicilio.\n\n` +
        `¿Prefieres crear un pedido APARTE?`
      )
      if (!aparte) {
        setShowForm(false)
        openOrderDetail(reciente.id)
        return
      }
    }

    // El servidor arma el pedido (precios del catálogo, domicilio por recorrido,
    // código, premios y saldo) y le da su consecutivo (Fase 4: el cliente ya no
    // escribe pedidos directo en Firestore). La clave de idempotencia es la del
    // formulario: si se reintenta tras un corte, no se crea un pedido doble.
    const { cuerpo, pago, comprobante, clave, onSubiendo } = data
    const creado = await llamarPedidos('', cuerpo, clave)
    // Pago adelantado (el total ya se conoce): se registra con el pedido creado.
    // Si no se puede, el pedido igual quedó enviado: la sede lo confirma y el
    // cliente elige cómo pagar desde el pedido.
    let avisoPago = ''
    if (pago) {
      try {
        let comp = null
        if (comprobante) {
          const url = await subirComprobante(creado.id, comprobante, onSubiendo)
          comp = { url, nombre: comprobante.name }
        }
        await llamarPedidos(`${creado.id}/pago`, { ...pago, ...(comp ? { comprobante: comp } : {}) }, `${clave}-pago`)
      } catch (err) {
        avisoPago = err instanceof ErrorApi && err.codigo === 'sin_cotizar'
          ? 'Tu pedido quedó enviado. La sede va a confirmar el valor del domicilio y ahí eliges cómo pagar.'
          : 'Tu pedido quedó enviado, pero el pago no se registró. Ábrelo y elige cómo pagar.'
      }
    }
    // Solo AHORA que el pedido existe en Firestore se limpian el carrito
    // entregado por el menú y el borrador — nunca antes, para que una recarga
    // a mitad del formulario no le pierda el pedido al cliente.
    localStorage.removeItem('ds_cart_handoff')
    localStorage.removeItem('ds_cart_items')       // carrito persistido del menú (front)
    localStorage.removeItem(DRAFT_KEY)
    sessionStorage.removeItem('ds_funnel_logged')  // próximo carrito = nuevo evento de embudo
    setShowForm(false)
    // El perfil del cliente frecuente (nombre, teléfono, direcciones) lo guarda el servidor.
    openOrderDetail(creado.id)
    if (avisoPago) window.alert(avisoPago)
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
  // Nombre o teléfono faltantes: se piden una vez, también encima del checkout.
  const completarPerfil = user && !user.isAnonymous && perfil !== undefined
    ? <CompletarPerfil user={user} perfil={perfil} /> : null
  if (showForm) {
    return (
      <div className="min-h-screen-safe bg-gradient-soft">
        {completarPerfil}
        <div className="sticky top-0 z-20 bg-cream/95 backdrop-blur-sm px-5 py-4 border-b border-coal/10 flex items-center justify-between">
          <p className="font-display text-xl text-coal tracking-wide">Completa tu pedido</p>
          <button onClick={exitCheckout} className="btn-icon"><X size={20} /></button>
        </div>
        <div className="p-5 max-w-lg mx-auto pb-16">
          <ClientOrderForm user={user} sede={sede} perfil={perfil} onSubmit={handleCreateOrder} onCancel={exitCheckout} availableRewards={availableForSede} creditos={creditosSede} onCambiarSede={selectSede} />
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen-safe flex flex-col bg-gradient-soft">
      {/* Hero header */}
      <div className="bg-gradient-to-br from-cherry to-tangelo px-5 pt-4 pb-14 relative overflow-hidden">
        <div className="absolute inset-0 opacity-10">
          {[...Array(4)].map((_,i) => (
            <Star key={i} className="absolute text-cream" style={{ width: 60+i*20, height: 60+i*20, top: `${i*25}%`, right: `${i*20}%`, transform: `rotate(${i*45}deg)` }} />
          ))}
        </div>
        <div className="relative z-10 flex items-center justify-between mb-4">
          <Logo variant="dark" size="sm" />
          <div className="flex items-center gap-1">
            <BotonSilencio oscuro />
            <RoleSwitcher variant="dark" />
            {user && !user.isAnonymous && (
              <CampanaAvisos oscuro destinos={[user.uid]} onAbrirPedido={(id) => openOrderDetail(id)} />
            )}
            <button onClick={() => setShowHelp(true)} className="btn-icon text-cream hover:bg-cream/10" title="Ayuda">
              <HelpCircle size={20} />
            </button>
            {user && !user.isAnonymous && (
              <button onClick={() => setMiCuenta(true)} className="btn-icon text-cream hover:bg-cream/10" title="Mi cuenta" aria-label="Mi cuenta">
                <UserRound size={20} />
              </button>
            )}
            <button onClick={() => selectSede(null)} className="btn-icon text-cream hover:bg-cream/10" title="Cambiar de sede" aria-label="Cambiar de sede">
              <MapPin size={20} />
            </button>
            {/* Quien tiene cuenta cierra sesión desde "Mi cuenta": en el
                encabezado de un celular no caben seis iconos. */}
            {(!user || user.isAnonymous) && (
              <button onClick={logout} className="btn-icon text-cream hover:bg-cream/10" title="Salir" aria-label="Salir">
                <LogOut size={20} />
              </button>
            )}
          </div>
        </div>
        <div className="relative z-10">
          {user?.displayName ? (
            <>
              <p className="font-script text-cream/85 text-lg leading-none">Bienvenido/a</p>
              <h1 className="font-display text-3xl text-cream tracking-wider leading-tight mt-1 truncate">
                {user.displayName.split(' ')[0]}
              </h1>
            </>
          ) : (
            <h1 className="font-display text-3xl text-cream tracking-wider leading-tight">¡Hola!</h1>
          )}
          <div className="flex items-center gap-2 mt-1.5">
            <p className="font-body text-cream/75 text-sm">{today}</p>
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
            <button onClick={() => selectSede(null)} className="btn-ghost btn-sm flex-shrink-0">Cambiar</button>
          </div>
        </div>
      </div>

      {/* Premio listo para usar: bloque GRANDE y fijo (el aviso de "ganaste"
          sale una sola vez; después el cliente tiene que seguir viéndolo). */}
      {user?.email && availableForSede.length > 0 && (
        <div className="mx-4 mt-3">
          <PremioListo rewards={availableForSede} sedeName={sede?.name} />
        </div>
      )}
      {/* Premios ganados en la OTRA sede: solo se usan pidiendo allá */}
      {user?.email && premiosOtraSede.length > 0 && (
        <div className="mx-4 mt-3 card-quiet flex items-start gap-3">
          <Gift size={18} className="text-mint flex-shrink-0 mt-0.5" aria-hidden="true" />
          <p className="font-body text-xs text-coal/75 leading-relaxed">
            También tienes {premiosOtraSede.length > 1 ? `${premiosOtraSede.length} premios` : 'un premio'} en{' '}
            <strong>{[...new Set(premiosOtraSede.map(r => SEDES[r.sedeId]?.name).filter(Boolean))].join(' y ')}</strong>.
            Solo se puede usar pidiendo en esa sede: cámbiala arriba para usarlo.
          </p>
        </div>
      )}

      {/* Pidió eliminar su cuenta: se borra al cumplirse el plazo */}
      {eliminacion && (
        <div className="mx-4 mt-3">
          <button onClick={() => setMiCuenta(true)} className="w-full text-left bg-pepper/10 border border-pepper/40 rounded-2xl p-4 flex items-start gap-3">
            <Trash2 size={18} className="text-pepper flex-shrink-0 mt-0.5" aria-hidden="true" />
            <span>
            <p className="font-display text-base tracking-wide text-coal">Tu cuenta se eliminará el {eliminacion.ejecutarDesde?.toDate?.().toLocaleDateString('es-CO', { day: 'numeric', month: 'long' })}</p>
            <p className="font-body text-xs text-coal/70 mt-1">Mientras tanto no puedes pedir. ¿Cambiaste de opinión? Toca aquí para cancelarla.</p>
            </span>
          </button>
        </div>
      )}
      {miCuenta && <MiCuenta user={user} perfil={perfil} onCerrar={() => setMiCuenta(false)} />}

      {/* Pidió sin cuenta: es la causa nº1 de "se me perdió el pedido" */}
      {user?.isAnonymous && <AvisoInvitado className="mx-4 mt-3" siguiendo />}
      {/* Cuenta de correo sin confirmar: no puede enviar el primer pedido */}
      {faltaVerificarCorreo(user) && (
        <AvisoVerificarCorreo email={user.email} className="mx-4 mt-3" onVerificado={() => setCorreoConfirmado(n => n + 1)} />
      )}
      {completarPerfil}

      {/* Devolución esperando que el cliente elija cómo la quiere */}
      {orders.filter(o => o.devolucion?.estado === 'por_elegir').map(o => (
        <div key={`dev-${o.id}`} className="mx-4 mt-3">
          <button onClick={() => openOrderDetail(o.id)}
            className="w-full text-left rounded-2xl p-5 bg-cherry text-cream shadow-card">
            <p className="font-display text-xl tracking-wide flex items-center gap-2"><Banknote size={20} aria-hidden="true" /> Te debemos {fmt(o.devolucion.monto)}</p>
            <p className="font-body text-sm text-cream/90 mt-1 leading-relaxed">
              Tu pedido{o.orderNumber ? ` #${o.orderNumber}` : ''} no siguió y ya lo habías pagado. Toca aquí y
              elige cómo quieres la devolución.
            </p>
          </button>
        </div>
      ))}

      {/* ¿Quiere recibir promociones? (Ley 1581: permiso expreso) */}
      {user?.email && promociones !== undefined && debeOfrecerPromos(promociones) && (
        <PromosOptIn uid={user.uid} email={user.email} className="mx-4 mt-3" />
      )}

      {/* Saldo a favor disponible en esta sede */}
      {user?.email && saldoSede > 0 && (
        <div className="mx-4 mt-3 rounded-2xl p-4 bg-mint/10 border border-mint/40 flex items-start gap-3">
          <Wallet size={20} className="text-mint flex-shrink-0 mt-0.5" aria-hidden="true" />
          <div>
          <p className="font-display text-lg tracking-wide text-mint">Tienes {fmt(saldoSede)} a favor</p>
          <p className="font-body text-xs text-coal/75 mt-1 leading-relaxed">
            Se descuenta de tu próximo pedido en <strong>{sede?.name}</strong>. No vence.
          </p>
          </div>
        </div>
      )}

      {/* Fidelización — solo clientes con cuenta de Google (no invitados) */}
      {user?.email && (
        <div className="mx-4 mt-3">
          <div className="card-quiet">
            <div className="flex items-center justify-between mb-2">
              <p className="font-display text-base tracking-wide text-coal flex items-center gap-2">
                <Gift size={16} className="text-cherry" aria-hidden="true" /> Fidelización {sede?.name}
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
            <p className="font-body text-xs text-coal/65 mt-1.5 tabular">
              {sedeLoyalty.count}/10 domicilios entregados
              {sedeLoyalty.count > 0 && sedeLoyalty.count % 10 === 9 && ' — ¡el próximo te regala una Hamburguesa Especial y un Perro Grande con tocineta gratis!'}
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
        <div className="card-quiet flex items-start gap-3">
          <MessageCircle size={18} className="text-coal/50 flex-shrink-0 mt-0.5" aria-hidden="true" />
          <div className="flex-1">
            <p className="font-body text-xs text-coal/70 leading-relaxed">
              ¿Algo falla o tienes un problema con la plataforma? Escríbenos por WhatsApp y te ayudamos.
            </p>
            {sede?.whatsapp && (
              <a
                href={`https://wa.me/${sede.whatsapp}?text=${encodeURIComponent(`Hola DeliStars ${sede.name}! Tengo un problema con la plataforma.`)}`}
                target="_blank"
                rel="noreferrer"
                className="btn btn-sm mt-2 border border-[#25D366]/50 text-[#128C7E] bg-transparent [@media(hover:hover)]:hover:bg-[#25D366]/10"
              >
                <MessageSquare size={14} /> Soporte por WhatsApp
              </a>
            )}
          </div>
        </div>
      </div>

      {/* Avisos al celular — solo si hay un pedido en curso que seguir. Antes
          esto vivía enterrado dentro del detalle del pedido y solo mientras
          estaba "pendiente": casi nadie llegaba a verlo y por eso los clientes
          no se enteraban de los cambios de estado. */}
      {activeOrders.length > 0 && (
        <div className="mx-4 mt-3">
          <PushOptIn uid={user?.uid} />
        </div>
      )}

      {/* Active orders */}
      <div className="px-4 mt-4">
        <div className="flex items-center justify-between mb-3">
          <p className="section-title">Mis pedidos activos</p>
          <button onClick={() => setShowHistory(true)} className="btn-ghost btn-sm">Ver historial</button>
        </div>
        {activeOrders.length === 0 ? (
          <div className="card-quiet flex flex-col items-center text-center gap-3 py-8 border-dashed">
            <span className="w-12 h-12 rounded-full bg-smoked flex items-center justify-center text-coal/50" aria-hidden="true">
              <ShoppingBag size={22} />
            </span>
            <div>
              <p className="font-body text-sm font-semibold text-coal">No tienes pedidos en curso</p>
              <p className="font-body text-xs text-coal/60 mt-0.5">Cuando pidas, aquí lo sigues paso a paso.</p>
            </div>
            <a href="/" className="btn-secondary btn-sm">Ver el menú</a>
          </div>
        ) : (
          <div className="flex flex-col gap-3 stagger">
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
              <button key={o.id} onClick={() => openOrderDetail(o.id)} className="card-quiet flex items-center justify-between gap-3 w-full text-left">
                <div className="min-w-0">
                  {o.orderNumber && <span className="font-display text-base text-coal mr-2 tabular">#{o.orderNumber}</span>}
                  <span className="font-body text-sm text-coal/70">{(o.items || '—').slice(0, 40)}{(o.items || '').length > 40 ? '…' : ''}</span>
                </div>
                <CircleCheck size={20} className="text-mint flex-shrink-0" aria-hidden="true" />
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
              <button key={o.id} onClick={() => openOrderDetail(o.id)} className="card-quiet w-full text-left">
                <div className="flex items-start gap-3">
                  <CircleX size={20} className="text-pepper flex-shrink-0 mt-0.5" aria-hidden="true" />
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
        <a href="/" className="btn-secondary w-full">
          <ShoppingBag size={18} aria-hidden="true" /> Ver el menú DeliStars
        </a>
      </div>

      {/* Sedes info */}
      <div className="px-4 mt-2 mb-28">
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

      {/* Acción principal fija abajo — pedir se hace SIEMPRE desde el menú de la
          raíz: este panel solo rastrea pedidos. Barra completa (no flotante) para
          que no tape los títulos ni el botón de historial al desplazarse. */}
      <div className="fixed bottom-0 inset-x-0 z-30 bg-cream/90 backdrop-blur-md border-t border-coal/10 px-4 pt-3"
        style={{ paddingBottom: 'calc(0.75rem + env(safe-area-inset-bottom))' }}>
        <a href="/" className="btn-primary w-full max-w-lg mx-auto">
          <Plus size={20} aria-hidden="true" /> Hacer pedido
        </a>
      </div>

      {/* Order detail modal */}
      {/* key: el detalle inicializa sus campos (con cuánto paga) al montarse. Sin
          esto, cambiar de pedido sin cerrar reusa el componente y arrastra el
          valor del anterior — el mismo error que hubo en la caja. */}
      {selected && <ClientOrderDetail key={selected.id} order={selected} onClose={() => setSelectedId(null)} />}

      {/* History modal */}
      {showHistory && (
        <ClientHistoryModal
          orders={orders}
          onClose={() => setShowHistory(false)}
          onSelect={o => { setShowHistory(false); openOrderDetail(o.id) }}
          onReorder={o => {
            // "Volver a pedir": prellena el checkout con los datos del pedido
            // anterior (productos + dirección) y lo abre para que el cliente
            // confirme y reenvíe. El precio se vuelve a cotizar (pudo cambiar).
            localStorage.setItem(DRAFT_KEY, JSON.stringify({
              savedAt: Date.now(),
              form: {
                name:         o.name || o.clientName || '',
                phone:        o.phone || '',
                deliveryMode: o.deliveryMode || 'delivery',
                fullAddress:  o.fullAddress || '',
                addrLat:      o.addrLat ?? null,
                addrLng:      o.addrLng ?? null,
                barrio:       o.barrio || '',
                reference:    o.reference || '',
                items:        o.items || '',
                notes:        o.notes || '',
              },
            }))
            localStorage.removeItem('ds_cart_handoff')
            setShowHistory(false)
            setShowForm(true)
          }}
        />
      )}

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
// QR y cuenta para transferir. Se usa al pagar en el checkout y en el
// seguimiento del pedido (cuando la caja cotizó y el cliente paga después).
function DatosTransferencia({ sedeId }) {
  const cuenta = datosTransferencia(sedeId)
  return (
    <div className="flex flex-col items-center gap-2 bg-white rounded-2xl p-4 border border-coal/10">
      <p className="font-body text-xs text-coal/60 text-center font-semibold">
        {INSTRUCCION_TRANSFERENCIA}
      </p>
      <img
        src={import.meta.env.BASE_URL + cuenta.qr}
        alt={`QR ${cuenta.banco} ${cuenta.titular}`}
        className="w-52 h-52 object-contain"
      />
      {/* Cuenta / llave para transferir (por si no puede escanear el QR) */}
      <div className="w-full bg-smoked/50 rounded-xl px-3 py-2 flex flex-col items-center gap-0.5">
        <p className="font-body text-[11px] text-coal/50 uppercase tracking-wider">Cuenta / llave para transferir</p>
        <p className="font-body text-xs text-coal/70 font-semibold">{cuenta.banco} {cuenta.tipo}</p>
        <p className="font-body text-lg font-bold text-coal tracking-widest text-center select-all">
          {cuenta.numeroVisible}
        </p>
        <p className="font-body text-[11px] text-coal/50">{cuenta.titular}</p>
      </div>
    </div>
  )
}

// Con qué billete paga el cliente un monto en efectivo, y cuánto cambio lleva.
// Se usa para el total (Efectivo) y para la parte en efectivo del Mixto.
function SelectorBillete({ monto, billete, onChange, titulo }) {
  return (
    <div className="bg-mustard/10 border border-mustard/30 rounded-2xl p-4 flex flex-col gap-3">
      <p className="font-body text-sm font-semibold text-coal">{titulo}</p>
      <div className="flex flex-wrap gap-2">
        <button type="button" onClick={() => onChange(monto)}
          className={`px-3 py-1.5 rounded-xl border font-body text-sm font-semibold transition-colors ${
            billete === monto ? 'bg-mint text-cream border-mint' : 'bg-cream border-mint/40 text-coal'
          }`}>
          Exacto
        </button>
        {[20000, 50000, 100000, 200000].filter(b => b > monto).map(b => (
          <button key={b} type="button" onClick={() => onChange(b)}
            className={`px-3 py-1.5 rounded-xl border font-body text-sm font-semibold transition-colors ${
              billete === b ? 'bg-mustard text-cream border-mustard' : 'bg-cream border-mustard/40 text-coal'
            }`}>
            ${b.toLocaleString('es-CO')}
          </button>
        ))}
      </div>
      <div>
        <label className="label-field">O escribe con cuánto pagas</label>
        <input type="number" inputMode="numeric" className="input-field" placeholder="Ej: 50000"
          value={billete ?? ''}
          onChange={e => { const v = parseFloat(e.target.value); onChange(isNaN(v) ? null : v) }} />
      </div>
      {billete != null && (
        billete < monto ? (
          <p className="font-body text-sm text-pepper font-semibold flex items-center gap-1.5">
            <AlertCircle size={15} aria-hidden="true" /> No alcanza: faltan ${(monto - billete).toLocaleString('es-CO')}
          </p>
        ) : billete === monto ? (
          <p className="font-body text-sm text-mint font-semibold flex items-center gap-1.5">
            <Check size={15} aria-hidden="true" /> Pagas exacto, no necesitas cambio
          </p>
        ) : (
          <div className="flex items-center justify-between">
            <p className="font-body text-sm text-coal font-semibold">Tu cambio será:</p>
            <p className="font-display text-2xl text-tangelo">${(billete - monto).toLocaleString('es-CO')}</p>
          </div>
        )
      )}
    </div>
  )
}

// Pago dentro del checkout: el cliente ya sabe cuánto es, así que paga aquí y a
// la caja le llega el pedido completo para aceptarlo.
function PagoEnCheckout({ form, set, total, saldoUsado = 0, productos, domicilio, pickup, comprobante, setComprobante, sedeId }) {
  const [archivoError, setArchivoError] = useState('')
  const metodo = form.payment
  const billete = form.billete

  const elegirArchivo = (e) => {
    const file = e.target.files?.[0]
    if (!file) return
    if (file.size > 10 * 1024 * 1024) { setArchivoError('El archivo no puede superar 10 MB'); return }
    setArchivoError('')
    setComprobante(file)
  }

  return (
    <div className="bg-cherry/5 border-2 border-cherry/30 rounded-2xl p-4 flex flex-col gap-3">
      <p className="font-display text-base tracking-wide text-cherry flex items-center gap-2">
        <CreditCard size={18} aria-hidden="true" /> Paga tu pedido
      </p>

      {/* Resumen del valor */}
      <div className="bg-cream rounded-xl px-4 py-3 flex flex-col gap-1.5">
        <div className="flex justify-between font-body text-sm">
          <span className="text-coal/60">Productos:</span>
          <span className="font-semibold">${productos.toLocaleString('es-CO')}</span>
        </div>
        <div className="flex justify-between font-body text-sm">
          <span className="text-coal/60">Domicilio:</span>
          <span className="font-semibold">{pickup ? 'Recoges en sede' : `$${domicilio.toLocaleString('es-CO')}`}</span>
        </div>
        {saldoUsado > 0 && (
          <div className="flex justify-between font-body text-sm text-mint font-semibold">
            <span>Saldo a favor:</span>
            <span>−${saldoUsado.toLocaleString('es-CO')}</span>
          </div>
        )}
        <div className="border-t border-coal/10 pt-2 flex justify-between items-center">
          <span className="font-body font-bold text-coal">TOTAL A PAGAR:</span>
          <span className="font-display text-2xl text-cherry">${total.toLocaleString('es-CO')}</span>
        </div>
      </div>

      {total === 0 && (
        <p className="font-body text-sm font-semibold text-mint">
          Tu saldo a favor cubre todo el pedido: no tienes que pagar nada.
        </p>
      )}
      {total > 0 && (<>

      <div>
        <label className="label-field">¿Cómo vas a pagar? *</label>
        <div className="grid grid-cols-2 gap-2">
          {[
            ['Efectivo',      Banknote],
            ['Transferencia', Building2],
            ['Nequi',         Smartphone],
            ['Mixto',         Shuffle],
          ].map(([valor, IconoPago]) => (
            <button key={valor} type="button" onClick={() => set('payment', valor)}
              className={`btn btn-sm w-full justify-center border-2 ${
                metodo === valor ? 'border-cherry bg-cherry/10 text-cherry' : 'border-coal/15 text-coal/60 bg-cream'
              }`}>
              <IconoPago size={16} aria-hidden="true" /> {valor}
            </button>
          ))}
        </div>
      </div>

      {/* Efectivo: con qué billete, para que el domiciliario lleve el cambio */}
      {metodo === 'Efectivo' && (
        <SelectorBillete
          monto={total}
          billete={billete}
          onChange={v => set('billete', v)}
          titulo={pickup ? '¿Con qué billete vas a pagar en la sede?' : '¿Con qué billete le vas a pagar al domiciliario?'}
        />
      )}

      {/* Mixto: cuánto va en cada forma (tiene que sumar el total) */}
      {metodo === 'Mixto' && (
        <div className="bg-smoked/50 rounded-2xl p-4 flex flex-col gap-3">
          <p className="font-body text-xs text-coal/70 font-semibold">
            ¿Cuánto pagas en cada forma? Debe sumar ${total.toLocaleString('es-CO')}.
          </p>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="label-field">En efectivo</label>
              <input className="input-field" type="number" min="0" inputMode="numeric" placeholder="$0"
                value={form.mixtoEfectivo}
                onChange={e => {
                  // Se completa sola la otra parte: el cliente escribe una y ya.
                  const ef = e.target.value
                  set('mixtoEfectivo', ef)
                  const n = Number(ef)
                  if (n > 0 && n < total) set('mixtoTransferencia', String(total - n))
                }} />
            </div>
            <div>
              <label className="label-field">Por transferencia</label>
              <input className="input-field" type="number" min="0" inputMode="numeric" placeholder="$0"
                value={form.mixtoTransferencia}
                onChange={e => set('mixtoTransferencia', e.target.value)} />
            </div>
          </div>
          {Number(form.mixtoEfectivo) > 0 && (
            <SelectorBillete
              monto={Number(form.mixtoEfectivo)}
              billete={billete}
              onChange={v => set('billete', v)}
              titulo={`¿Con qué billete pagas los $${Number(form.mixtoEfectivo).toLocaleString('es-CO')} en efectivo?`}
            />
          )}
        </div>
      )}

      {/* Transferencia / Nequi / Mixto: QR y comprobante OBLIGATORIO */}
      {llevaComprobante(metodo) && (
        <div className="flex flex-col gap-3">
          <DatosTransferencia sedeId={sedeId} />
          <p className="font-body text-xs text-coal/70 leading-relaxed">
            Transfiere <strong>
              ${(metodo === 'Mixto' ? (Number(form.mixtoTransferencia) || 0) : total).toLocaleString('es-CO')}
            </strong> y sube la captura del comprobante. <strong>Sin comprobante no se puede enviar el pedido.</strong>
          </p>
          <label className={`flex items-center justify-center gap-2 w-full py-3 rounded-xl border-2 border-dashed cursor-pointer transition-colors ${
            comprobante ? 'border-mint/50 bg-mint/10' : 'border-coal/20 hover:border-tangelo/50 hover:bg-tangelo/5'
          }`}>
            <input type="file" accept="image/*,.pdf" className="hidden" onChange={elegirArchivo} />
            {comprobante
              ? <Check size={16} className="text-mint flex-shrink-0" aria-hidden="true" />
              : <Upload size={16} className="text-coal/50 flex-shrink-0" aria-hidden="true" />}
            <span className={`font-body text-sm ${comprobante ? 'text-mint font-semibold' : 'text-coal/60'}`}>
              {comprobante ? `${comprobante.name} — tocar para cambiar` : 'Subir comprobante (imagen o PDF)'}
            </span>
          </label>
          {archivoError && <p className="font-body text-xs text-pepper">{archivoError}</p>}
        </div>
      )}

      </>)}

      <p className="font-body text-[11px] text-coal/55 leading-relaxed">
        Al enviar, tu pedido llega completo a la caja. Apenas lo acepten te avisamos
        y empieza la preparación.
      </p>
    </div>
  )
}

function ClientOrderForm({ user, sede, perfil, onSubmit, onCancel, availableRewards = [], creditos = [], onCambiarSede }) {
  // Sube cuando confirma el correo (Firebase actualiza la cuenta sin avisar a React).
  const [, setCorreoListo] = useState(0)
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
    // De dónde salió el pin ('mapa', 'google', 'photon'): sirve para auditar.
    addrPinFuente:      null,
    barrio:             '',
    reference:          '',
    items:              '',
    payment:            '',
    notes:              '',
    mixtoEfectivo:      '',
    mixtoTransferencia: '',
    billete:            null,   // con cuánto paga en efectivo (pago adelantado)
  })
  // Archivo del comprobante: no va en el borrador (un archivo no se puede
  // guardar en localStorage); si recarga, lo vuelve a elegir.
  const [comprobante,       setComprobante]       = useState(null)
  const [subiendo,          setSubiendo]          = useState(null)  // % de subida
  const [loading,           setLoading]           = useState(false)
  const [errors,            setErrors]            = useState([])
  const [fromMenu,          setFromMenu]          = useState(false)
  const [menuTotal,         setMenuTotal]         = useState(0)
  // El cliente pidió que la caja revise el valor del domicilio: se manda a
  // cotizar a mano, como toda la vida, en vez de cobrarle el automático.
  const [pidioRevisión,     setPidioRevisión]     = useState(false)
  // Productos del carrito del menú con sus ids, para la API (null = no hay carrito).
  const [carritoApi,        setCarritoApi]        = useState(null)
  // Una clave por pedido: si el envío se reintenta, el servidor no lo duplica.
  const claveEnvio = useRef(nuevaClave())
  const errorsRef = useRef(null)

  // ─── Domicilio automático ──────────────────────────────────────────────────
  // Solo si la sede lo tiene activo Y la dirección trae pin. Sin pin no se
  // inventa precio: cae a la cotización de la caja, como antes.
  // Se cobra por RECORRIDO (Google Maps, vía backend). Mientras se mide no se
  // muestra precio; si no se pudo medir, se cobra en línea recta (respaldo).
  const conPin = form.deliveryMode === 'delivery' && !!sede?.tarifaAutomatica && !!sede?.coords &&
    form.addrLat != null && form.addrLng != null
  const kmLinea = useMemo(() => (conPin
    ? kmLineaRecta(sede.coords, { lat: Number(form.addrLat), lng: Number(form.addrLng) })
    : null), [conPin, form.addrLat, form.addrLng, sede])

  // { clave, km, min } del último recorrido medido; km null = no se pudo medir.
  // Se mide también desde la otra sede, para sugerirla si le queda más cerca.
  const claveRuta = conPin ? `${sede.coords.lat},${sede.coords.lng},${form.addrLat},${form.addrLng}` : null
  const otraSede = sede?.id ? Object.values(SEDES).find(s => s.id !== sede.id && s.tarifaAutomatica && s.coords) : null
  const [ruta, setRuta] = useState({ clave: null, km: null, min: null, otra: null })
  useEffect(() => {
    if (!claveRuta) return
    let vigente = true
    const pin = { lat: form.addrLat, lng: form.addrLng }
    // Espera a que el cliente deje quieto el pin antes de consultar.
    const t = setTimeout(() => {
      Promise.all([
        medirRuta(sede.coords, pin),
        otraSede ? medirRuta(otraSede.coords, pin) : null,
      ]).then(([propia, otra]) => {
        if (vigente) setRuta({ clave: claveRuta, km: propia?.km ?? null, min: propia?.min ?? null, otra })
      })
    }, 500)
    return () => { vigente = false; clearTimeout(t) }
  }, [claveRuta]) // eslint-disable-line react-hooks/exhaustive-deps
  const midiendoRuta = !!claveRuta && ruta.clave !== claveRuta

  const distancia = conPin && !midiendoRuta
    ? distanciaParaCobrar({ kmRecorrido: ruta.km, kmLinea })
    : null
  const kmSede = distancia?.km ?? null
  const tarifa = midiendoRuta
    ? { estado: 'midiendo', precio: null }
    : precioDomicilio(kmSede, distancia?.medida ?? LINEA_RECTA)
  // Se le cobra automático solo si hay precio y el cliente no pidió revisión.
  const cobroAutomático = tarifa.estado === 'ok' && !pidioRevisión

  // ¿Le queda más cerca la otra sede? Solo con ambas medidas por calle.
  const sugerencia = distancia?.medida === 'recorrido' && otraSede
    ? sugerirOtraSede({ kmPropia: kmSede, precioPropio: tarifa.precio }, ruta.otra)
    : null

  // Sin tiempo estimado en el checkout (especificación §8.1, decisión C4 del
  // 18 oct 2026): la hora de llegada aparece cuando el pedido sale.

  // Con el valor completo conocido, el cliente paga al enviar y la caja solo
  // acepta. Reglas en src/utils/pagoAdelantado.js.
  const pagoAhora = aplicaPagoAdelantado({
    fromMenu, menuTotal, deliveryMode: form.deliveryMode, domicilioAutomatico: cobroAutomático,
  })
  const precioDom = form.deliveryMode === 'delivery' && cobroAutomático ? tarifa.precio : 0
  const totalBruto = totalAPagar({ menuTotal, deliveryMode: form.deliveryMode, precioDomicilio: precioDom })
  // Saldo a favor: se usa por defecto; el cliente puede guardarlo.
  const [usarMiSaldo, setUsarMiSaldo] = useState(true)
  const saldo = creditos.reduce((t, c) => t + (Number(c.monto) || 0), 0)
  const conSaldo = usarMiSaldo && saldo > 0
  const saldoCalc = aplicarSaldo(totalBruto, conSaldo ? saldo : 0)
  // Con pago adelantado el cliente paga el total ya descontado.
  const total = saldoCalc.aPagar

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
      // Reglas de caducidad, precio por línea y total recalculado viven en
      // src/utils/handoff.js (módulo puro con pruebas en tests/).
      let parsed = parseHandoff(localStorage.getItem('ds_cart_handoff'))
      if (parsed?.stale) {
        // El paquete del checkout caducó. Antes se descartaba sin más y el
        // cliente llegaba a un formulario VACÍO aunque su carrito del menú
        // siguiera lleno (el carrito dura 12 h y el paquete 6 h): pasaba con
        // quien arma el pedido antes de que abra la plataforma. Ahora se
        // reconstruye desde el carrito del menú, que es la misma información.
        localStorage.removeItem('ds_cart_handoff')
        parsed = null
      }
      if (!parsed) parsed = parseMenuCart(localStorage.getItem('ds_cart_items'))
      setCarritoApi(carritoParaApi(localStorage.getItem('ds_cart_items')))
      if (!parsed) return

      setForm(f => ({ ...f, items: parsed.itemsText }))
      setFromMenu(true)
      setMenuTotal(parsed.total)
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


  // Permiso para promociones por correo (Ley 1581): casilla desmarcada por
  // defecto, solo para quien entró con una cuenta que tiene correo. Solo se
  // guarda cuando la marca; si no, se le vuelve a ofrecer en otro pedido.
  // promoGuardada: undefined = cargando; si no, lo guardado (o null).
  const [promoGuardada, setPromoGuardada] = useState(undefined)
  const [quierePromos,  setQuierePromos]  = useState(false)
  const ofrecerPromos = !!user?.email && promoGuardada !== undefined && debeOfrecerPromos(promoGuardada)

  useEffect(() => {
    if (!user?.uid) return
    getDoc(doc(db, 'customers', user.uid)).then(snap => {
      if (!snap.exists()) { setPromoGuardada(null); return }
      const data = snap.data()
      setPromoGuardada(data.promociones ?? null)
      setForm(f => ({
        ...f,
        name:  data.name  || f.name,
        phone: data.phone || f.phone,
      }))
    }).catch(() => {})
  }, [user?.uid])

  // Lo que el cliente acaba de completar en "Completa tus datos" llena los
  // campos vacíos (sin pisar lo que ya escribió aquí).
  useEffect(() => {
    if (!perfil) return
    setForm(f => ({ ...f, name: f.name || perfil.name || '', phone: f.phone || perfil.phone || '' }))
  }, [perfil?.name, perfil?.phone]) // eslint-disable-line react-hooks/exhaustive-deps

  const set = (k, v) => setForm(f => ({ ...f, [k]: v }))

  // Código promocional (ver utils/codigos.js). "Una vez por cuenta" se revisa
  // contra los pedidos de esta cuenta que ya lo usaron.
  const [codigoTexto,    setCodigoTexto]    = useState('')
  const [codigoAplicado, setCodigoAplicado] = useState(null)
  const [codigoError,    setCodigoError]    = useState('')
  const [revisandoCodigo, setRevisandoCodigo] = useState(false)
  const yaUsoCodigo = async codigo => {
    if (!user?.uid) return false
    try {
      const prev = await getDocs(query(collection(db, 'orders'),
        where('clientUid', '==', user.uid), where('codigoPromo', '==', codigo), limit(1)))
      return !prev.empty
    } catch { return false }
  }
  const aplicarCodigo = async () => {
    setCodigoError('')
    setRevisandoCodigo(true)
    const base = { items: form.items, tieneCuenta: !!user?.email && !user?.isAnonymous }
    let r = validarCodigo(codigoTexto, base)
    if (r.ok) r = validarCodigo(codigoTexto, { ...base, yaLoUso: await yaUsoCodigo(r.codigo) })
    setRevisandoCodigo(false)
    if (r.ok) { setCodigoAplicado(r.codigo); setCodigoTexto('') }
    else setCodigoError(r.motivo)
  }


  const handleSubmit = async () => {
    const errs = []
    if (!form.name.trim())        errs.push('El nombre es obligatorio')
    if (!form.phone.trim())       errs.push('El teléfono / WhatsApp es obligatorio')
    if (form.deliveryMode === 'delivery' && !form.fullAddress.trim()) errs.push('La dirección es obligatoria')
    if (form.deliveryMode === 'delivery' && midiendoRuta) errs.push('Estamos calculando el valor del domicilio, intenta de nuevo en un segundo')
    if (!carritoApi?.items.length && !carritoApi?.rearmar.length) errs.push('Elige tus productos en el menú para hacer el pedido')
    else if (carritoApi.rearmar.length) errs.push(`Vuelve a agregar desde el menú: ${carritoApi.rearmar.join(', ')}. El menú cambió desde que lo pusiste en el carrito.`)
    // Cuenta de correo sin confirmar: primero el enlace (el borrador se conserva).
    if (!user || user.isAnonymous) errs.push('Entra a tu cuenta para enviar el pedido (tu carrito se conserva).')
    if (faltaVerificarCorreo(user)) errs.push('Confirma tu correo para enviar el pedido: abre el enlace que te enviamos.')
    // Si el cliente cambió el pedido después de aplicar el código, se revisa de nuevo.
    if (codigoAplicado) {
      const r = validarCodigo(codigoAplicado, { items: form.items, tieneCuenta: !!user?.email && !user?.isAnonymous })
      if (!r.ok) { setCodigoAplicado(null); errs.push(`Quitamos el código: ${r.motivo}`) }
    }
    // Con el valor completo conocido, el pago se elige aquí mismo. Si no, el
    // cliente lo escoge después de que la caja cotice (ClientOrderDetail).
    if (pagoAhora) {
      errs.push(...erroresPago({
        metodo: form.payment, total, billete: form.billete,
        mixtoEfectivo: form.mixtoEfectivo, mixtoTransferencia: form.mixtoTransferencia,
        comprobante,
      }))
    }
    if (errs.length) { setErrors(errs); return }
    setLoading(true)
    submittingRef.current = true
    try {
      const delivery = form.deliveryMode === 'delivery'
      await onSubmit({
        clave: claveEnvio.current,
        cuerpo: {
          sedeId:       sede?.id,
          origen:       'web',
          deliveryMode: form.deliveryMode,
          nombre:       form.name.trim(),
          telefono:     form.phone.trim(),
          direccion:    delivery ? form.fullAddress.trim() : '',
          barrio:       delivery ? form.barrio : '',
          referencia:   delivery ? form.reference : '',
          notas:        form.notes,
          ...(delivery && form.addrLat != null && form.addrLng != null
            ? { coords: { lat: Number(form.addrLat), lng: Number(form.addrLng) }, pinFuente: form.addrPinFuente || 'app' }
            : {}),
          // Pidió que la caja revise el valor: no se cobra el automático.
          ...(delivery && pidioRevisión ? { revisarDomicilio: true } : {}),
          items:        carritoApi.items,
          ...(codigoAplicado ? { codigo: codigoAplicado } : {}),
          ...(redeemCount > 0 ? { premios: redeemCount } : {}),
          usarSaldo:    conSaldo,
        },
        // Pago adelantado: se registra en cuanto el pedido existe (el comprobante
        // va a la carpeta del pedido, que el servidor crea).
        pago: pagoAhora ? {
          metodo: total === 0 ? undefined : form.payment,
          ...(form.billete != null ? { billete: Number(form.billete) } : {}),
          ...(form.payment === 'Mixto'
            ? { mixtoEfectivo: Number(form.mixtoEfectivo), mixtoTransferencia: Number(form.mixtoTransferencia) }
            : {}),
        } : null,
        comprobante: pagoAhora && llevaComprobante(form.payment) ? comprobante : null,
        onSubiendo:  setSubiendo,
      })
      if (ofrecerPromos && quierePromos) {
        setDoc(doc(db, 'customers', user.uid), {
          promociones: { acepta: true, fecha: serverTimestamp(), fuente: 'checkout', email: user.email },
        }, { merge: true }).catch(() => {})
      }
    } catch (err) {
      // Falló el envío: se reactiva el autoguardado para no perder el borrador.
      submittingRef.current = false
      const msg = err instanceof ErrorApi
        ? (err.status === 401 ? 'Tu sesión venció. Recarga la página y vuelve a entrar.' : err.message)
        : err?.code === 'permission-denied'
        ? 'Sin permisos para enviar el pedido. Recarga la app e intenta de nuevo.'
        : err?.code?.startsWith?.('storage/')
          ? 'No se pudo subir el comprobante. Revisa tu conexión e intenta de nuevo.'
          : 'Error al enviar el pedido. Verifica tu conexión e intenta de nuevo.'
      setErrors([msg])
    } finally {
      setLoading(false)
      setSubiendo(null)
    }
  }

  return (
    <div className="flex flex-col gap-4">
      {/* Info banner */}
      <div className="card-quiet flex items-center gap-3 py-3">
        <MapPin size={18} className="text-cherry flex-shrink-0" aria-hidden="true" />
        <div className="min-w-0">
          <p className="font-body text-[11px] uppercase tracking-wider text-coal/45">Pides en</p>
          <p className="font-body text-sm font-semibold text-coal truncate">{sede?.name}</p>
        </div>
      </div>

      {/* Tipo de entrega: domicilio o recoger en sede */}
      <div>
        <label className="label-field">¿Cómo quieres recibir tu pedido? *</label>
        <div className="grid grid-cols-2 gap-3">
          <button
            type="button"
            onClick={() => set('deliveryMode', 'delivery')}
            className={`btn w-full justify-center border-2 ${
              form.deliveryMode === 'delivery' ? 'border-cherry bg-cherry/10 text-cherry' : 'border-coal/20 text-coal/50'
            }`}
          >
            <Bike size={18} aria-hidden="true" /> Domicilio
          </button>
          <button
            type="button"
            onClick={() => set('deliveryMode', 'pickup')}
            className={`btn w-full justify-center border-2 ${
              form.deliveryMode === 'pickup' ? 'border-cherry bg-cherry/10 text-cherry' : 'border-coal/20 text-coal/50'
            }`}
          >
            <Store size={18} aria-hidden="true" /> Recoger
          </button>
        </div>
      </div>

      {/* Aviso de cotización: solo cuando la caja tiene que poner el precio.
          Con pago adelantado el cliente ve el total y paga aquí mismo. */}
      {!pagoAhora && (
        <div className="bg-tangelo/10 border border-tangelo/30 rounded-xl px-4 py-3 flex items-start gap-2">
          <Info size={16} className="text-tangelo flex-shrink-0 mt-0.5" />
          <p className="font-body text-xs text-coal/70 leading-relaxed">
            Después de realizar tu pedido, <strong>espera a que el cajero cotice el precio</strong> y te lo devuelva
            por este mismo medio. No pagues hasta recibir la cotización.
          </p>
        </div>
      )}

      {user?.isAnonymous && <AvisoInvitado compacto />}
      {/* Cuenta de correo sin confirmar: el aviso va aquí también (el formulario
          ocupa toda la pantalla y tapa el del panel) */}
      {faltaVerificarCorreo(user) && (
        <AvisoVerificarCorreo email={user.email} onVerificado={() => { setCorreoListo(n => n + 1); setErrors([]) }} />
      )}

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

      {ofrecerPromos && (
        <label className="flex items-start gap-2.5 cursor-pointer select-none -mt-1">
          <input type="checkbox" checked={quierePromos} onChange={e => setQuierePromos(e.target.checked)}
            className="mt-0.5 w-4 h-4 accent-cherry flex-shrink-0" />
          <span className="font-body text-xs text-coal/70 leading-relaxed">
            Quiero recibir promociones de DeliStars en mi correo ({user.email}). Puedes darte de baja cuando quieras.
          </span>
        </label>
      )}

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
            addrPinFuente: a.pinFuente ?? null,
          }))}
        />

        {/* Resumen de la dirección elegida + aviso NO restrictivo de barrio */}
        {form.fullAddress && (midiendoRuta || (!cobroAutomático && tarifa.estado !== 'fuera_de_rango')) && (
          <p className="mt-2 font-body text-xs text-coal/55 leading-relaxed">
            {midiendoRuta
              ? 'Calculando el valor del domicilio…'
              : 'El valor del domicilio se confirma en caja antes de que pagues.'}
          </p>
        )}

        {/* Domicilio calculado: el cliente ve el valor de una vez, sin esperar
            a que la caja cotice. */}
        {form.fullAddress && cobroAutomático && (
          <div className="mt-2 bg-white border-2 border-mint/40 rounded-xl px-4 py-3">
            <div className="flex items-center justify-between gap-3">
              <div className="min-w-0">
                <p className="font-body text-[11px] font-bold uppercase tracking-wider text-coal/45">
                  Domicilio
                </p>
                <p className="font-body text-[11px] text-coal/50 mt-0.5">
                  A {explicarTarifa(tarifa, kmSede)}
                </p>
              </div>
              <p className="font-display text-2xl text-mint tracking-wide flex-shrink-0">
                ${tarifa.precio.toLocaleString('es-CO')}
              </p>
            </div>
            <button
              type="button"
              onClick={() => setPidioRevisión(true)}
              className="btn-link text-xs"
            >
              ¿Te parece caro? Pide que la caja lo revise
            </button>
          </div>
        )}

        {/* La otra sede le queda más cerca: se le sugiere, sin obligarlo. */}
        {form.fullAddress && sugerencia && (
          <div className="mt-2 bg-mint/10 border border-mint/40 rounded-xl px-4 py-3">
            <p className="font-body text-xs text-coal/80 leading-relaxed">
              <strong>{otraSede.name}</strong> te queda más cerca: {sugerencia.km.toFixed(1)} km por calle
              {sugerencia.ahorro > 0
                ? <> y el domicilio vale <strong>${sugerencia.precio.toLocaleString('es-CO')}</strong> (ahorras ${sugerencia.ahorro.toLocaleString('es-CO')}).</>
                : <>, así te llega más rápido.</>}
            </p>
            {fromMenu ? (
              <p className="font-body text-[11px] text-coal/55 mt-1">
                Tu carrito es del menú de {sede.name}. Si prefieres {otraSede.name}, vuelve al menú y elige esa sede.
              </p>
            ) : onCambiarSede && (
              <button type="button" onClick={() => onCambiarSede(otraSede)} className="btn-link text-xs">
                Pedir en {otraSede.name}
              </button>
            )}
          </div>
        )}

        {/* Pidió revisión: vuelve al flujo de cotización manual */}
        {form.fullAddress && pidioRevisión && tarifa.estado === 'ok' && (
          <div className="mt-2 bg-mustard/10 border border-mustard/40 rounded-xl px-4 py-3">
            <p className="font-body text-xs text-coal/70 leading-relaxed">
              Listo: la caja va a revisar el valor de tu domicilio y te lo confirma
              antes de que pagues.
            </p>
            <button
              type="button"
              onClick={() => setPidioRevisión(false)}
              className="btn-link text-xs"
            >
              Mejor cóbrame los ${tarifa.precio.toLocaleString('es-CO')}
            </button>
          </div>
        )}

        {/* Fuera de cobertura: no se bloquea el pedido, se ofrece recoger */}
        {form.fullAddress && tarifa.estado === 'fuera_de_rango' && (
          <div className="mt-2 bg-cherry/10 border border-cherry/30 rounded-xl px-4 py-3">
            <p className="font-body text-sm font-semibold text-cherry">
              Estás a {kmSede.toFixed(1)} km{distancia?.medida === 'recorrido' ? ' por calle' : ''} — muy lejos para domicilio
            </p>
            <p className="font-body text-xs text-coal/60 leading-relaxed mt-1">
              Solo llevamos hasta {tarifa.maxKm} km{distancia?.medida === 'recorrido' ? ' por calle' : ''} desde la sede. Puedes pedirlo y
              recogerlo tú en la sede, sin costo de domicilio.
            </p>
            <button
              type="button"
              onClick={() => setForm(f => ({ ...f, deliveryMode: 'pickup' }))}
              className="btn-secondary btn-sm mt-2"
            >
              Cambiar a recoger en sede
            </button>
          </div>
        )}
      </div>
      )}

      <div>
        <label className="label-field">Tu pedido</label>
        {/* Los productos se escogen en el menú: el servidor los cobra con los
            precios del catálogo, así que aquí ya no se escriben a mano. */}
        {form.items.trim() ? (
          <div className="card-quiet max-h-56 overflow-y-auto scroll-custom py-2">
            <ListaItems texto={form.items} />
          </div>
        ) : (
          <div className="bg-coal/5 border border-dashed border-coal/20 rounded-xl px-4 py-4 text-center">
            <p className="font-body text-sm text-coal/70">Tu carrito está vacío.</p>
          </div>
        )}
        {(!carritoApi || carritoApi.rearmar.length > 0 || !carritoApi.items.length) && (
          <a href="/" className="btn-secondary w-full mt-2">
            {carritoApi?.rearmar.length ? `Volver a agregar ${carritoApi.rearmar.join(', ')}` : 'Elegir mis productos en el menú'}
          </a>
        )}
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
        <div className={`rounded-2xl p-4 border-2 transition-colors ${
          redeemCount > 0 ? 'bg-mint border-mint' : 'bg-mint/10 border-mint'}`}>
          <p className={`font-display text-xl tracking-wide ${redeemCount > 0 ? 'text-cream' : 'text-mint'}`}>
            <Gift size={18} className="inline-block mr-1.5 -mt-0.5" aria-hidden="true" />
            {sortedRewards.length > 1 ? `Tienes ${sortedRewards.length} premios de fidelización` : 'Tienes un premio de fidelización'}
          </p>
          <p className={`font-body text-sm mt-1 leading-relaxed ${redeemCount > 0 ? 'text-cream/90' : 'text-coal/75'}`}>
            {sortedRewards.length > 1 ? 'Cada premio incluye' : 'Incluye'}, <strong>GRATIS</strong>: 1 Hamburguesa Especial + 1 Perro Grande con tocineta.
            {venceTexto(sortedRewards[0]) && <> Vence el <strong>{venceTexto(sortedRewards[0])}</strong>.</>}
          </p>
          <div className="flex flex-col gap-2 mt-3">
            {Array.from({ length: sortedRewards.length }, (_, i) => i + 1).map(n => (
              <button key={n} type="button" onClick={() => setRedeemCount(n)}
                className={`btn w-full justify-center border-2 ${
                  redeemCount === n ? 'bg-cream text-mint border-cream'
                    : redeemCount > 0 ? 'border-cream/50 text-cream' : 'border-mint bg-cream text-mint'
                }`}>
                {redeemCount === n && <Check size={16} aria-hidden="true" />}
                {sortedRewards.length > 1 ? `Usar ${n} premio${n > 1 ? 's' : ''} en este pedido` : 'Usar mi premio en este pedido'}
              </button>
            ))}
            <button type="button" onClick={() => setRedeemCount(0)}
              className={`w-full py-2 text-xs font-semibold font-body underline underline-offset-2 ${
                redeemCount > 0 ? 'text-cream/80' : 'text-coal/60'}`}>
              {redeemCount === 0 ? 'Por ahora lo guardo para otro pedido' : 'Mejor guardarlo para otro pedido'}
            </button>
          </div>
          {redeemCount > 0 && (
            <p className="font-body text-xs text-cream mt-2 leading-relaxed">
              Listo: tu pedido llevará {redeemCount > 1 ? `${redeemCount}x ` : ''}Hamburguesa Especial + Perro Grande con tocineta
              <strong> sin costo</strong>. No tienes que agregarlos al carrito.
            </p>
          )}
        </div>
      )}

      {/* Código promocional */}
      <div>
        <label className="label-field">¿Tienes un código?</label>
        {codigoAplicado ? (
          <div className="flex items-center justify-between gap-2 bg-mint/10 border border-mint/40 rounded-xl px-3 py-2.5">
            <p className="font-body text-sm text-coal flex items-center gap-1.5">
              <Check size={15} className="text-mint flex-shrink-0" aria-hidden="true" />
              <span><strong>{codigoAplicado}</strong>: {CODIGOS[codigoAplicado].descripcion}</span>
            </p>
            <button type="button" onClick={() => setCodigoAplicado(null)}
              className="btn-link text-xs flex-shrink-0">Quitar</button>
          </div>
        ) : (
          <>
            <div className="flex gap-2">
              <input className="input-field flex-1 uppercase" value={codigoTexto} placeholder="Ej: STAR"
                onChange={e => { setCodigoTexto(e.target.value); setCodigoError('') }} autoCapitalize="characters" />
              <button type="button" onClick={aplicarCodigo} disabled={!codigoTexto.trim() || revisandoCodigo}
                className="btn-secondary btn-sm flex-shrink-0">{revisandoCodigo ? 'Revisando…' : 'Aplicar'}</button>
            </div>
            {codigoError && <p className="font-body text-xs text-red-600 mt-1">{codigoError}</p>}
          </>
        )}
      </div>

      <div>
        <label className="label-field">Indicaciones adicionales</label>
        <textarea className="textarea-field h-16 scroll-custom" value={form.notes}
          onChange={e => set('notes', e.target.value)}
          placeholder="Sin cebolla, extra salsa, timbre 2B…" />
      </div>

      {saldo > 0 && (
        <div className={`rounded-2xl p-4 border-2 ${conSaldo ? 'bg-mint/15 border-mint' : 'bg-cream border-coal/15'}`}>
          <p className="font-display text-base tracking-wide text-mint flex items-center gap-2">
            <Wallet size={17} aria-hidden="true" /> Tienes ${saldo.toLocaleString('es-CO')} a favor
          </p>
          <label className="flex items-center gap-2 mt-2 font-body text-sm text-coal cursor-pointer">
            <input type="checkbox" checked={usarMiSaldo} onChange={e => setUsarMiSaldo(e.target.checked)} className="w-5 h-5 accent-[#2a9d7a]" />
            Usar mi saldo en este pedido
          </label>
          {conSaldo && (
            <p className="font-body text-xs text-coal/70 mt-1.5 leading-relaxed">
              {pagoAhora
                ? (saldoCalc.sobrante > 0
                    ? <>Cubre todo el pedido y te quedan <strong>${saldoCalc.sobrante.toLocaleString('es-CO')}</strong> a favor.</>
                    : <>Se descuentan <strong>${saldoCalc.usado.toLocaleString('es-CO')}</strong> del total.</>)
                : 'Se descuenta cuando la caja te envíe la cotización.'}
            </p>
          )}
        </div>
      )}

      {pagoAhora && (
        <PagoEnCheckout
          sedeId={sede?.id}
          form={form}
          set={set}
          total={total}
          saldoUsado={saldoCalc.usado}
          productos={menuTotal}
          domicilio={precioDom}
          pickup={form.deliveryMode === 'pickup'}
          comprobante={comprobante}
          setComprobante={setComprobante}
        />
      )}

      {/* Aviso: el domicilio se cotiza después; el pago se elige luego.
          En "recoger en sede" no hay domicilio que cotizar. */}
      {!pagoAhora && (
      <div className="bg-tangelo/10 border border-tangelo/30 rounded-2xl p-4 flex items-start gap-3">
        <Clock size={20} className="text-tangelo flex-shrink-0 mt-0.5" aria-hidden="true" />
        <div className="flex flex-col gap-1">
          <p className="font-display text-base tracking-wide text-tangelo">
            {form.deliveryMode === 'pickup' ? 'La caja confirmará tu pedido' : 'Falta cotizar tu domicilio'}
          </p>
          <p className="font-body text-xs text-coal/70 leading-relaxed">
            {form.deliveryMode === 'pickup' ? (
              <>Como vas a <strong>recoger en sede</strong>, no se cobra domicilio. La caja
                confirma tu pedido y lo pasa a preparación; te avisamos cuando esté listo.</>
            ) : (
              <>Al enviar tu pedido, la caja revisará si puede entregarlo y te enviará el
                <strong> valor del domicilio</strong>. El método de pago lo eliges
                <strong> después de la cotización</strong> — así evitas pagar por un pedido
                que luego no podamos entregar.</>
            )}
          </p>
        </div>
      </div>
      )}

      <div className="flex flex-col gap-2 pt-2">
        <button onClick={handleSubmit} disabled={loading} className="btn-primary w-full btn-lg">
          {subiendo !== null ? `Subiendo comprobante ${subiendo}%…`
            : loading ? 'Enviando…' : 'Enviar pedido'}
        </button>
        <button onClick={onCancel} className="btn-ghost w-full">Cancelar</button>
      </div>
    </div>
  )
}

// ─── Order card ───────────────────────────────────────────────────────────────
// Tarjeta para que el cliente (también los antiguos) autorice las promociones.
// Responde una vez: si acepta, queda con la fecha; si no, no se le vuelve a
// preguntar en 90 días (ver utils/promociones.js).
function PromosOptIn({ uid, email, className = '' }) {
  const [guardando, setGuardando] = useState(false)
  const responder = async acepta => {
    setGuardando(true)
    try {
      await setDoc(doc(db, 'customers', uid), {
        promociones: { acepta, fecha: serverTimestamp(), fuente: 'aviso_app', email },
      }, { merge: true })
    } catch { setGuardando(false) }
  }
  return (
    <div className={`card-quiet ${className}`}>
      <p className="font-display text-base tracking-wide text-coal flex items-center gap-2">
        <Mail size={16} className="text-cherry" aria-hidden="true" /> ¿Te avisamos de las promociones?
      </p>
      <p className="font-body text-xs text-coal/70 mt-1 leading-relaxed">
        Te mandamos a <strong>{email}</strong> los descuentos y novedades de DeliStars. Nada de spam, y te
        das de baja con un clic cuando quieras.
      </p>
      <div className="flex gap-2 mt-3">
        <button type="button" disabled={guardando} onClick={() => responder(true)} className="btn-primary btn-sm flex-1">
          Sí, quiero
        </button>
        <button type="button" disabled={guardando} onClick={() => responder(false)} className="btn-secondary btn-sm">
          No, gracias
        </button>
      </div>
    </div>
  )
}

function ClientOrderCard({ order, onClick, unreadCount = 0 }) {
  const stepIdx  = STATUS_STEPS.findIndex(s => s.key === pasoCliente(order.status))
  const step     = STATUS_STEPS[Math.max(0, stepIdx)]
  const progress = getProgress(order.status)
  const hasQuote = order.totalPrice > 0 || !!order.quotedAt || order.payment === 'Saldo a favor'

  return (
    <button onClick={onClick} className="order-card w-full text-left">
      <div className="flex items-start justify-between gap-3 mb-3">
        <div className="min-w-0">
          {order.orderNumber && <p className="font-display text-xl text-cherry tabular">#{order.orderNumber}</p>}
          <p className="font-body text-sm text-coal/65 line-clamp-1">{order.items}</p>
        </div>
        <StepIcon step={step} />
      </div>

      {/* Quote highlight */}
      {hasQuote ? (
        <div className="mb-2 bg-tangelo/10 border border-tangelo/20 rounded-xl px-3 py-2 flex items-center justify-between">
          <span className="font-body text-xs font-semibold text-tangelo inline-flex items-center gap-1.5">
            <Wallet size={13} aria-hidden="true" />
            {order.pagoAdelantado ? `Total · ${order.payment}` : order.payment ? 'Total cotizado' : 'Elige cómo pagar'}
          </span>
          <span className="font-display text-base text-tangelo tabular">{fmt(order.totalPrice)}</span>
        </div>
      ) : !CLOSED_STATUSES.includes(order.status) && (
        <div className="mb-2 bg-tangelo/10 border border-tangelo/20 rounded-xl px-3 py-2 flex items-center gap-1.5">
          <Clock size={13} className="text-tangelo" aria-hidden="true" />
          <span className="font-body text-xs font-semibold text-tangelo">Domicilio por cotizar — aún no pagues</span>
        </div>
      )}

      {/* Unread cashier message badge */}
      {unreadCount > 0 && (
        <div className="mb-2 flex items-center gap-1.5 bg-tangelo/10 border border-tangelo/30 rounded-xl px-3 py-2">
          <MessageSquare size={13} className="text-tangelo flex-shrink-0" />
          <span className="font-body text-xs font-semibold text-tangelo">
            {unreadCount === 1 ? '1 mensaje nuevo del cajero' : `${unreadCount} mensajes nuevos del cajero`}
          </span>
          <span className="ml-auto text-[10px] font-body text-tangelo/70 font-semibold">Toca para ver →</span>
        </div>
      )}

      {/* La etapa ya está escrita arriba de la barra: el distintivo en
          mayúsculas repetía lo mismo dos renglones más abajo. */}
      <div>
        <p className="font-body text-sm font-semibold text-cherry mb-1">{labelPaso(step, order)}</p>
        <div className="w-full bg-smoked rounded-full h-2 overflow-hidden">
          <div className="bg-gradient-to-r from-cherry to-tangelo h-2 rounded-full transition-[width] duration-500"
            style={{ width: `${progress}%`, transitionTimingFunction: 'var(--ease-out)' }} />
        </div>
      </div>
    </button>
  )
}

// Botón opt-in de notificaciones push. Solo aparece si el navegador las soporta
// y el cliente aún no decidió; una vez concedido, desaparece.
function PushOptIn({ uid, className = '' }) {
  const [perm, setPerm] = useState(() => pushPermission())
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [listo, setListo] = useState(false)

  if (listo) {
    return (
      <p className={`font-body text-xs text-mint font-semibold flex items-center gap-1.5 ${className}`}>
        <Check size={14} aria-hidden="true" /> Listo, te avisamos en este celular cada vez que tu pedido cambie.
      </p>
    )
  }
  if (perm === 'granted') return null
  // En iPhone los avisos solo funcionan si la página está instalada en la
  // pantalla de inicio; en el navegador suelto no hay forma de activarlos.
  if (perm === 'unsupported' || (isIOS && !isStandalone)) {
    if (!isIOS) return null
    return (
      <div className={`bg-mustard/10 border border-mustard/30 rounded-xl px-3 py-2.5 ${className}`}>
        <p className="font-body text-xs text-coal/75 leading-relaxed">
          <strong>¿Quieres que te avisemos en el celular</strong> cuando tu pedido cambie?
          En iPhone hay que instalar DeliStars primero: pulsa <strong>Compartir → Agregar a inicio</strong>,
          ábrela desde ahí y actívalos.
        </p>
      </div>
    )
  }
  if (perm === 'denied') {
    return (
      <div className={`bg-coal/5 border border-coal/15 rounded-xl px-3 py-2.5 ${className}`}>
        <p className="font-body text-xs text-coal/70 leading-relaxed flex items-start gap-2">
          <BellOff size={15} className="text-coal/45 flex-shrink-0 mt-0.5" aria-hidden="true" />
          <span>
            Tienes los avisos <strong>bloqueados</strong> para esta página, por eso no te llegan los
            cambios de tu pedido. Actívalos en el candado de la barra de direcciones → Notificaciones.
          </span>
        </p>
      </div>
    )
  }
  const activar = async () => {
    setBusy(true)
    setError('')
    const res = await enablePush(uid)
    setPerm(pushPermission())
    if (res?.ok) setListo(true)
    else if (res?.reason === 'dismissed') setError('No alcanzaste a aceptar el aviso del navegador. Intenta otra vez y pulsa "Permitir".')
    else if (res?.reason !== 'denied') setError('No se pudieron activar los avisos en este dispositivo. Igual te avisamos aquí en la app y por el chat.')
    setBusy(false)
  }
  return (
    <div className={className}>
      <button onClick={activar} disabled={busy || !uid}
        className="btn btn-sm w-full justify-center bg-cherry/10 border border-cherry/30 text-cherry [@media(hover:hover)]:hover:bg-cherry/20">
        {busy ? 'Activando…' : <><Bell size={15} aria-hidden="true" /> Avísame en el celular cuando mi pedido cambie</>}
      </button>
      {error
        ? <p className="font-body text-[11px] text-pepper mt-1 leading-relaxed">{error}</p>
        : <p className="font-body text-[11px] text-coal/45 mt-1 leading-relaxed">
            Te llega la cotización, cuando salga el domiciliario y cuando llegue — sin tener que dejar la app abierta.
          </p>}
    </div>
  )
}

// Aviso para quien pide SIN cuenta. Sus pedidos viven solo en ese navegador:
// si entra desde otro celular, desde WhatsApp en vez de Chrome, o el teléfono
// borra los datos del sitio, deja de ver sus pedidos y cree que se perdieron.
// Entrar con Google ENLAZA la cuenta de invitado (no se pierde nada) y desde
// ahí sus pedidos lo siguen a cualquier dispositivo.
function AvisoInvitado({ className = '', compacto = false, siguiendo = false }) {
  // Entrar o crear cuenta ENLAZA la sesión de invitado (mismo uid): no se
  // pierde el pedido. Se recarga para que toda la página vea la cuenta nueva.
  // Para pedir ya no se puede sin cuenta (Fase 4): en el checkout la ventana
  // de ingreso se abre de una vez.
  const [abierto, setAbierto] = useState(!siguiendo)
  const ventana = abierto && (
    <AccesoCuenta titulo={siguiendo ? 'Guarda tus pedidos' : 'Entra para enviar tu pedido'}
      onCerrar={() => setAbierto(false)} onListo={() => window.location.reload()} />
  )
  if (!siguiendo) {
    return (
      <div className={`bg-mustard/15 border-2 border-mustard rounded-2xl p-4 ${className}`}>
        <p className="font-display text-base tracking-wide text-coal">Entra para enviar tu pedido</p>
        <p className="font-body text-xs text-coal/75 mt-1.5 leading-relaxed">
          Para pedir necesitas tu cuenta. Tu carrito se conserva
          {!compacto && <>, sigues tus pedidos desde cualquier celular y acumulas premios</>}.
        </p>
        <button onClick={() => setAbierto(true)} className="btn-primary w-full mt-3">Entrar o crear cuenta</button>
        {ventana}
      </div>
    )
  }
  return (
    <div className={`bg-mustard/15 border-2 border-mustard rounded-2xl p-4 ${className}`}>
      <p className="font-display text-base tracking-wide text-coal flex items-center gap-2">
        <AlertCircle size={17} className="text-mustard" aria-hidden="true" /> Estás siguiendo tu pedido sin cuenta
      </p>
      {/* Lo más importante va primero y en grande: si se sale, pierde el rastro
          de su pedido y termina pidiendo otra vez creyendo que no entró. */}
      <div className="bg-cream border border-mustard/50 rounded-xl px-3 py-2.5 mt-2">
        <p className="font-body text-sm font-bold text-coal leading-snug">
          No cierres esta página hasta que te entreguen el pedido.
        </p>
        <p className="font-body text-[11px] text-coal/70 mt-1 leading-relaxed">
          Sin cuenta, el pedido se ve <strong>solo en este navegador</strong>. Crea tu cuenta aquí mismo
          y lo sigues desde cualquier celular.
        </p>
      </div>
      <button onClick={() => setAbierto(true)} className="btn-primary w-full mt-3">
        Entrar o crear cuenta y guardar mis pedidos
      </button>
      {ventana}
      <p className="font-body text-[11px] text-coal/55 mt-1.5 text-center">
        No pierdes nada de lo que ya hiciste: tu pedido actual se conserva.
      </p>
    </div>
  )
}

// Pantalla sin pedidos. Con cuenta: ir al menú. Sin cuenta (sesión anónima de
// antes de la Fase 4): entrar o crear la cuenta, que es lo que ahora se pide.
function SinPedidos({ anonimo, onSalir }) {
  const [acceso, setAcceso] = useState(false)
  return (
    <div className="min-h-screen-safe flex flex-col items-center justify-center bg-gradient-soft px-5 py-10">
      <div className="w-full max-w-sm flex flex-col gap-4">
        <div className="text-center">
          <Logo variant="light" size="lg" />
          <p className="font-display text-2xl text-coal tracking-wide mt-4">
            {anonimo ? 'Entra a tu cuenta' : 'Todavía no tienes pedidos'}
          </p>
          <p className="font-body text-sm text-coal/60 mt-1 leading-relaxed">
            {anonimo
              ? 'Para pedir y seguir tus pedidos desde cualquier celular necesitas tu cuenta. Es gratis y acumulas premios.'
              : 'Elige tus productos en el menú y aquí sigues tu pedido.'}
          </p>
        </div>
        {anonimo && (
          <button onClick={() => setAcceso(true)} className="btn-primary w-full">Entrar o crear cuenta</button>
        )}
        <a href="/" className={anonimo ? 'btn-secondary w-full' : 'btn-primary w-full'}>Ver el menú y pedir</a>
        <button onClick={onSalir} className="font-body text-xs text-coal/50 underline underline-offset-2">
          Cerrar sesión
        </button>
      </div>
      {acceso && <AccesoCuenta onCerrar={() => setAcceso(false)} onListo={() => window.location.reload()} />}
    </div>
  )
}

// ─── Cambio propuesto por la sede (Fase 7, §9.2) ─────────────────────────────
// El original no se toca hasta que el cliente acepte. Rechazar lo conserva.
function CambioPropuesto({ order }) {
  const c = order.cambioPropuesto
  const [busy, setBusy] = useState(null)
  const [error, setError] = useState('')
  const responder = async (acepta) => {
    if (!acepta && !window.confirm('¿Rechazar el cambio? Tu pedido queda como lo enviaste y la sede revisa si puede prepararlo así.')) return
    setBusy(acepta ? 'si' : 'no'); setError('')
    try { await llamarPedidos(`${order.id}/cambio/responder`, { acepta }) }
    catch (err) { setError(err instanceof ErrorApi && err.status < 500 ? err.message : 'No se pudo enviar. Revisa tu conexión e intenta de nuevo.') }
    finally { setBusy(null) }
  }
  const totalAntes = c.anterior?.totalPrice ?? ((Number(c.anterior?.quotedPrice) || 0) + (Number(c.anterior?.deliveryPrice) || 0) || null)
  return (
    <div className="bg-tangelo/10 border-2 border-tangelo rounded-2xl p-4 flex flex-col gap-3">
      <div>
        <p className="font-display text-xl tracking-wide text-tangelo flex items-center gap-2">
          <Pencil size={18} aria-hidden="true" /> La sede propone un cambio
        </p>
        {c.motivo && <p className="font-body text-sm text-coal/80 mt-1 leading-relaxed">«{c.motivo}»</p>}
      </div>
      <div className="grid grid-cols-1 gap-2">
        <div className="bg-white/70 rounded-xl p-3">
          <p className="font-body text-[11px] uppercase tracking-wider text-coal/50 mb-1">Tu pedido original</p>
          <p className="font-body text-sm text-coal/70 whitespace-pre-line line-through decoration-coal/30">{c.anterior?.items || order.items}</p>
          {totalAntes != null && <p className="font-body text-xs text-coal/50 mt-1">Total: {fmt(totalAntes)}</p>}
        </div>
        <div className="bg-white rounded-xl p-3 border border-tangelo/40">
          <p className="font-body text-[11px] uppercase tracking-wider text-tangelo mb-1">Como quedaría</p>
          <p className="font-body text-sm text-coal whitespace-pre-line">{c.items}</p>
          <p className="font-body text-sm font-bold text-coal mt-1">
            Total: <span className="text-cherry">{fmt(c.totalPrice)}</span>
            {order.deliveryMode !== 'pickup' && c.deliveryPrice > 0 && <span className="font-normal text-coal/60 text-xs"> (incluye domicilio {fmt(c.deliveryPrice)})</span>}
          </p>
        </div>
      </div>
      <p className="font-body text-xs text-coal/65">Mientras no respondas, la sede no empieza a prepararlo.</p>
      <div className="grid grid-cols-2 gap-2">
        <button onClick={() => responder(true)} disabled={!!busy} className="btn-primary">{busy === 'si' ? 'Enviando…' : 'Aceptar el cambio'}</button>
        <button onClick={() => responder(false)} disabled={!!busy}
          className="py-2.5 rounded-xl border-2 border-coal/20 bg-white text-coal font-body text-sm font-bold disabled:opacity-50">
          {busy === 'no' ? 'Enviando…' : 'Rechazar'}
        </button>
      </div>
      {error && <p className="font-body text-xs text-pepper">{error}</p>}
    </div>
  )
}

// ─── Devolución (lado cliente) ────────────────────────────────────────────────
// El pedido no siguió y ya lo había pagado por transferencia: elige si quiere
// la plata de vuelta por transferencia o como saldo a favor (solo con cuenta
// de Google, vale en la sede del pedido y no vence).
function DevolucionCliente({ order }) {
  const dev = order.devolucion
  const [opcion,  setOpcion]  = useState('')
  const [datos,   setDatos]   = useState({ medio: '', numero: '', titular: '', documento: '' })
  const [errores, setErrores] = useState([])
  const [busy,    setBusy]    = useState(false)
  const monto = fmt(dev.monto)
  const saldoPermitido = puedeElegirSaldo(order)

  const enviar = async () => {
    if (!opcion) { setErrores(['Elige cómo quieres la devolución']); return }
    if (opcion === 'transferencia') {
      const e = erroresDatosDevolucion(datos)
      if (e.length) { setErrores(e); return }
    }
    setErrores([]); setBusy(true)
    try {
      await updateDoc(doc(db, 'orders', order.id), opcion === 'transferencia'
        ? {
            'devolucion.estado': 'transferencia_solicitada',
            'devolucion.datos': {
              medio: datos.medio, numero: datos.numero.trim(), titular: datos.titular.trim(),
              documento: datos.documento.trim() || null,
            },
            'devolucion.elegidaAt': serverTimestamp(),
            updatedAt: serverTimestamp(),
          }
        : {
            'devolucion.estado': 'saldo_solicitado',
            'devolucion.elegidaAt': serverTimestamp(),
            updatedAt: serverTimestamp(),
          })
    } catch (_) {
      setErrores(['No se pudo guardar. Revisa tu conexión e intenta de nuevo.'])
    } finally { setBusy(false) }
  }

  if (dev.estado !== 'por_elegir') {
    const textos = {
      transferencia_solicitada: `Te vamos a transferir ${monto} a ${dev.datos?.medio || 'tu cuenta'} (${dev.datos?.numero || ''}). Te avisamos por el chat cuando esté hecho.`,
      saldo_solicitado:         `Pediste ${monto} como saldo a favor. La caja lo acredita en tu cuenta en breve.`,
      transferida:              `Ya te transferimos ${monto}.`,
      acreditada:               `Tienes ${monto} a favor para tu próximo pedido en ${order.sedeName || 'esta sede'}. No vence.`,
    }
    return (
      <div className="bg-mint/10 border-2 border-mint/40 rounded-2xl p-4">
        <p className="font-display text-base tracking-wide text-coal flex items-center gap-2">
          <Banknote size={17} className="text-coal/50" aria-hidden="true" /> Devolución de {monto}
        </p>
        <p className="font-body text-sm text-coal/80 mt-1 leading-relaxed">{textos[dev.estado] || ''}</p>
      </div>
    )
  }

  return (
    <div className="bg-cherry/5 border-2 border-cherry rounded-2xl p-4 flex flex-col gap-3">
      <p className="font-display text-xl tracking-wide text-cherry flex items-center gap-2">
        <Banknote size={19} aria-hidden="true" /> Te devolvemos {monto}
      </p>
      <p className="font-body text-sm text-coal/80 leading-relaxed">
        Tu pedido no siguió y ya lo habías pagado por transferencia. ¿Cómo quieres tu plata?
      </p>
      <div className="flex flex-col gap-2">
        <button type="button" onClick={() => setOpcion('transferencia')}
          className={`w-full text-left rounded-xl border-2 px-4 py-3 font-body ${opcion === 'transferencia' ? 'border-cherry bg-cherry/10' : 'border-coal/15 bg-cream'}`}>
          <p className="text-sm font-bold text-coal flex items-center gap-2">
            <Building2 size={16} className="text-coal/50" aria-hidden="true" /> Transferencia de vuelta
          </p>
          <p className="text-xs text-coal/60">Te la enviamos a tu cuenta o Nequi.</p>
        </button>
        {saldoPermitido && (
          <button type="button" onClick={() => setOpcion('saldo')}
            className={`w-full text-left rounded-xl border-2 px-4 py-3 font-body ${opcion === 'saldo' ? 'border-mint bg-mint/10' : 'border-coal/15 bg-cream'}`}>
            <p className="text-sm font-bold text-coal flex items-center gap-2">
              <Wallet size={16} className="text-mint" aria-hidden="true" /> Saldo a favor para mi próximo pedido
            </p>
            <p className="text-xs text-coal/60">Queda en tu cuenta para pedir en {order.sedeName || 'esta sede'}. No vence.</p>
          </button>
        )}
      </div>

      {opcion === 'transferencia' && (
        <div className="flex flex-col gap-2">
          <div>
            <label className="label-field">¿A dónde te transferimos? *</label>
            <select className="input-field" value={datos.medio} onChange={e => setDatos(d => ({ ...d, medio: e.target.value }))}>
              <option value="">— Elige —</option>
              {MEDIOS_DEVOLUCION.map(m => <option key={m}>{m}</option>)}
            </select>
          </div>
          <div>
            <label className="label-field">Número de cuenta o celular *</label>
            <input className="input-field" inputMode="numeric" value={datos.numero}
              onChange={e => setDatos(d => ({ ...d, numero: e.target.value }))} placeholder="Ej: 3001234567" />
          </div>
          <div>
            <label className="label-field">Nombre del titular *</label>
            <input className="input-field" value={datos.titular}
              onChange={e => setDatos(d => ({ ...d, titular: e.target.value }))} placeholder="Como aparece en la cuenta" />
          </div>
          {['Bancolombia', 'Otro banco'].includes(datos.medio) && (
            <div>
              <label className="label-field">Cédula del titular (opcional)</label>
              <input className="input-field" inputMode="numeric" value={datos.documento}
                onChange={e => setDatos(d => ({ ...d, documento: e.target.value }))} />
            </div>
          )}
        </div>
      )}

      {errores.map(e => <p key={e} className="font-body text-xs text-pepper">{e}</p>)}
      <button onClick={enviar} disabled={busy} className="btn-primary w-full">
        {busy ? 'Guardando…' : 'Confirmar'}
      </button>
    </div>
  )
}

// ─── Order detail ─────────────────────────────────────────────────────────────
function ClientOrderDetail({ order, onClose }) {
  const { user } = useAuth()
  useBackClose(true, onClose) // "atrás" cierra el detalle, no saca de la app
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
  const [cancelling,   setCancelling]   = useState(false)
  // Agregar otro producto después de haber mandado el pedido a la caja
  const [addingItem,  setAddingItem]  = useState(false)
  const [extraItem,   setExtraItem]   = useState('')
  const [extraError,  setExtraError]  = useState('')
  const [savingExtra, setSavingExtra] = useState(false)

  // Mientras la sede no haya confirmado (Enviado), el cliente puede sumar algo
  // —pasa seguido: se antojan de una bebida o un adicional— y la caja lo cotiza
  // con eso (por la API, Fase 7). Después de confirmado, le escribe a la sede y
  // ella le propone el cambio (§9.2). Con pago adelantado no: ya está pagado.
  const canAddItems = etapaDe(order).etapa === 'enviado' && !order.pagoAdelantado && !etapaDe(order).excepcion
  const addExtraItem = async () => {
    const txt = extraItem.trim()
    if (!txt) { setExtraError('Escribe qué quieres agregar'); return }
    setExtraError('')
    setSavingExtra(true)
    try {
      await llamarPedidos(`${order.id}/agregar`, { texto: txt })
      setExtraItem('')
      setAddingItem(false)
    } catch (err) {
      setExtraError(err instanceof ErrorApi && err.status < 500 ? err.message : 'No se pudo agregar. Revisa tu conexión e intenta de nuevo.')
    } finally { setSavingExtra(false) }
  }

  // Cancelar (Fase 4, por la API): en Enviado el cliente cancela solo y el
  // servidor le devuelve premios y saldo. Ya confirmado, solo PIDE la
  // cancelación con un motivo y la caja la aprueba o sigue con el pedido.
  const { etapa: etapaActual, excepcion: excepcionActual } = etapaDe(order)
  const solicitudCancelacion = excepcionActual === 'cancelacion_solicitada'
  const canClientCancel = !excepcionActual &&
    ['enviado', 'confirmado', 'en_preparacion', 'listo', 'en_camino', 'llego'].includes(etapaActual)
  const cancelaDirecto = etapaActual === 'enviado'
  const cancelOrder = async () => {
    if (!canClientCancel) return
    let cuerpo
    if (cancelaDirecto) {
      const devolucion = devolucionInicial(order)
      if (!window.confirm(
        '¿Seguro que quieres cancelar este pedido? Esta acción no se puede deshacer.' +
        (devolucion ? `\n\nYa pagaste $${devolucion.monto.toLocaleString('es-CO')} por transferencia: después de cancelar eliges cómo quieres la devolución.` : '')
      )) return
      cuerpo = { a: 'excepcion:cancelado', version: order.version ?? 0 }
    } else {
      const motivo = window.prompt('La sede ya está trabajando en tu pedido. Cuéntanos por qué quieres cancelarlo y la caja te confirma:')
      if (!motivo?.trim()) return
      cuerpo = { a: 'excepcion:cancelacion_solicitada', motivo: motivo.trim(), version: order.version ?? 0 }
    }
    setCancelling(true)
    try {
      await llamarPedidos(`${order.id}/transiciones`, cuerpo)
    } catch (err) {
      window.alert(err instanceof ErrorApi ? err.message : 'No se pudo enviar. Revisa tu conexión e intenta de nuevo.')
    } finally { setCancelling(false) }
  }

  // Pago tras la cotización, billete y comprobante: todo por /pago. El servidor
  // valida el total y escribe los mismos campos que antes.
  const pagar = (extra) => llamarPedidos(`${order.id}/pago`, {
    metodo: order.payment,
    ...(order.payment === 'Mixto'
      ? { mixtoEfectivo: Number(order.mixtoEfectivo), mixtoTransferencia: Number(order.mixtoTransferencia) }
      : {}),
    ...(order.cashBillAmount != null ? { billete: Number(order.cashBillAmount) } : {}),
    ...extra,
  })
  const textoError = (err, porDefecto) => err instanceof ErrorApi && err.status < 500 ? err.message : porDefecto

  const confirmPaymentMethod = async () => {
    if (!payMethod) { setPayError('Selecciona cómo vas a pagar'); return }
    if (payMethod === 'Mixto' && (!payMixtoEf || !payMixtoTr)) {
      setPayError('Indica cuánto pagarás en efectivo y cuánto en transferencia'); return
    }
    setPayError('')
    setSavingPay(true)
    try {
      await llamarPedidos(`${order.id}/pago`, {
        metodo: payMethod,
        ...(payMethod === 'Mixto'
          ? { mixtoEfectivo: Number(payMixtoEf), mixtoTransferencia: Number(payMixtoTr) }
          : {}),
      })
    } catch (err) {
      setPayError(textoError(err, 'No se pudo guardar el método de pago. Intenta de nuevo.'))
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
      await pagar({ billete: billAmount })
    } catch (err) {
      setBillError(textoError(err, 'No se pudo enviar. Revisa tu conexión e intenta de nuevo.'))
    } finally { setSendingBill(false) }
  }

  // Por la API (§8.3): el servidor revisa que el chat siga abierto (hasta 3 h
  // después de la entrega) y guarda el mensaje en clientMessages, como siempre.
  const sendClientMessage = async () => {
    if (!clientMsgText.trim()) return
    setChatError('')
    setSendingClientMsg(true)
    try {
      await llamarPedidos(`${order.id}/mensajes`, { canal: 'caja', texto: clientMsgText.trim() })
      setClientMsgText('')
    } catch (err) {
      console.error('Error al enviar mensaje:', err)
      setChatError(err instanceof ErrorApi ? err.message : 'No se pudo enviar el mensaje. Revisa tu conexión e intenta de nuevo.')
    } finally { setSendingClientMsg(false) }
  }
  const chatCajaCerrado = motivoCerrado(order, 'caja')

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
          await pagar({ comprobante: { url, nombre: file.name } })
          setUploadProgress(null)
        } catch (err) {
          setUploadError(textoError(err, 'No se pudo guardar el comprobante. Intenta de nuevo.'))
          setUploadProgress(null)
        }
      }
    )
  }

  useEffect(() => {
    // 'preparing' cuenta igual que 'accepted': para el cliente son el mismo
    // paso, así que el contador no debe apagarse al pasar de uno al otro.
    if (!['accepted', 'preparing', 'in_transit'].includes(order.status)) { setElapsed(null); return }
    const ts = order.inTransitAt || order.acceptedAt
    if (!ts?.toDate) return
    const calc = () => setElapsed(Math.floor((Date.now() - ts.toDate().getTime()) / 60000))
    calc()
    const id = setInterval(calc, 30000)
    return () => clearInterval(id)
  }, [order.status, order.inTransitAt, order.acceptedAt])

  // Tiempo real de llegada: con el pedido en camino, cada 2 min se pide la
  // ruta desde donde va el domiciliario hasta el pin del cliente.
  // Solo con ubicación reciente (≤ 3 min): si el domiciliario va navegando
  // con Google Maps su página está en pausa y la última ubicación es vieja;
  // medir desde ahí correría la hora de llegada sin fin.
  const [vivo, setVivo] = useState(null)
  const posDomiRef = useRef(null)
  useEffect(() => {
    posDomiRef.current = order.driverLat != null
      ? { lat: order.driverLat, lng: order.driverLng, ts: order.driverUpdatedAt } : null
  }, [order.driverLat, order.driverLng, order.driverUpdatedAt])
  const conRutaVivo = order.status === 'in_transit' && order.driverLat != null &&
    ubicFresca(order.driverUpdatedAt) && order.addrLat != null && order.addrLng != null
  useEffect(() => {
    if (!conRutaVivo) return
    let vigente = true
    const medir = () => {
      if (!posDomiRef.current || !ubicFresca(posDomiRef.current.ts)) { setVivo(null); return }
      medirRuta(posDomiRef.current, { lat: order.addrLat, lng: order.addrLng }).then(r => {
        if (vigente && r?.min) setVivo({ min: r.min, en: Date.now() })
      })
    }
    medir()
    const id = setInterval(medir, 120000)
    return () => { vigente = false; clearInterval(id) }
  }, [conRutaVivo, order.addrLat, order.addrLng])

  // Se recalcula en cada render; el intervalo de `elapsed` (30 s) mantiene
  // fresca la cuenta regresiva mientras el pedido está en curso.
  const eta = calcularEta(order, conRutaVivo ? vivo : null)

  const stepIdx  = STATUS_STEPS.findIndex(s => s.key === pasoCliente(order.status))
  const step     = stepIdx >= 0 ? STATUS_STEPS[stepIdx] : STATUS_STEPS[0]
  const progress = getProgress(order.status)
  const isDelivered = DELIVERED_STATUSES.includes(order.status)
  const hasQuote = order.totalPrice > 0 || !!order.quotedAt || order.payment === 'Saldo a favor'

  const openDriverMap = () => {
    if (order.driverLat && order.driverLng) {
      window.open(`https://www.google.com/maps/search/?api=1&query=${order.driverLat},${order.driverLng}`, '_blank')
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-coal/50 backdrop-blur-sm animate-fade-in"
      onClick={e => { if (e.target === e.currentTarget) onClose() }}>
      <div className="bg-cream w-full max-w-lg rounded-t-3xl sm:rounded-3xl max-h-[90dvh] overflow-y-auto scroll-custom animate-sheet-up sm:animate-scale-in">
        {/* Header */}
        <div className="sticky top-0 bg-gradient-to-r from-cherry to-tangelo px-5 py-5 rounded-t-3xl">
          <div className="flex items-center justify-between mb-3">
            <p className="font-display text-2xl text-cream tracking-wide">
              {order.orderNumber ? `Pedido #${order.orderNumber}` : 'Mi pedido'}
            </p>
            <button onClick={onClose} className="btn-icon text-cream/80 [@media(hover:hover)]:hover:bg-cream/10 [@media(hover:hover)]:hover:text-cream -mr-2" aria-label="Cerrar"><X size={20} /></button>
          </div>
          <p className="font-body text-sm font-semibold text-cream mb-2 flex items-center gap-2"><StepIcon step={step} size={16} disco={false} /> {labelPaso(step, order)}</p>
          <div className="w-full bg-cream/20 rounded-full h-2">
            <div className="bg-cream h-2 rounded-full transition-[width] duration-500"
              style={{ width: `${progress}%`, transitionTimingFunction: 'var(--ease-out)' }} />
          </div>
          {/* Hora estimada de llegada, no un promedio abstracto: el cliente
              quiere saber a qué hora come, no cuánto dura la mediana. */}
          {eta && !isDelivered && !CLOSED_STATUSES.includes(order.status) && (
            <p className="font-body text-xs text-cream/80 mt-2">
              {eta.tarde
                ? <>Se está demorando un poco más de lo normal — escríbenos por el chat si necesitas algo</>
                : eta.enVivo
                  ? (eta.faltan > 1
                      ? <>Tu domiciliario llega en ~<strong>{eta.faltan} min</strong> · {horaCorta(eta.llegada)}</>
                      : <>Tu domiciliario está por llegar</>)
                : eta.faltan > 0
                  ? <>Te llega alrededor de las <strong>{horaCorta(eta.llegada)}</strong> · faltan ~{eta.faltan} min</>
                  : <>Debe estar llegando en cualquier momento</>}
            </p>
          )}
        </div>

        <div className="p-5 flex flex-col gap-4">
          {/* Aviso grande: falta cotizar el domicilio (antes de la cotización) */}
          {!hasQuote && !CLOSED_STATUSES.includes(order.status) && (
            <div className="bg-tangelo/10 border-2 border-tangelo/40 rounded-2xl p-5 flex flex-col gap-3">
              <div className="flex items-center gap-2">
                <Clock size={24} className="text-tangelo flex-shrink-0" aria-hidden="true" />
                <p className="font-display text-xl tracking-wide text-tangelo">
                  {order.deliveryMode === 'pickup' ? 'Esperando confirmación de la caja' : 'Falta cotizar tu domicilio'}
                </p>
              </div>
              {/* Confirmación de que el pedido SÍ llegó — tranquiliza al cliente */}
              <div className="bg-mint/15 border border-mint/40 rounded-xl px-3 py-2 flex items-center gap-2">
                <CircleCheck size={17} className="text-mint flex-shrink-0" aria-hidden="true" />
                <p className="font-body text-xs text-coal/75 leading-relaxed">
                  <strong>¡Pedido recibido!</strong>{order.createdAt?.toDate ? ` Enviado a las ${format(order.createdAt.toDate(), 'h:mm a')}.` : ''} Ya está en la caja.
                </p>
              </div>
              <p className="font-body text-sm text-coal/80 leading-relaxed">
                {order.deliveryMode === 'pickup'
                  ? <>Como vas a <strong>recoger en sede</strong>, no hay domicilio que cotizar. La caja confirma tu pedido y lo pasa a preparación. Normalmente responde en pocos minutos.</>
                  : <>La caja está revisando tu pedido. Cuando confirme que puede entregarlo, te enviará el <strong>valor del domicilio</strong>. Normalmente responde en pocos minutos.</>}
              </p>
              <p className="font-body text-xs text-tangelo flex items-start gap-1.5">
                <Bell size={13} className="flex-shrink-0 mt-0.5" aria-hidden="true" />
                <span>Te avisaremos <strong>aquí mismo</strong> y en el chat apenas cotice — puedes dejar esta pantalla abierta.</span>
              </p>
              <PushOptIn uid={user?.uid} />
              <div className="bg-cream/60 rounded-xl px-4 py-3 flex items-center gap-2">
                <Lock size={16} className="text-coal/40 flex-shrink-0" aria-hidden="true" />
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

          {user?.isAnonymous && !isDelivered && !CLOSED_STATUSES.includes(order.status) && (
            <AvisoInvitado siguiendo compacto />
          )}

          {order.devolucion && <DevolucionCliente order={order} />}

          {/* El pedido lleva premio de fidelización: se lo confirmamos en grande */}
          {order.loyaltyRedemption?.count > 0 && (
            <div className="bg-mint rounded-2xl p-4">
              <p className="font-display text-lg tracking-wide text-cream flex items-center gap-2">
                <Gift size={18} aria-hidden="true" /> Este pedido incluye tu premio
              </p>
              <p className="font-body text-sm text-cream/90 mt-1 leading-relaxed">
                {order.loyaltyRedemption.count > 1 ? `${order.loyaltyRedemption.count}x ` : ''}Hamburguesa Especial + Perro Grande con tocineta, <strong>GRATIS</strong>.
                {CLOSED_STATUSES.includes(order.status) && ' Como el pedido no siguió, el premio volvió a tu cuenta.'}
              </p>
            </div>
          )}

          {/* Pagó al enviar: solo falta que la caja lo acepte */}
          {order.pagoAdelantado && order.status === 'pending' && (
            <div className="bg-mint/10 border-2 border-mint/40 rounded-2xl p-5 flex flex-col gap-3">
              <div className="flex items-center gap-2">
                <span className="text-3xl leading-none">⏳</span>
                <p className="font-display text-xl tracking-wide text-mint">Esperando que la caja acepte</p>
              </div>
              <p className="font-body text-sm text-coal/80 leading-relaxed">
                <strong>¡Pedido recibido!</strong>{order.createdAt?.toDate ? ` Enviado a las ${format(order.createdAt.toDate(), 'h:mm a')}.` : ''} Ya
                llegó a la caja con tu pago. Apenas lo acepten empieza la preparación.
                Normalmente toma pocos minutos.
              </p>
              <PushOptIn uid={user?.uid} />
            </div>
          )}

          {/* Quote section */}
          {hasQuote && (
            <div className="bg-tangelo/10 border border-tangelo/30 rounded-2xl p-4 flex flex-col gap-2">
              <p className="font-display text-base tracking-wide text-tangelo">
                {order.pagoAdelantado ? 'Valor de tu pedido' : 'Cotización del cajero'}
              </p>
              <div className="flex justify-between font-body text-sm">
                <span className="text-coal/60">Valor pedido:</span>
                <span className="font-semibold">{fmt(order.quotedPrice)}</span>
              </div>
              <div className="flex justify-between font-body text-sm">
                <span className="text-coal/60">Domicilio:</span>
                <span className="font-semibold">{fmt(order.deliveryPrice)}</span>
              </div>
              {Number(order.saldoAplicado?.usado) > 0 && (
                <div className="flex justify-between font-body text-sm text-mint font-semibold">
                  <span>Saldo a favor:</span>
                  <span>−{fmt(order.saldoAplicado.usado)}</span>
                </div>
              )}
              <div className="border-t border-tangelo/20 pt-2 flex justify-between">
                <span className="font-body font-bold text-coal">TOTAL:</span>
                <span className="font-display text-xl text-tangelo">{fmt(order.totalPrice)}</span>
              </div>
              <div className="flex justify-between font-body text-sm">
                <span className="text-coal/60">Forma de pago:</span>
                <span className="font-semibold">{order.payment || 'Por elegir'}</span>
              </div>
            </div>
          )}

          {/* Selector de método de pago — aparece tras la cotización de la caja */}
          {hasQuote && !order.payment && !isDelivered && !CLOSED_STATUSES.includes(order.status) && (
            <div className="bg-cherry/5 border-2 border-cherry/30 rounded-2xl p-4 flex flex-col gap-3">
              <p className="font-display text-base tracking-wide text-cherry flex items-center gap-2">
                <CircleCheck size={17} aria-hidden="true" /> ¡Domicilio cotizado! Elige cómo pagar
              </p>
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
                      <label className="label-field">En efectivo</label>
                      <input className="input-field" type="number" min="0"
                        value={payMixtoEf} onChange={e => setPayMixtoEf(e.target.value)} placeholder="$0" />
                    </div>
                    <div>
                      <label className="label-field">En transferencia</label>
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
              <p className="font-display text-base tracking-wide text-coal flex items-center gap-2">
                <Banknote size={17} className="text-coal/50" aria-hidden="true" /> ¿Con qué billete vas a pagar?
              </p>
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
                    <AlertCircle size={17} className="text-pepper flex-shrink-0" aria-hidden="true" />
                    <p className="font-body text-sm text-pepper font-semibold">
                      Ese valor no cubre el total ({fmt(order.totalPrice - billAmount)} de diferencia)
                    </p>
                  </div>
                ) : billAmount === order.totalPrice ? (
                  <div className="bg-mint/10 border border-mint/30 rounded-xl px-4 py-3 flex items-center gap-2">
                    <CircleCheck size={17} className="text-mint flex-shrink-0" aria-hidden="true" />
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
                    <CircleCheck size={17} className="text-mint flex-shrink-0" aria-hidden="true" />
                    <p className="font-body text-sm text-mint font-semibold">
                      Enviado al cajero — tu pedido está en gestión. Sigue su avance aquí abajo.
                    </p>
                  </div>
                ) : (
                  <div className="flex flex-col gap-1.5">
                    <button onClick={sendBill} disabled={sendingBill} className="btn-primary w-full">
                      {sendingBill ? 'Enviando…' :
                        (order.cashBillAmount != null ? 'Actualizar billete y reenviar' : 'Enviar al cajero')}
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
                {order.payment === 'Mixto' ? 'Comprobante de tu parte por transferencia' : `Comprobante de ${order.payment}`}
              </p>

              {/* Desglose del pago mixto: efectivo + transferencia */}
              {order.payment === 'Mixto' && (
                <div className="bg-mustard/10 border border-mustard/30 rounded-xl p-3 flex flex-col gap-1.5">
                  <p className="font-body text-xs text-coal/70 font-semibold">Tu pago se divide así:</p>
                  <div className="flex justify-between font-body text-sm">
                    <span className="text-coal/60">En efectivo (al recibir):</span>
                    <span className="font-semibold">{fmt(Number(order.mixtoEfectivo) || 0)}</span>
                  </div>
                  <div className="flex justify-between font-body text-sm">
                    <span className="text-coal/60">Por transferencia / QR:</span>
                    <span className="font-semibold text-tangelo">{fmt(Number(order.mixtoTransferencia) || 0)}</span>
                  </div>
                  <p className="font-body text-[11px] text-coal/50">
                    Transfiere la parte digital con el QR de abajo y sube el comprobante. El resto lo pagas en efectivo al domiciliario.
                  </p>
                </div>
              )}

              {/* QR + cuenta/llave para transferir */}
              {/* Si ya mandó el comprobante no hace falta volver a mostrar el QR */}
              {!order.transferValidated && !order.transferReceiptUrl && <DatosTransferencia sedeId={order.sedeId} />}

              {order.transferValidated ? (
                <div className="flex items-center gap-2 text-mint">
                  <CircleCheck size={17} className="flex-shrink-0" aria-hidden="true" />
                  <p className="font-body text-sm font-semibold">Pago validado por el cajero</p>
                </div>
              ) : order.transferReceiptUrl ? (
                <div className="flex flex-col gap-2">
                  <div className="flex items-center gap-2 text-tangelo">
                    <Paperclip size={14} className="text-coal/50 flex-shrink-0" aria-hidden="true" />
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
                      <span className="font-body text-sm text-coal/60 flex items-center gap-2">
                        <Upload size={16} aria-hidden="true" /> Subir comprobante (imagen o PDF)
                      </span>
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
              if (order.deliveryMode === 'pickup' && ['assigned','in_transit','arrived'].includes(s.key)) return false
              const deliveredKeys = ['delivered_paid','pending_cuadre','completed']
              if (deliveredKeys.includes(s.key)) return i === arr.findIndex(x => deliveredKeys.includes(x.key))
              // Rechazado y cancelado no son pasos que faltan: solo se ven si
              // el pedido terminó así. Listarlos siempre asustaba de gratis.
              if (['rejected','cancelled'].includes(s.key)) return s.key === pasoCliente(order.status)
              return true
            }).map((s, i) => {
              const currentIdx = STATUS_STEPS.findIndex(x => x.key === pasoCliente(order.status))
              const done = CLOSED_STATUSES.includes(order.status)
                ? s.key === pasoCliente(order.status)
                : currentIdx >= 0 && currentIdx >= STATUS_STEPS.findIndex(x => x.key === s.key)
              const actual = s.key === pasoCliente(order.status)
              return (
                <div key={s.key} className="flex items-center gap-3">
                  <div className={`w-6 h-6 rounded-full flex items-center justify-center flex-shrink-0 font-body text-xs ${
                    done ? 'bg-cherry text-cream' : 'bg-smoked text-coal/30'
                  }`}>{done ? <Check size={13} aria-hidden="true" /> : (i+1)}</div>
                  <span className={`font-body text-sm ${
                    actual ? 'text-cherry font-bold' : done ? 'text-coal font-semibold' : 'text-coal/40'
                  }`}>{labelPaso(s, order)}</span>
                </div>
              )
            })}
          </div>

          {/* ETA / driver status */}
          {['accepted', 'preparing', 'in_transit', 'arrived'].includes(order.status) && (
            <div className="bg-cherry/5 border border-cherry/20 rounded-2xl p-4 flex flex-col gap-2">
              <p className="font-display text-base tracking-wide">
                {order.status === 'in_transit' ? 'Tu pedido está en camino' :
                 order.status === 'arrived'    ? 'El domiciliario llegó' :
                 order.deliveryMode === 'pickup' ? 'Tu pedido está en preparación' :
                                                 'Aceptado por el domiciliario y en preparación'}
              </p>
              {/* La espera larga vive aquí (mediana de 31 min entre asignado y
                  en camino), así que es donde más falta hace la hora concreta. */}
              {eta && !eta.tarde && eta.faltan > 0 && (
                <div className="bg-white/70 rounded-xl px-3 py-2.5">
                  <p className="font-body text-xs text-coal/60">
                    {eta.enVivo ? 'Llegada según dónde va el domiciliario'
                      : eta.porRuta ? 'Llegada según la ruta hasta tu casa' : 'Llegada estimada'}
                  </p>
                  <p className="font-display text-2xl text-cherry leading-tight">{horaCorta(eta.llegada)}</p>
                  <p className="font-body text-xs text-coal/55">faltan ~{eta.faltan} min</p>
                </div>
              )}
              {eta?.tarde && (
                <p className="font-body text-xs text-mustard leading-relaxed">
                  Se está demorando más de lo normal. Si necesitas algo, escríbenos aquí por el chat.
                </p>
              )}
              {['accepted', 'preparing'].includes(order.status) && (
                <p className="font-body text-xs text-coal/55 leading-relaxed">
                  Te avisamos apenas salga hacia tu dirección.
                </p>
              )}
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
                      <Phone size={15} aria-hidden="true" /> Llamar
                    </a>
                    <a href={`https://wa.me/${waPhone}`} target="_blank" rel="noreferrer"
                      className="flex-1 flex items-center justify-center gap-1.5 py-2 rounded-xl bg-[#25D366]/10 border border-[#25D366]/30 text-[#25D366] font-body text-sm font-semibold hover:bg-[#25D366]/20 transition-colors">
                      <MessageCircle size={15} aria-hidden="true" /> WhatsApp
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
                  <div className="flex flex-col gap-2">
                    <Suspense fallback={<div className="h-[240px] rounded-xl bg-coal/5 flex items-center justify-center font-body text-xs text-coal/40">Cargando mapa…</div>}>
                      <LiveDriverMap
                        driverLat={order.driverLat} driverLng={order.driverLng}
                        destLat={order.addrLat} destLng={order.addrLng}
                      />
                    </Suspense>
                    <p className="font-body text-[11px] text-coal/50 text-center">El mapa se actualiza solo: la moto es tu domiciliario y la casa, tu dirección.</p>
                    <button onClick={openDriverMap} className="btn-secondary btn-sm w-full">
                      <Navigation size={14} /> Abrir en Google Maps
                    </button>
                  </div>
                ) : (
                  <p className="font-body text-xs text-coal/50">Obteniendo ubicación del domiciliario…</p>
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
            <ListaItems texto={order.items} />
            {order.notes && (
              <div className="mt-2 bg-mustard/10 rounded-lg p-2">
                <p className="font-body text-xs text-coal/70">{order.notes}</p>
              </div>
            )}
          </div>

          <div className="card">
            <div className="flex items-center gap-2 mb-1">
              <MapPin size={16} className="text-cherry" />
              <p className="font-display text-base tracking-wide">{order.deliveryMode === 'pickup' ? 'Recoges en' : 'Entrega en'}</p>
            </div>
            <p className="font-body text-sm text-coal">
              {order.deliveryMode === 'pickup'
                ? `${order.sedeName || SEDES[order.sedeId]?.name || 'la sede'}${SEDES[order.sedeId]?.address ? ` — ${SEDES[order.sedeId].address}` : ''}`
                : order.fullAddress}
            </p>
            {order.barrio && <p className="font-body text-xs text-coal/50 mt-0.5">Barrio: {order.barrio}</p>}
          </div>

          {isDelivered && (
            <div className="bg-mint/10 border border-mint/30 rounded-2xl p-4 text-center">
              <CircleCheck size={32} className="text-mint mx-auto mb-2" aria-hidden="true" />
              <p className="font-display text-lg tracking-wide text-mint">¡Pedido entregado!</p>
              <p className="font-body text-xs text-coal/50 mt-1">Gracias por tu pedido en DeliStars</p>
            </div>
          )}
          {/* Reportar un problema y seguir el caso (§14): hasta 24 h después de la entrega */}
          {isDelivered && <ReclamoPedido order={order} user={user} />}

          {order.status === 'rejected' && (
            <div className="bg-pepper/10 border border-pepper/30 rounded-2xl p-4 text-center">
              <CircleX size={32} className="text-pepper mx-auto mb-2" aria-hidden="true" />
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
              <Ban size={32} className="text-coal/50 mx-auto mb-2" aria-hidden="true" />
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
                        {m.role === 'cashier' ? 'Cajero' : 'Tú'}
                      </p>
                      <p className="font-body text-sm text-coal">{m.text}</p>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="font-body text-xs text-coal/40">Puedes escribirle al cajero aquí si tienes alguna duda</p>
              )}

              {chatCajaCerrado ? (
                <p className="font-body text-xs text-coal/50 flex items-center gap-1.5">
                  <Lock size={13} aria-hidden="true" /> {textoCerrado(chatCajaCerrado, 'caja')}
                </p>
              ) : (
                <div className="flex flex-col gap-1">
                  <div className="flex gap-2">
                    <textarea
                      className="textarea-field flex-1 h-14 scroll-custom text-sm"
                      placeholder="Escríbele al cajero…"
                      value={clientMsgText}
                      maxLength={MAX_TEXTO}
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

          {/* Chat con el domiciliario (§8.3): aparte del de la caja, y la caja no lo ve */}
          {!['rejected','cancelled'].includes(order.status) && order.deliveryMode !== 'pickup' && (
            <ChatDomiciliario order={order} rol="client" />
          )}

          {/* Agregar otro producto — mientras la caja no lo haya despachado */}
          {canAddItems && (
            <div className="pt-1">
              {!addingItem ? (
                <button
                  onClick={() => setAddingItem(true)}
                  className="w-full py-2.5 rounded-xl border border-cherry/40 text-cherry font-body text-sm font-semibold hover:bg-cherry/5 transition-colors flex items-center justify-center gap-1.5"
                >
                  <Plus size={16} /> Agregar otro producto
                </button>
              ) : (
                <div className="bg-white rounded-2xl border border-cherry/25 p-3 flex flex-col gap-2">
                  <p className="font-display text-sm text-coal tracking-wide">¿Qué le agregamos?</p>
                  <textarea
                    className="textarea-field h-16 scroll-custom text-sm"
                    placeholder="Ej: 1 Perro DeliStar con tocineta y una Coca-Cola personal"
                    value={extraItem}
                    onChange={e => setExtraItem(e.target.value)}
                    autoFocus
                  />
                  <p className="font-body text-[11px] text-coal/50">
                    Se suma a tu pedido antes de que la sede te cotice.
                  </p>
                  {extraError && <p className="font-body text-xs text-pepper">{extraError}</p>}
                  <div className="flex gap-2">
                    <button
                      onClick={() => { setAddingItem(false); setExtraItem(''); setExtraError('') }}
                      className="flex-1 py-2 rounded-xl border border-coal/15 text-coal/60 font-body text-sm hover:bg-coal/5 transition-colors"
                    >
                      Cancelar
                    </button>
                    <button
                      onClick={addExtraItem}
                      disabled={savingExtra || !extraItem.trim()}
                      className="btn-primary flex-1 py-2 text-sm disabled:opacity-50"
                    >
                      {savingExtra ? 'Enviando…' : 'Agregar al pedido'}
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* La sede propone un cambio (Fase 7, §9.2): aceptar o rechazar */}
          {excepcionActual === 'cambio_pendiente' && order.cambioPropuesto?.estado === 'pendiente' && (
            <CambioPropuesto order={order} />
          )}

          {/* Pidió cancelar: la caja lo está revisando */}
          {solicitudCancelacion && (
            <div className="bg-tangelo/10 border-2 border-tangelo/40 rounded-2xl p-4">
              <p className="font-display text-base tracking-wide text-coal">⏳ Pediste cancelar este pedido</p>
              <p className="font-body text-xs text-coal/70 mt-1 leading-relaxed">
                {['en_camino', 'llego'].includes(etapaActual)
                  ? 'Como ya va en camino, lo decide administración y te confirman aquí mismo.'
                  : 'La sede lo está revisando y te confirma aquí mismo.'}
                {order.excepcionMotivo ? <> Tu motivo: «{order.excepcionMotivo}».</> : null}
              </p>
            </div>
          )}

          {/* Cancelar: directo en Enviado; después, se le pide a la sede */}
          {canClientCancel && (
            <div className="flex flex-col gap-1.5 pt-1">
              <button
                onClick={cancelOrder}
                disabled={cancelling}
                className="btn btn-sm w-full justify-center border border-pepper/40 text-pepper [@media(hover:hover)]:hover:bg-pepper/5"
              >
                {cancelling ? 'Enviando…' : <><X size={15} aria-hidden="true" /> {cancelaDirecto ? 'Cancelar pedido' : 'Pedir que cancelen el pedido'}</>}
              </button>
              <p className="font-body text-[11px] text-coal/45 text-center">
                {cancelaDirecto
                  ? 'Puedes cancelar mientras la sede no lo haya confirmado.'
                  : ['en_camino', 'llego'].includes(etapaActual)
                    ? 'Ya va en camino: tu solicitud le llega a administración, que decide.'
                    : 'La sede ya lo confirmó: revisa tu solicitud y te responde.'}
                {' '}¿Solo quieres cambiar algo? Escríbele por el chat de arriba y la sede te propone el cambio.
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

// ─── Client history modal ─────────────────────────────────────────────────────
function ClientHistoryModal({ orders, onClose, onSelect, onReorder }) {
  const [search,     setSearch]     = useState('')
  const [filterDate, setFilterDate] = useState('')
  useBackClose(true, onClose)

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
      <div className="bg-cream w-full max-w-lg rounded-t-3xl sm:rounded-3xl max-h-[90dvh] flex flex-col shadow-2xl animate-sheet-up sm:animate-scale-in">
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
              <Search size={32} className="text-coal/30" aria-hidden="true" />
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
                <div key={o.id} className="card w-full flex items-center gap-3">
                  <button onClick={() => onSelect(o)}
                    className="flex-1 min-w-0 text-left flex items-center gap-3 hover:opacity-80 transition-opacity">
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
                  {onReorder && isDelivered && o.items && (
                    <button onClick={() => onReorder(o)}
                      className="flex-shrink-0 flex flex-col items-center gap-0.5 px-3 py-2 rounded-xl bg-cherry/10 border border-cherry/25 text-cherry hover:bg-cherry/20 transition-colors"
                      title="Volver a pedir">
                      <span className="text-lg leading-none">🔁</span>
                      <span className="font-body text-[10px] font-bold uppercase tracking-wide">Volver<br/>a pedir</span>
                    </button>
                  )}
                </div>
              )
            })
          )}
        </div>
      </div>
    </div>
  )
}

// Fecha de vencimiento legible de un premio ("12 de noviembre").
const venceTexto = (r) => r?.expiresAt?.toDate ? format(r.expiresAt.toDate(), "d 'de' MMMM", { locale: es }) : null

// Bloque grande de "tienes tu premio": qué incluye, dónde vale, cuándo vence y
// cómo usarlo. Se muestra en el panel mientras el premio siga disponible.
function PremioListo({ rewards, sedeName }) {
  const count = rewards.length
  const proximo = [...rewards].sort((a, b) => (a.expiresAt?.toMillis?.() || 0) - (b.expiresAt?.toMillis?.() || 0))[0]
  const vence = venceTexto(proximo)
  return (
    <div className="rounded-3xl p-5 bg-gradient-to-br from-mint to-[#1f8a6a] text-cream shadow-lg">
      <p className="text-4xl leading-none">🎁</p>
      <p className="font-display text-2xl tracking-wide mt-2 leading-tight">
        {count > 1 ? `¡Tienes ${count} premios listos para usar!` : '¡Tienes tu premio listo para usar!'}
      </p>
      <div className="bg-cream/15 rounded-2xl px-4 py-3 mt-3">
        <p className="font-body text-xs uppercase tracking-wider text-cream/75 font-bold">
          {count > 1 ? 'Cada premio incluye, GRATIS:' : 'Incluye, GRATIS:'}
        </p>
        <p className="font-body text-base font-semibold mt-1">🍔 1 Hamburguesa Especial</p>
        <p className="font-body text-base font-semibold">🌭 1 Perro Grande con tocineta</p>
      </div>
      <ul className="font-body text-sm text-cream/90 mt-3 flex flex-col gap-1 leading-relaxed">
        <li>📍 Válido en <strong>{sedeName || 'esta sede'}</strong></li>
        {vence && <li>⏳ {count > 1 ? 'El primero vence' : 'Vence'} el <strong>{vence}</strong></li>}
        <li>👉 Arma tu pedido en el menú y, al completarlo, toca <strong>"Usar mi premio en este pedido"</strong></li>
      </ul>
      <a href="/" className="mt-4 flex items-center justify-center w-full py-3 rounded-full bg-cream text-mint font-body font-bold text-sm">
        Hacer un pedido y usar mi premio
      </a>
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
          ¡Ganaste {count > 1 ? `${count} premios` : 'un premio'} gratis!
        </p>
        <p className="font-body text-sm text-coal/80 mt-1 font-body">
          {count > 1 ? `${count}x ` : ''}Hamburguesa Especial + Perro Grande con tocineta
        </p>
        <p className="font-body text-sm text-coal/70 mt-2 leading-relaxed">
          Por tus domicilios entregados en <strong>{sedeNames.join(' y ') || 'tu sede'}</strong>. Lo puedes usar ahora
          o guardarlo para tu próximo pedido — tú decides cuándo.
        </p>
        <div className="bg-mint/10 border border-mint/30 rounded-2xl px-4 py-3 mt-3 text-left flex flex-col gap-1">
          <p className="font-body text-xs text-coal/75 leading-relaxed">
            📍 Solo vale pidiendo en <strong>{sedeNames.join(' y ') || 'la sede donde lo ganaste'}</strong>.
          </p>
          {venceTexto(rewards[0]) && (
            <p className="font-body text-xs text-coal/75 leading-relaxed">
              ⏳ Vence el <strong>{venceTexto(rewards[0])}</strong>.
            </p>
          )}
          <p className="font-body text-xs text-coal/75 leading-relaxed">
            👉 Para usarlo: arma tu pedido en el menú y, al completarlo, toca <strong>"Usar mi premio en este pedido"</strong>.
          </p>
        </div>
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
function Estrellas({ valor, onChange, etiqueta }) {
  const [hover, setHover] = useState(0)
  return (
    <div>
      <p className="font-body text-sm text-coal/70 text-center mb-2">{etiqueta}</p>
      <div className="flex justify-center gap-1.5">
        {[1, 2, 3, 4, 5].map(n => (
          <button key={n} type="button" onClick={() => onChange(n)} onMouseEnter={() => setHover(n)} onMouseLeave={() => setHover(0)}
            aria-label={`${n} de 5`}
            className={`transition-transform duration-150 [@media(hover:hover)]:hover:scale-110 active:scale-95 ${n <= (hover || valor) ? 'text-mustard' : 'text-coal/20'}`}>
            <Star size={34} fill={n <= (hover || valor) ? 'currentColor' : 'none'} aria-hidden="true" />
          </button>
        ))}
      </div>
      {valor > 0 && (
        <p className="text-center font-body text-xs text-coal/50 mt-1">
          {['', 'Muy malo', 'Malo', 'Regular', 'Bueno', '¡Excelente!'][valor]}
        </p>
      )}
    </div>
  )
}

// Calificación doble (§14.1): la comida y la entrega por separado; quien
// recogió en la sede no califica entrega. No se obliga: "Omitir" siempre está.
function RatingModal({ order, onClose }) {
  const [stars,   setStars]   = useState(0)
  const [entrega, setEntrega] = useState(0)
  const [comment, setComment] = useState('')
  const [saving,  setSaving]  = useState(false)
  const conEntrega = order.deliveryMode !== 'pickup'

  const submit = async () => {
    if (!stars && !entrega) return
    setSaving(true)
    try {
      await updateDoc(doc(db, 'orders', order.id), {
        rating:        stars || null,
        ratingEntrega: conEntrega ? (entrega || null) : null,
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

        <Estrellas valor={stars} onChange={setStars} etiqueta="¿Qué tal la comida?" />
        {conEntrega && <Estrellas valor={entrega} onChange={setEntrega} etiqueta="¿Y la entrega?" />}

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
            disabled={(!stars && !entrega) || saving}
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
    id: 'pedido', icon: ShoppingBag, title: '¿Cómo hago un pedido?',
    content: [
      { type: 'steps', items: [
        'Toca el botón rojo "Hacer pedido" en la parte inferior de la pantalla.',
        'Llena tus datos: nombre, teléfono / WhatsApp y dirección de entrega. Si ya pediste antes, tus datos y dirección aparecen automáticamente.',
        'Escribe lo que quieres pedir en el campo "¿Qué vas a pedir?" con todos los detalles.',
        'Agrega indicaciones adicionales si las tienes (sin cebolla, timbre 2B, etc.).',
        'Selecciona cómo vas a pagar: Efectivo, Transferencia o Nequi.',
        'Si pagas por Transferencia o Nequi, escanea el código QR que aparece en pantalla para hacer el pago.',
        'Toca "Enviar pedido" y espera la cotización del cajero.',
      ]},
    ],
  },
  {
    id: 'cotizacion', icon: Wallet, title: '¿Qué es la cotización?',
    content: [
      { type: 'p', text: 'Después de enviar tu pedido, un cajero revisa la disponibilidad y te envía el precio del pedido más el valor del domicilio. Verás el total directamente en tu pedido activo.' },
      { type: 'tip', text: 'No pagues hasta recibir la cotización. El cajero puede dejarte una nota con información adicional (disponibilidad, tiempo estimado, datos de pago, etc.).' },
    ],
  },
  {
    id: 'seguimiento', icon: MapPin, title: '¿Cómo sigo mi pedido?',
    content: [
      { type: 'p', text: 'Toca tu pedido activo para ver el estado en tiempo real:' },
      { type: 'table', rows: [
        ['Pedido enviado',        'Esperando cotización del cajero'],
        ['Cotización recibida',   'Revisa el precio en el detalle del pedido'],
        ['Domiciliario asignado', 'Ya tienen un repartidor para ti'],
        ['Domiciliario aceptó',   'El repartidor confirmó que va'],
        ['En camino',             'El repartidor está en ruta — puedes ver su ubicación'],
        ['Llegó al destino',      'El domiciliario ya está en tu puerta'],
        ['¡Entregado!',           'Pedido completado, ¡buen provecho!'],
      ]},
      { type: 'tip', text: 'Cuando el domiciliario está "En camino", aparece un botón para ver su ubicación en Google Maps en tiempo real.' },
    ],
  },
  {
    id: 'pago', icon: CreditCard, title: 'Formas de pago',
    content: [
      { type: 'table', rows: [
        ['Efectivo',      'Pagas directamente al domiciliario cuando llega a tu puerta'],
        ['Transferencia', 'Transferencia bancaria a la cuenta de DeliStars antes de la entrega'],
        ['Nequi',         'Pago por Nequi a la cuenta de DeliStars antes de la entrega'],
      ]},
      { type: 'tip', text: 'Para Transferencia y Nequi: al seleccionar ese método de pago en el formulario, aparece un código QR de Bancolombia (DELISTARS · Ahorros *3891) para escanear y pagar de inmediato.' },
    ],
  },
  {
    id: 'comprobante', icon: Paperclip, title: 'Subir comprobante de pago',
    content: [
      { type: 'p', text: 'Si pagas por Transferencia o Nequi, debes subir el comprobante para que el cajero confirme el pago:' },
      { type: 'steps', items: [
        'Abre el detalle de tu pedido activo.',
        'En la sección "Comprobante de Transferencia / Nequi", toca "Subir comprobante".',
        'Selecciona la foto o PDF del comprobante desde tu celular.',
        'Espera a que el cajero valide el pago — verás "Pago validado" cuando esté confirmado.',
      ]},
      { type: 'tip', text: 'Puedes subir la foto del comprobante incluso antes de recibir la cotización para agilizar el proceso.' },
    ],
  },
  {
    id: 'cancelar', icon: CircleX, title: '¿Puedo cancelar un pedido?',
    content: [
      { type: 'p', text: 'Para cancelar un pedido escríbenos por WhatsApp y con gusto te ayudamos.' },
      { type: 'tip', text: 'Encuentra el número de WhatsApp de tu sede en la pantalla principal.' },
    ],
  },
  {
    id: 'sede', icon: Store, title: 'Sedes y zonas de cobertura',
    content: [
      { type: 'p', text: 'Selecciona la sede más cercana a tu dirección de entrega. Puedes cambiarla tocando el ícono de ubicación en la parte superior o el botón "Cambiar" en la tarjeta de sede.' },
      { type: 'table', rows: [
        ['Santa Lucía',    'Cra. 87 #48e-3, Santa Rosa De Lima'],
        ['Santa Teresita', 'Cl 35B #87A-165, La América'],
      ]},
    ],
  },
  {
    id: 'horario', icon: Clock, title: 'Horario de atención',
    content: [
      { type: 'p', text: 'Cada sede tiene su propio horario de domicilios. Si tu sede aparece como "cerrada", la app te dice cuándo abre y si la otra sede está abierta. También puedes escribirnos por WhatsApp.' },
      { type: 'tip', text: 'Cada sede tiene su propio número de WhatsApp. Lo encuentras en la tarjeta de sede del panel principal.' },
    ],
  },
]

function ClientHelpSection({ section }) {
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

function ClientHelpModal({ onClose }) {
  useBackClose(true, onClose)
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
