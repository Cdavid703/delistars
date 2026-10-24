import { useState, useEffect, useRef, useMemo } from 'react'
import {
  collection, query, where, getDocs,
  doc, updateDoc, setDoc, serverTimestamp, arrayUnion
} from 'firebase/firestore'
import { db, registerLoyaltyDelivery, actualizarPedido } from '../../services/firebase'
import { conApi, ErrorApi } from '../../services/pedidosApi'
import { useAuth } from '../../contexts/AuthContext'
import Logo from '../common/Logo'
import RoleSwitcher from '../common/RoleSwitcher'
import StatusBadge from '../common/StatusBadge'
import { format } from 'date-fns'
import { es } from 'date-fns/locale'
import {
  MapPin, Phone, User, ShoppingBag, Navigation,
  ExternalLink, CheckCircle, LogOut, Bell,
  DollarSign, Calculator, X, MessageSquare, BookOpen, MoreVertical,
  Search, ChevronDown, ChevronUp, HelpCircle,
  Send, Radio, Route, Target, Gift, Check, Pencil, AlertTriangle, MessageCircle,
  ClipboardList, Tag, Banknote, Calendar, Lightbulb, Bike, ChevronRight
} from 'lucide-react'
import { SEDES } from '../../services/roles'
import CashChangeNotice from '../common/CashChangeNotice'
import { cashAmount } from '../../utils/payments'
import { revisarUbicacion, linkPedirUbicacion } from '../../utils/geoLink'
import { sonar, sonidoDeEstado } from '../../utils/sonidos'
import { pedidosCerca, geoDelPedido } from '../../utils/cercania'
import { optimizarRuta, ubicarDireccion, medirRuta } from '../../services/recorrido'
import BotonSilencio from '../common/BotonSilencio'
import BotonPushEquipo from '../common/BotonPushEquipo'
import TurnoDomiciliario from './TurnoDomiciliario'
import CampanaAvisos from '../common/CampanaAvisos'
import ChatDomiciliario from '../common/ChatDomiciliario'

// "Por aceptar" solo queda para pedidos asignados a la antigua: desde la Fase 5
// el pedido llega ya asignado y aparece directo en "En curso".
const ITEM_MENU = 'flex items-center gap-2.5 w-full text-left rounded-xl px-3 py-2.5 ' +
  'font-body text-sm font-semibold text-coal/80 transition-colors duration-150 ' +
  '[@media(hover:hover)]:hover:bg-smoked active:bg-smoked'

const TABS = [
  { id: 'pending',   label: 'Por aceptar' },
  { id: 'active',    label: 'En curso' },
  { id: 'completed', label: 'Entregados' },
]

// El sonido vive en utils/sonidos.js: un solo contexto de audio, que se
// despierta solo, y una melodía distinta por evento.

// Distancia geodésica en kilómetros (fórmula haversine)
function haversineKm(lat1, lng1, lat2, lng2) {
  const R = 6371
  const dLat = (lat2 - lat1) * Math.PI / 180
  const dLng = (lng2 - lng1) * Math.PI / 180
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.sin(dLng / 2) ** 2
  return R * 2 * Math.asin(Math.sqrt(a))
}

// Umbral para considerar 2 pedidos "cercanos" (en km)
const NEARBY_THRESHOLD_KM = 0.4

// Ubica una dirección: Google primero (vía backend, entiende el "#45-10"); si
// no responde, Photon (komoot.io, OpenStreetMap) con la calle principal.
async function geocodeAddress(fullAddress) {
  const google = await ubicarDireccion(fullAddress)
  if (google?.length) return { lat: google[0].lat, lng: google[0].lng }
  if (google) return null // Google respondió que no existe
  try {
    const street = fullAddress
      .replace(/\bnum[eé]ro\b.*/i, '')   // quitar "número X a Y"
      .replace(/#[^\s,]*/g, '')           // quitar "#45-10"
      .split(',')[0]
      .trim()
    const q = encodeURIComponent(street + ', Medellín, Colombia')
    const res = await fetch(`https://photon.komoot.io/api/?q=${q}&limit=1&lat=6.2442&lon=-75.5812`)
    if (!res.ok) return null
    const data = await res.json()
    const feature = data.features?.[0]
    if (feature) {
      const [lon, lat] = feature.geometry.coordinates  // GeoJSON: [lon, lat]
      return { lat, lng: lon }
    }
  } catch (_) {}
  return null
}

/** Hora (ms) de llegada si se sale ya y el recorrido toma `min` minutos. */
const llegadaEn = min => Date.now() + min * 60000

const isToday = ts => {
  if (!ts?.toDate) return false
  return ts.toDate().toDateString() === new Date().toDateString()
}

const fmt = v => (v !== undefined && v !== null && v !== '') ? `$${Number(v).toLocaleString('es-CO')}` : '—'

export default function DeliveryPanel() {
  const { user, sede, logout, selectSede } = useAuth()
  const [orders,          setOrders]         = useState([])
  const [tab,             setTab]            = useState('active')
  const [selected,        setSelected]       = useState(null)
  const [notifCount,      setNotifCount]     = useState(0)
  const [showCuadre,      setShowCuadre]     = useState(false)
  const [showManual,      setShowManual]     = useState(false)
  const [menu,            setMenu]           = useState(false)
  const [historyDate,     setHistoryDate]    = useState('')
  const [locationSharing, setLocationSharing] = useState(false)
  const [showRoute,       setShowRoute]      = useState(false)
  const [showReturnNav,   setShowReturnNav]  = useState(null)
  // Cache persistente { fullAddress: { lat, lng } | null }
  const [geoCache, setGeoCache] = useState(() => {
    try { return JSON.parse(localStorage.getItem('ds_geo_cache_v2') || '{}') } catch { return {} }
  })
  const prevCount        = useRef(0)
  // Foto de los estados de la tanda anterior. null en la primera carga, para no
  // sonar por pedidos que ya venían así desde antes de abrir el panel.
  const prevEstadoRef    = useRef(null)
  const geoWatchId       = useRef(null)
  // El GPS lee siempre lo último (pedidos y ubicaciones) por refs: si los
  // capturara al crearse, se quedaría con los pedidos de ese momento.
  const ordersRef        = useRef(orders)
  const geoCacheRef      = useRef(geoCache)
  useEffect(() => { ordersRef.current = orders }, [orders])
  useEffect(() => { geoCacheRef.current = geoCache }, [geoCache])
  const ultimaUbicRef    = useRef(0)
  // Pedidos de los que ya se avisó que están cerca (uno por pedido).
  const avisadosCercaRef = useRef(new Set())
  const [avisoCerca,      setAvisoCerca]     = useState(null)
  const locShareWatchId  = useRef(null)


  useEffect(() => {
    if (!user?.email) return
    const email = user.email.toLowerCase().trim()
    const q = query(collection(db, 'orders'), where('driverEmail', '==', email))

    const fetchOrders = async () => {
      try {
        const snap = await getDocs(q)
        const all = snap.docs.map(d => ({ id: d.id, ...d.data() }))
        // Otros cambios que le importan al domiciliario y antes pasaban
        // callados: que le cancelen un pedido que ya tenía asignado.
        if (prevEstadoRef.current) {
          let sonó = false
          // Fase 5: el pedido llega ya asignado (sin "Aceptar"). Suena y avisa.
          const nuevos = all.filter(o => prevEstadoRef.current[o.id] === undefined && o.asignacion &&
            ['accepted', 'preparing'].includes(o.status))
          if (nuevos.length) {
            sonar('asignado'); sonó = true
            setTab('active')
            try {
              if (typeof Notification !== 'undefined' && Notification.permission === 'granted') {
                new Notification('DeliStars — Nuevo domicilio', {
                  body: nuevos.length === 1 ? `Pedido${nuevos[0].orderNumber ? ` #${nuevos[0].orderNumber}` : ''}: ya es tuyo` : `${nuevos.length} pedidos nuevos: ya son tuyos`,
                  icon: '/logo_sello.png',
                })
              }
            } catch (_) {}
          }
          for (const o of all) {
            const prev = prevEstadoRef.current[o.id]
            if (prev !== undefined && prev !== o.status && !sonó && o.status !== 'assigned') {
              const cual = sonidoDeEstado('domiciliario', o.status)
              if (cual) { sonar(cual); sonó = true }
            }
          }
        } else {
          prevEstadoRef.current = {}
        }
        all.forEach(o => { prevEstadoRef.current[o.id] = o.status })

        const newPending = all.filter(o => o.status === 'assigned' && isToday(o.createdAt)).length
        if (newPending > prevCount.current) {
          sonar('asignado')
          try {
            if (typeof Notification !== 'undefined' && Notification.permission === 'granted') {
              new Notification('DeliStars — Nuevo pedido', {
                body: `Tienes ${newPending} pedido(s) por aceptar`,
                icon: '/logo_sello.png',
              })
            }
          } catch (_) {}
        }
        prevCount.current = newPending
        setNotifCount(newPending)
        setOrders(all.sort((a, b) => (b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0)))
      } catch (err) {
        console.error('[DeliveryPanel] Error al leer pedidos:', err.code, err.message)
      }
    }

    fetchOrders()
    const interval = setInterval(fetchOrders, 5000)
    return () => clearInterval(interval)
  }, [user?.email])

  useEffect(() => {
    if (typeof Notification !== 'undefined' && Notification.permission === 'default') {
      Notification.requestPermission()
    }
  }, [])

  // GPS mientras haya pedidos activos. Antes el efecto dependía de `orders`
  // (que se recarga cada 5 s) y al recargar apagaba el GPS sin volver a
  // prenderlo: la ubicación dejaba de llegarle al cliente a los pocos segundos.
  const hayActivos = orders.some(o => ['accepted','preparing','in_transit','arrived'].includes(o.status))
  useEffect(() => {
    if (!hayActivos || !navigator.geolocation) return
    geoWatchId.current = navigator.geolocation.watchPosition(
      pos => {
        const aqui = { lat: pos.coords.latitude, lng: pos.coords.longitude }
        const activos = ordersRef.current.filter(o => ['accepted','preparing','in_transit','arrived'].includes(o.status))

        // Ubicación a TODOS sus pedidos activos (antes solo al primero), como
        // mucho cada 10 s para no gastar escrituras.
        if (Date.now() - ultimaUbicRef.current >= 10000) {
          ultimaUbicRef.current = Date.now()
          activos.forEach(o => {
            updateDoc(doc(db, 'orders', o.id), {
              driverLat: aqui.lat,
              driverLng: aqui.lng,
              driverUpdatedAt: serverTimestamp(),
            }).catch(err => console.error('[DeliveryPanel] location update failed:', err))
          })
        }

        // ¿Pasa cerca de un pedido que lleva en sus manos?
        const cerca = pedidosCerca(aqui, activos, {
          geoCache: geoCacheRef.current, avisados: avisadosCercaRef.current,
        })
        if (cerca.length) {
          cerca.forEach(c => avisadosCercaRef.current.add(c.order.id))
          const { order, metros } = cerca[0]
          setAvisoCerca({ order, metros, otros: cerca.length - 1 })
          sonar('atencion')
          try { navigator.vibrate?.([300, 150, 300]) } catch { /* sin vibración */ }
          if (typeof Notification !== 'undefined' && Notification.permission === 'granted') {
            try {
              new Notification('Tienes un pedido cerca', {
                body: `A ${metros} m: ${order.orderNumber ? `#${order.orderNumber} · ` : ''}${order.fullAddress || ''}`,
                tag: `cerca-${order.id}`,
              })
            } catch { /* algunos navegadores no dejan crear notificaciones así */ }
          }
        }
      },
      () => {},
      { enableHighAccuracy: true, maximumAge: 10000 }
    )
    return () => {
      navigator.geolocation.clearWatch(geoWatchId.current)
      geoWatchId.current = null
    }
  }, [hayActivos])

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

  const pendingOrders   = orders.filter(o => o.status === 'assigned' && isToday(o.createdAt))
  const activeOrders    = orders.filter(o => ['accepted','preparing','in_transit','arrived'].includes(o.status))
  const completedOrders = orders.filter(o => {
    if (!['delivered_paid','delivered_cash','pending_cuadre','completed'].includes(o.status)) return false
    const target = historyDate ? new Date(historyDate + 'T00:00:00') : new Date()
    if (!o.createdAt?.toDate) return false
    return o.createdAt.toDate().toDateString() === target.toDateString()
  })

  // Pedidos "ruteables" = todos los que el domiciliario debe atender (asignados + en curso)
  const routableOrders = [...pendingOrders, ...activeOrders].filter(o => o.fullAddress)

  // Persistir cache de geocoding
  useEffect(() => {
    try { localStorage.setItem('ds_geo_cache_v2', JSON.stringify(geoCache)) } catch {}
  }, [geoCache])

  // Geocodificar direcciones nuevas (1.2 s entre consultas: respeta el uso justo
  // de Photon cuando cae al respaldo). El caché v2 descarta lo que dio Photon antes.
  const routableAddrKey = routableOrders.map(o => o.fullAddress).join('|')
  useEffect(() => {
    const toGeocode = routableOrders
      .map(o => o.fullAddress)
      .filter(addr => addr && !(addr in geoCache))
    if (toGeocode.length === 0) return
    let cancelled = false
    ;(async () => {
      for (const addr of toGeocode) {
        if (cancelled) return
        const geo = await geocodeAddress(addr)
        if (cancelled) return
        setGeoCache(prev => ({ ...prev, [addr]: geo }))
        await new Promise(r => setTimeout(r, 1200))
      }
    })()
    return () => { cancelled = true }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [routableAddrKey])

  // Clusters de pedidos cercanos entre sí (≤ NEARBY_THRESHOLD_KM)
  const nearbyClusters = useMemo(() => {
    const geocoded = routableOrders
      .map(o => ({ ...o, geo: geoDelPedido(o, geoCache) }))
      .filter(o => o.geo)
    if (geocoded.length < 2) return []
    const clusters = []
    const visited = new Set()
    for (let i = 0; i < geocoded.length; i++) {
      if (visited.has(i)) continue
      const cluster = [geocoded[i]]
      visited.add(i)
      let added = true
      while (added) {
        added = false
        for (let j = 0; j < geocoded.length; j++) {
          if (visited.has(j)) continue
          const near = cluster.some(c =>
            haversineKm(c.geo.lat, c.geo.lng, geocoded[j].geo.lat, geocoded[j].geo.lng) <= NEARBY_THRESHOLD_KM
          )
          if (near) { cluster.push(geocoded[j]); visited.add(j); added = true }
        }
      }
      if (cluster.length >= 2) clusters.push(cluster)
    }
    return clusters
    // routableAddrKey es la clave serializada de routableOrders (sus direcciones);
    // se usa a propósito en vez del array para no recalcular en cada render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [geoCache, routableAddrKey])

  const totalNearby = nearbyClusters.reduce((s, c) => s + c.length, 0)

  const tabOrders = tab === 'pending' ? pendingOrders : tab === 'active' ? activeOrders : completedOrders

  return (
    <div className="min-h-screen-safe flex flex-col bg-gradient-soft">
      {avisoCerca && (
        <div className="fixed top-3 inset-x-3 z-[120] mx-auto max-w-lg rounded-2xl border-2 border-mint bg-cream shadow-xl p-4 animate-fade-in">
          <div className="flex items-start gap-3">
            <MapPin size={22} className="text-mint flex-shrink-0 mt-0.5" />
            <div className="min-w-0 flex-1">
              <p className="font-display text-lg text-coal tracking-wide leading-tight">
                <Target size={14} className="inline-block mr-1.5 -mt-0.5" aria-hidden="true" />Tienes un pedido a {avisoCerca.metros} m
              </p>
              <p className="font-body text-sm text-coal/75 mt-1">
                {avisoCerca.order.orderNumber && <strong>#{avisoCerca.order.orderNumber} · </strong>}
                {avisoCerca.order.clientName || avisoCerca.order.name || ''}
              </p>
              <p className="font-body text-xs text-coal/60 truncate">{avisoCerca.order.fullAddress}</p>
              {avisoCerca.otros > 0 && (
                <p className="font-body text-xs text-tangelo font-semibold mt-1">
                  y {avisoCerca.otros} pedido{avisoCerca.otros > 1 ? 's' : ''} más por aquí
                </p>
              )}
              <div className="flex gap-2 mt-3">
                <button onClick={() => { setSelected(avisoCerca.order); setAvisoCerca(null) }}
                  className="btn-primary btn-sm flex-1">Ver pedido</button>
                <button onClick={() => setAvisoCerca(null)} className="btn-secondary btn-sm">Cerrar</button>
              </div>
            </div>
          </div>
        </div>
      )}
      <header className="page-header gap-2">
        <div className="flex items-center gap-2 min-w-0">
          <Logo variant="light" size="sm" />
          <div className="min-w-0">
            <p className="font-display text-base text-coal tracking-wide leading-tight">
              {user?.displayName?.split(' ')[0] || user?.email?.split('@')[0] || 'Domiciliario'}
            </p>
            <div className="flex items-center gap-1.5 mt-0.5">
              <span className="font-body text-[10px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded-full bg-mint/15 text-mint">Domiciliario</span>
              <p className="font-body text-xs text-coal/50 truncate">{sede?.id === 'all' ? 'Ambas sedes' : sede?.name}</p>
            </div>
          </div>
        </div>
        {/* En la mano, en la calle: en el encabezado solo lo que se usa en cada
            entrega. Lo demás vive en el menú, que antes era una tercera fila
            de iconos sueltos. */}
        <div className="flex items-center gap-1.5 justify-end">
          <BotonPushEquipo email={user?.email} rol="driver" sedeId={sede?.id} />
          <BotonSilencio />
          <button onClick={toggleLocationSharing} title={locationSharing ? 'Desactivar GPS compartido' : 'Compartir mi ubicación con cajero'}
            className={`btn-icon relative ${locationSharing ? 'text-mint' : 'text-coal/60 hover:text-mint'}`}>
            <Radio size={18} aria-hidden="true" />
            {locationSharing && <span className="absolute top-1 right-1 w-2 h-2 rounded-full bg-mint" />}
          </button>
          <CampanaAvisos destinos={[user?.email?.toLowerCase()]}
            onAbrirPedido={(id) => { const o = orders.find(x => x.id === id); if (o) setSelected(o) }} />
          <div className="relative">
            <button onClick={() => setMenu(v => !v)} className="btn-icon" title="Más opciones"
              aria-label="Más opciones" aria-expanded={menu}>
              <MoreVertical size={20} aria-hidden="true" />
            </button>
            {menu && (
              <>
                <div className="fixed inset-0 z-40" onClick={() => setMenu(false)} />
                <div className="absolute right-0 top-12 z-50 w-60 card p-2 flex flex-col gap-0.5">
                  <button onClick={() => { setMenu(false); setShowManual(true) }} className={ITEM_MENU}>
                    <BookOpen size={16} aria-hidden="true" /> Manual del domiciliario
                  </button>
                  <button onClick={() => { setMenu(false); setShowCuadre(true) }} className={ITEM_MENU}>
                    <Calculator size={16} aria-hidden="true" /> Cuadre de turno
                  </button>
                  <button onClick={() => { setMenu(false); selectSede(null) }} className={ITEM_MENU}>
                    <MapPin size={16} aria-hidden="true" /> Cambiar de sede
                  </button>
                  <div className="flex items-center justify-between gap-2 px-3 py-1">
                    <span className="font-body text-sm text-coal/60">Ver como</span>
                    <RoleSwitcher />
                  </div>
                  <button onClick={logout} className={`${ITEM_MENU} text-pepper`}>
                    <LogOut size={16} aria-hidden="true" /> Cerrar sesión
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      </header>

      <TurnoDomiciliario email={user?.email} pendientes={activeOrders.length + pendingOrders.length}
        onEstado={(estado) => {
          // En turno se comparte la ubicación con la caja; al terminar sin pedidos, se apaga.
          if (estado === 'activo' && !locationSharing) toggleLocationSharing()
          if (estado === 'fuera' && locationSharing && activeOrders.length === 0) toggleLocationSharing()
        }} />

      {/* Antes rebotaba sin parar y no se podía tocar: el rojo ya llama la
          atención, y ahora lleva derecho a los pedidos por aceptar. */}
      {notifCount > 0 && (
        <button onClick={() => setTab('pending')}
          className="mx-4 mt-3 bg-cherry text-cream rounded-2xl px-4 py-3 flex items-center gap-3 text-left
                     transition-transform duration-150 active:scale-[0.99]">
          <Bell size={18} className="flex-shrink-0" aria-hidden="true" />
          <p className="font-body font-semibold text-sm">
            {notifCount === 1 ? '¡Tienes 1 pedido nuevo!' : `¡Tienes ${notifCount} pedidos nuevos!`}
          </p>
          <ChevronRight size={18} className="ml-auto flex-shrink-0" aria-hidden="true" />
        </button>
      )}

      <div className="flex border-b border-coal/10 bg-cream/80 px-4 mt-2">
        {TABS.filter(t => t.id !== 'pending' || pendingOrders.length > 0).map(t => {
          const count = t.id === 'pending' ? pendingOrders.length : t.id === 'active' ? activeOrders.length : completedOrders.length
          return (
            <button key={t.id} onClick={() => setTab(t.id)}
              className={tab === t.id ? 'tab-btn-active' : 'tab-btn-inactive'}>
              {t.label}
              {count > 0 && (
                <span key={count} className={`ml-1 text-[10px] font-bold px-1.5 py-0.5 rounded-full inline-block animate-pop ${
                  t.id === 'pending' ? 'bg-cherry text-cream' : 'bg-coal/10 text-coal'
                }`}>{count}</span>
              )}
            </button>
          )
        })}
      </div>

      {/* Botones volver a sede */}
      <div className="mx-4 mt-2 flex gap-2">
        {Object.values(SEDES).map(s => (
          <button key={s.id} onClick={() => { setShowReturnNav(s.id) }}
            className="flex-1 flex items-center justify-center gap-1.5 py-2 rounded-xl bg-cherry/10 border border-cherry/20 text-cherry hover:bg-cherry/20 transition-colors">
            <MapPin size={13} className="flex-shrink-0" />
            <span className="font-body text-xs font-semibold truncate">Volver a {s.name}</span>
          </button>
        ))}
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
      {tab === 'active' && activeOrders.some(o => o.cashOnDelivery || o.payment === 'Efectivo' || o.payment === 'Mixto') && (() => {
        const total = activeOrders.filter(o => o.cashOnDelivery || o.payment === 'Efectivo' || o.payment === 'Mixto').reduce((s, o) => s + cashAmount(o), 0)
        return (
          <div className="mx-4 mt-2 bg-mustard/15 border border-mustard/30 rounded-xl px-4 py-2.5 flex items-center justify-between">
            <span className="font-body text-xs font-semibold text-coal/70">Efectivo a cobrar en ruta:</span>
            <span className="font-display text-lg text-mustard">{fmt(total)}</span>
          </div>
        )
      })()}

      {/* Nearby orders alert + route suggestion (sólo en Pedidos / En curso, con ≥2 pedidos) */}
      {tab !== 'completed' && routableOrders.length >= 2 && (
        <div className="mx-4 mt-2 flex flex-col gap-2">
          {nearbyClusters.length > 0 && (
            <button
              onClick={() => setShowRoute(true)}
              className="w-full bg-mint/15 border border-mint/40 rounded-xl px-4 py-2.5 flex items-center gap-3 hover:bg-mint/25 transition-colors text-left"
            >
              <Target size={18} className="text-mint flex-shrink-0 animate-pulse" />
              <div className="flex-1 min-w-0">
                <p className="font-body text-sm font-bold text-coal leading-tight">
                  {totalNearby === 2
                    ? '¡2 pedidos a menos de 400 m!'
                    : `¡${totalNearby} pedidos en ${nearbyClusters.length === 1 ? 'la misma zona' : `${nearbyClusters.length} zonas`} (≤ 400 m)!`}
                </p>
                <p className="font-body text-xs text-coal/60">Toca para ver ruta sugerida</p>
              </div>
              <Route size={18} className="text-mint flex-shrink-0" />
            </button>
          )}
          {nearbyClusters.length === 0 && (
            <button
              onClick={() => setShowRoute(true)}
              className="w-full bg-cherry/10 border border-cherry/30 rounded-xl px-4 py-2.5 flex items-center gap-3 hover:bg-cherry/20 transition-colors text-left"
            >
              <Route size={18} className="text-cherry flex-shrink-0" />
              <div className="flex-1 min-w-0">
                <p className="font-body text-sm font-bold text-coal leading-tight">
                  Sugerir orden de entrega ({routableOrders.length} pedidos)
                </p>
                <p className="font-body text-xs text-coal/60">
                  {Object.keys(geoCache).length < routableOrders.length
                    ? 'Calculando ubicaciones…'
                    : 'Ruta optimizada desde la sede'}
                </p>
              </div>
              <Navigation size={16} className="text-cherry flex-shrink-0" />
            </button>
          )}
        </div>
      )}

      {/* Summary for completed tab */}
      {tab === 'completed' && tabOrders.length > 0 && (
        <DriverEntregadosSummary orders={tabOrders} />
      )}

      <main className="flex-1 overflow-y-auto scroll-custom p-4 flex flex-col gap-3 stagger">
        {tabOrders.length === 0 && (
          <div className="flex flex-col items-center justify-center gap-3 py-16">
            {tab === 'pending' ? <Bike size={32} className="text-coal/25" aria-hidden="true" />
              : tab === 'active' ? <Route size={32} className="text-coal/25" aria-hidden="true" />
              : <CheckCircle size={32} className="text-coal/25" aria-hidden="true" />}
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

      {selected && <DriverOrderDetail key={selected.id} order={selected} onClose={() => setSelected(null)} />}

      {showCuadre && (
        <DriverCuadreTurnoModal orders={orders} onClose={() => setShowCuadre(false)} />
      )}

      {showManual && (
        <DriverManualModal onClose={() => setShowManual(false)} />
      )}

      {showRoute && (
        <RouteSuggestionModal
          orders={routableOrders}
          geoCache={geoCache}
          clusters={nearbyClusters}
          sede={sede}
          onClose={() => setShowRoute(false)}
          onOrderClick={o => { setShowRoute(false); setSelected(o) }}
        />
      )}

      {showReturnNav && (
        <ReturnToSedeModal sedeId={showReturnNav} onClose={() => setShowReturnNav(null)} />
      )}
    </div>
  )
}

// ─── Modal de regreso a sede ───────────────────────────────────────────────────
function ReturnToSedeModal({ sedeId, onClose }) {
  const sede = SEDES[sedeId]
  if (!sede) return null

  const openMaps = () => {
    const dest = sede.mapsAddress || sede.address
    window.open(`https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(dest)}`, '_blank')
  }

  const openWaze = () => {
    window.open(`https://waze.com/ul?ll=${sede.coords.lat},${sede.coords.lng}&navigate=yes`, '_blank')
  }

  return (
    <div className="fixed inset-0 z-[110] flex items-end sm:items-center justify-center bg-coal/50 backdrop-blur-sm animate-fade-in"
      onClick={e => { if (e.target === e.currentTarget) onClose() }}>
      <div className="bg-cream w-full max-w-sm rounded-t-3xl sm:rounded-3xl animate-sheet-up sm:animate-scale-in shadow-2xl">
        <div className="sticky top-0 bg-gradient-to-r from-cherry to-tangelo px-6 py-5 rounded-t-3xl flex items-center justify-between">
          <div className="flex items-center gap-3">
            <MapPin size={20} className="text-cream" />
            <div>
              <p className="font-display text-xl text-cream tracking-wide">Volver a {sede.name}</p>
              <p className="font-body text-xs text-cream/70">{sede.address}</p>
            </div>
          </div>
          <button onClick={onClose} className="text-cream/70 hover:text-cream"><X size={22} /></button>
        </div>

        <div className="p-5 flex flex-col gap-3 pb-8">
          <p className="font-body text-sm text-coal/60 text-center">¿Con qué app quieres navegar?</p>
          <button onClick={openMaps} className="btn-primary w-full btn-lg">
            <Navigation size={18} /> Abrir en Google Maps
          </button>
          <button onClick={openWaze} className="btn-secondary w-full btn-lg">
            <ExternalLink size={18} /> Abrir en Waze
          </button>
        </div>
      </div>
    </div>
  )
}

// Badge con la sede de la que sale el pedido — clave para que el domiciliario
// sepa a dónde dirigirse al aceptar (sobre todo si trabaja "Ambas sedes").
function SedeBadge({ order, size = 'sm' }) {
  const sedeName = order.sedeName || SEDES[order.sedeId]?.name
  if (!sedeName) return null
  const color = order.sedeId === 'santa_teresita'
    ? 'bg-mint/15 text-[#2d8c6f] border-mint/40'
    : 'bg-cherry/10 text-cherry border-cherry/30'
  const pad = size === 'lg' ? 'px-3 py-1 text-sm' : 'px-2 py-0.5 text-[11px]'
  return (
    <span className={`inline-flex items-center gap-1 rounded-full border font-body font-bold ${pad} ${color}`}>
      <MapPin size={size === 'lg' ? 14 : 11} /> {sedeName}
    </span>
  )
}

// ─── Mini card ────────────────────────────────────────────────────────────────
function DriverOrderCard({ order, onClick }) {
  return (
    <button onClick={onClick}
      className={`order-card w-full text-left ${order.status === 'assigned' ? 'border-cherry bg-cherry/5' : 'border-smoked'}`}>
      <div className="flex items-start justify-between gap-2 mb-2">
        <div className="flex items-center gap-2 flex-wrap">
          {order.orderNumber && <span className="font-display text-lg text-cherry">#{order.orderNumber}</span>}
          <StatusBadge status={order.status} />
          <SedeBadge order={order} />
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
      {order.loyaltyRedemption?.count > 0 && (
        <p className="mt-1.5 font-body text-xs font-bold text-mint flex items-center gap-1.5">
          <Gift size={13} aria-hidden="true" /> Incluye premio gratis
        </p>
      )}
    </button>
  )
}

// ─── Full detail + actions ────────────────────────────────────────────────────
function DriverOrderDetail({ order, onClose }) {
  const { user } = useAuth()
  const [loading,        setLoading]       = useState(false)
  const [commentText,    setCommentText]   = useState('')
  const [sendingComment, setSendingComment] = useState(false)

  // Address editing
  const [localAddr,      setLocalAddr]      = useState(order.fullAddress || '')
  const [editingAddr,    setEditingAddr]    = useState(false)
  const [addrDraft,      setAddrDraft]      = useState('')
  const [addrSuggestions, setAddrSuggestions] = useState([])
  const [searchingAddr,  setSearchingAddr]  = useState(false)
  const [addrSearched,   setAddrSearched]   = useState(false)
  const [savingAddr,     setSavingAddr]     = useState(false)

  // Pin exacto pegado desde WhatsApp
  const [pinOpen,   setPinOpen]   = useState(false)
  const [pinDraft,  setPinDraft]  = useState('')
  const [pinSaving, setPinSaving] = useState(false)
  // Coordenadas resueltas desde el texto cuando el pedido no trae pin propio.
  // Se guarda junto a la dirección que las produjo: así, si la dirección
  // cambia, el resultado viejo deja de valer sin tener que limpiarlo a mano.
  const [autoGeo, setAutoGeo] = useState({ addr: null, coords: null })

  // Cambios del domiciliario por la API (el servidor valida y cuenta la
  // fidelización al entregar). Si el servidor no responde, el camino directo.
  // Devuelve false si hubo un error que se le mostró al domiciliario.
  const update = async (ruta, cuerpo, data, despuesDirecto) => {
    setLoading(true)
    try {
      await conApi(`${order.id}/${ruta}`, { ...cuerpo, version: order.version ?? 0 }, async () => {
        await actualizarPedido(order, data, { rol: 'domiciliario' })
        despuesDirecto?.()
      })
      onClose()
      return true
    } catch (err) {
      if (err instanceof ErrorApi) { alert(err.message); return false }
      throw err
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

  const searchAddr = async () => {
    if (!addrDraft.trim()) return
    setSearchingAddr(true)
    setAddrSuggestions([])
    setAddrSearched(false)
    const google = await ubicarDireccion(addrDraft.trim())
    if (google) {
      setAddrSuggestions(google.map(l => l.direccion))
      setAddrSearched(true)
      setSearchingAddr(false)
      return
    }
    try {
      const cleaned = addrDraft.replace(/#[^\s,]*/g, '').split(',')[0].trim()
      const q = encodeURIComponent(cleaned + ', Medellín, Colombia')
      const res = await fetch(`https://photon.komoot.io/api/?q=${q}&limit=4&lat=6.2442&lon=-75.5812`)
      if (res.ok) {
        const data = await res.json()
        setAddrSuggestions((data.features || []).map(f => {
          const p = f.properties
          const num = p.housenumber ? ` #${p.housenumber}` : ''
          const street = p.street ? `${p.street}${num}` : (p.name || '')
          const locality = p.district || p.suburb || p.city || ''
          return [street, locality].filter(Boolean).join(', ')
        }).filter(Boolean))
      }
    } catch (_) {}
    setAddrSearched(true)
    setSearchingAddr(false)
  }

  const saveAddr = async () => {
    if (!addrDraft.trim()) return
    setSavingAddr(true)
    try {
      await updateDoc(doc(db, 'orders', order.id), {
        fullAddress: addrDraft.trim(),
        // El domiciliario reescribió la dirección: las coordenadas que había
        // elegido el cliente ya no aplican, se limpian para no navegar al punto
        // viejo (Maps/Waze vuelven a resolver por el texto nuevo).
        addrLat: null,
        addrLng: null,
        updatedAt:   serverTimestamp(),
      })
      setLocalAddr(addrDraft.trim())
      setEditingAddr(false)
      setAddrSuggestions([])
      setAddrSearched(false)
    } finally { setSavingAddr(false) }
  }

  const accept    = () => update('aceptar', {}, { status: 'accepted', acceptedAt: serverTimestamp() })
  const prepare   = () => update('transiciones', { a: 'en_preparacion' }, { status: 'preparing', preparingAt: serverTimestamp() })
  // Al salir se calcula a qué hora llega: es el único momento seguro con la
  // página abierta (después el domiciliario navega con Google Maps o Waze y
  // el celular pausa la página y su GPS). Se guarda en el pedido para que el
  // cliente vea una hora real aunque no lleguen más ubicaciones.
  const transit = async () => {
    const salio = await update('transiciones', { a: 'en_camino' }, { status: 'in_transit', inTransitAt: serverTimestamp() })
    if (!salio || !navCoords) return
    const gps = await new Promise(res => {
      if (!navigator.geolocation) { res(null); return }
      navigator.geolocation.getCurrentPosition(
        p => res({ lat: p.coords.latitude, lng: p.coords.longitude }),
        () => res(null),
        { enableHighAccuracy: true, timeout: 5000, maximumAge: 60000 },
      )
    })
    const desde = gps || SEDES[order.sedeId]?.coords
    if (!desde) return
    const ruta = await medirRuta(desde, navCoords)
    if (!ruta?.min) return
    await updateDoc(doc(db, 'orders', order.id), {
      etaMin:       ruta.min,
      etaLlegadaAt: llegadaEn(ruta.min),
      etaDesde:     gps ? 'gps' : 'sede',
      ...(gps ? { driverLat: gps.lat, driverLng: gps.lng, driverUpdatedAt: serverTimestamp() } : {}),
    }).catch(err => console.error('[DeliveryPanel] eta update failed:', err))
  }
  const arrived   = () => update('transiciones', { a: 'llego' }, { status: 'arrived', arrivedAt: serverTimestamp() })

  const markDelivered = () => {
    const isCash = order.cashOnDelivery || order.payment === 'Efectivo' || order.payment === 'Mixto'
    const newStatus = isCash ? 'pending_cuadre' : 'completed'
    // Por la API el servidor cuenta la fidelización; en el respaldo, como siempre.
    update('transiciones', { a: 'entregado' }, { status: newStatus, deliveredAt: serverTimestamp() },
      () => registerLoyaltyDelivery(order)) // best-effort, no bloquea la entrega
  }

  // ── A dónde navegamos ──────────────────────────────────────────────────────
  // Por orden de confianza:
  //   1. Pin exacto del pedido (lo puso el cliente al pedir, o lo pegó el
  //      domiciliario desde la ubicación de WhatsApp).
  //   2. Coordenadas resueltas del texto con el geocodificador.
  //   3. El texto crudo. Último recurso: el buscador de Waze no entiende la
  //      nomenclatura de Medellín ("Calle 44 B #70 A-23") y suele fallar.
  const hasCoords  = order.addrLat != null && order.addrLng != null

  // Sin pin propio: se resuelve el texto una vez para no mandarle a Waze una
  // dirección que no va a entender.
  useEffect(() => {
    if (hasCoords || !localAddr.trim()) return
    let vivo = true
    geocodeAddress(localAddr).then(c => { if (vivo) setAutoGeo({ addr: localAddr, coords: c }) })
    return () => { vivo = false }
  }, [hasCoords, localAddr])

  const autoCoords = (!hasCoords && autoGeo.addr === localAddr) ? autoGeo.coords : null
  const navCoords  = hasCoords ? { lat: order.addrLat, lng: order.addrLng } : autoCoords
  const precision  = hasCoords ? 'pin' : (autoCoords ? 'aprox' : 'texto')
  const navAddress = encodeURIComponent(localAddr + ', Medellín, Colombia')

  const openMaps = () => window.open(
    navCoords
      ? `https://www.google.com/maps/dir/?api=1&destination=${navCoords.lat},${navCoords.lng}`
      : `https://www.google.com/maps/dir/?api=1&destination=${navAddress}`,
    '_blank')
  const openWaze = () => window.open(
    navCoords
      ? `https://waze.com/ul?ll=${navCoords.lat},${navCoords.lng}&navigate=yes`
      : `https://waze.com/ul?q=${encodeURIComponent(localAddr)}&navigate=yes`,
    '_blank')

  // ── Pedir la ubicación por WhatsApp ────────────────────────────────────────
  const waPedirUbicacion = linkPedirUbicacion({
    telefono:     order.phone,
    cliente:      order.name || order.clientName,
    domiciliario: user?.displayName || order.driverName,
    pedido:       order.orderNumber,
  })

  // ── Guardar el pin que el cliente mandó por WhatsApp ───────────────────────
  const pinCheck = pinDraft.trim() ? revisarUbicacion(pinDraft) : null
  const savePin = async () => {
    if (!pinCheck?.coords) return
    setPinSaving(true)
    try {
      await updateDoc(doc(db, 'orders', order.id), {
        addrLat:    pinCheck.coords.lat,
        addrLng:    pinCheck.coords.lng,
        addrPinBy:  user?.email || 'domiciliario',
        addrPinAt:  serverTimestamp(),
        updatedAt:  serverTimestamp(),
      })
      setPinOpen(false)
      setPinDraft('')
    } finally { setPinSaving(false) }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-coal/50 backdrop-blur-sm animate-fade-in"
      onClick={e => { if (e.target === e.currentTarget) onClose() }}>
      <div className="bg-cream w-full max-w-lg rounded-t-3xl sm:rounded-3xl max-h-[92dvh] overflow-y-auto scroll-custom animate-sheet-up sm:animate-scale-in">
        <div className="sticky top-0 bg-cream/95 backdrop-blur-sm flex items-center justify-between px-5 py-4 border-b border-coal/10">
          <div className="flex items-center gap-2 flex-wrap">
            {order.orderNumber && <span className="font-display text-2xl text-cherry">#{order.orderNumber}</span>}
            <StatusBadge status={order.status} />
            <SedeBadge order={order} size="lg" />
          </div>
          <button onClick={onClose} className="btn-icon text-coal/50" aria-label="Cerrar"><X size={20} aria-hidden="true" /></button>
        </div>

        <div className="p-5 flex flex-col gap-4">
          {/* Premio de fidelización canjeado */}
          {order.loyaltyRedemption?.count > 0 && (
            <div className="bg-mint/15 border-2 border-mint rounded-2xl p-4">
              <p className="font-display text-base tracking-wide text-mint flex items-center gap-2">
                <Gift size={17} aria-hidden="true" /> Incluye premio de fidelización
              </p>
              <p className="font-body text-sm text-coal/80 mt-1">
                Este pedido lleva {order.loyaltyRedemption.count}x premio GRATIS (Hamburguesa Especial + Perro Grande con tocineta) — ya está cubierto, no es parte del cobro.
              </p>
            </div>
          )}

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
                    <MessageCircle size={15} aria-hidden="true" /> WhatsApp
                  </a>
                )
              })()}
            </div>
          </div>

          {/* Address + navigation */}
          <div className="card">
            {!editingAddr ? (
              <>
                <div className="flex items-start gap-2 mb-3">
                  <MapPin size={16} className="text-cherry flex-shrink-0 mt-0.5" />
                  <div className="flex-1 min-w-0">
                    <p className="font-body font-semibold text-sm">{localAddr}</p>
                    {order.barrio    && <p className="font-body text-xs text-coal/50">Barrio: {order.barrio}</p>}
                    {order.reference && <p className="font-body text-xs text-coal/50">Ref: {order.reference}</p>}
                  </div>
                </div>
                {/* Qué tan confiable es a dónde va a navegar */}
                <div className={`mb-2 rounded-xl border px-3 py-2 flex items-start gap-2 ${
                  precision === 'pin'   ? 'bg-mint/10 border-mint/30'
                  : precision === 'aprox' ? 'bg-mustard/10 border-mustard/30'
                  : 'bg-cherry/10 border-cherry/30'}`}>
                  <Target size={14} className={`flex-shrink-0 mt-0.5 ${
                    precision === 'pin' ? 'text-mint' : precision === 'aprox' ? 'text-mustard' : 'text-cherry'}`} />
                  <p className="font-body text-[11px] leading-relaxed text-coal/70">
                    {precision === 'pin'   && <><b className="text-mint">Ubicación exacta.</b> Maps y Waze te llevan al punto exacto.</>}
                    {precision === 'aprox' && <><b className="text-[#8a5a00]">Ubicación aproximada.</b> Te deja cerca, sobre la vía. Si no das con la casa, pídele la ubicación al cliente.</>}
                    {precision === 'texto' && <><b className="text-cherry">Sin ubicación en el mapa.</b> Waze va a buscar por el texto y casi siempre falla. Pídele la ubicación al cliente.</>}
                  </p>
                </div>

                <div className="flex gap-2 mb-2">
                  <button onClick={openMaps} className="btn-secondary btn-sm flex-1"><Navigation size={14} />Maps</button>
                  <button onClick={openWaze} className="btn-secondary btn-sm flex-1"><ExternalLink size={14} />Waze</button>
                </div>

                {/* Pedir la ubicación por WhatsApp + pegarla */}
                {!['delivered_paid','delivered_cash','pending_cuadre','completed'].includes(order.status) && (
                  <div className="flex flex-col gap-2 mb-2">
                    {order.phone && (
                      <a href={waPedirUbicacion} target="_blank" rel="noreferrer"
                        className="btn w-full justify-center bg-[#25D366] text-white [@media(hover:hover)]:hover:brightness-95">
                        <MapPin size={14} aria-hidden="true" /> Pedirle la ubicación por WhatsApp
                      </a>
                    )}
                    {!pinOpen ? (
                      <button onClick={() => setPinOpen(true)}
                        className="btn-link text-xs self-start text-mint decoration-mint/40">
                        <Target size={14} aria-hidden="true" /> Ya me mandó la ubicación — pegarla aquí
                      </button>
                    ) : (
                      <div className="flex flex-col gap-2 bg-smoked/50 rounded-xl p-3">
                        <p className="font-body text-[11px] text-coal/60 leading-relaxed">
                          Mantén presionado el mensaje de ubicación que te mandó, <b>Copiar</b>, y pégalo aquí.
                        </p>
                        <textarea
                          className="input-field text-sm min-h-[68px] resize-y"
                          value={pinDraft}
                          onChange={e => setPinDraft(e.target.value)}
                          placeholder="Pega aquí el enlace de la ubicación…"
                          autoComplete="off"
                        />
                        {pinCheck && (
                          <p className={`font-body text-[11px] leading-relaxed ${
                            pinCheck.nivel === 'ok' ? 'text-mint'
                            : pinCheck.nivel === 'aviso' ? 'text-[#8a5a00]' : 'text-cherry'}`}>
                            {pinCheck.nivel === 'ok'
                              ? <Check size={12} className="inline-block mr-1 -mt-0.5" aria-hidden="true" />
                              : <AlertTriangle size={12} className="inline-block mr-1 -mt-0.5" aria-hidden="true" />}{pinCheck.mensaje}
                          </p>
                        )}
                        <div className="flex gap-2">
                          <button onClick={savePin} disabled={!pinCheck?.coords || pinSaving}
                            className="btn-primary btn-sm flex-1 disabled:opacity-40">
                            {pinSaving ? 'Guardando…' : 'Guardar ubicación'}
                          </button>
                          <button onClick={() => { setPinOpen(false); setPinDraft('') }}
                            className="btn-secondary btn-sm px-3">Cancelar</button>
                        </div>
                      </div>
                    )}
                  </div>
                )}
                {!['delivered_paid','delivered_cash','pending_cuadre','completed'].includes(order.status) && (
                  <button
                    onClick={() => { setAddrDraft(localAddr); setEditingAddr(true); setAddrSuggestions([]); setAddrSearched(false) }}
                    className="btn-link text-xs"
                  >
                    <Pencil size={13} aria-hidden="true" /> Corregir dirección
                  </button>
                )}
              </>
            ) : (
              <div className="flex flex-col gap-2">
                <div className="flex gap-2">
                  <input
                    className="input-field flex-1 text-sm"
                    value={addrDraft}
                    onChange={e => { setAddrDraft(e.target.value); setAddrSuggestions([]); setAddrSearched(false) }}
                    placeholder="Calle, número, barrio…"
                    autoComplete="off"
                  />
                  <button
                    onClick={searchAddr}
                    disabled={searchingAddr || !addrDraft.trim()}
                    className="btn-secondary btn-sm px-3 flex-shrink-0"
                    title="Buscar dirección"
                  >
                    {searchingAddr ? <span className="font-body text-xs">…</span> : <Search size={15} />}
                  </button>
                </div>

                {addrSuggestions.length > 0 && (
                  <div className="flex flex-col gap-1">
                    <p className="font-body text-[10px] text-coal/40 uppercase tracking-wider">Sugerencias</p>
                    {addrSuggestions.map((s, i) => (
                      <button key={i} type="button"
                        onClick={() => { setAddrDraft(s); setAddrSuggestions([]) }}
                        className="text-left text-xs font-body text-cherry/80 bg-cherry/5 rounded-lg px-3 py-1.5 border border-cherry/10 hover:bg-cherry/10 transition-colors">
                        {s}
                      </button>
                    ))}
                  </div>
                )}

                {addrSearched && addrSuggestions.length === 0 && (
                  <p className="font-body text-xs text-coal/40">
                    Sin sugerencias — edita la dirección manualmente.
                  </p>
                )}

                <div className="flex gap-2 mt-1">
                  <button onClick={() => { setEditingAddr(false); setAddrSuggestions([]); setAddrSearched(false) }} className="btn-secondary flex-1 btn-sm">
                    Cancelar
                  </button>
                  <button onClick={saveAddr} disabled={savingAddr || !addrDraft.trim()} className="btn-primary flex-1 btn-sm">
                    {savingAddr ? 'Guardando…' : <><Check size={14} aria-hidden="true" /> Guardar</>}
                  </button>
                </div>
              </div>
            )}
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
              </div>
            )}
          </div>

          {/* Billete y cambio — bloque propio y destacado para que el
              domiciliario salga sabiendo cuánto cambio llevar. */}
          <CashChangeNotice order={order} />

          {/* Chat con el cliente (§8.3): solo ustedes dos lo ven */}
          <ChatDomiciliario order={order} rol="driver" />

          {/* Notas internas con la caja (no las ve el cliente) */}
          <div className="card border border-coal/10 flex flex-col gap-3">
            <div className="flex items-center gap-2">
              <MessageSquare size={15} className="text-tangelo" aria-hidden="true" />
              <p className="font-display text-sm tracking-wide text-coal">Notas con la caja</p>
              <span className="ml-auto font-body text-[10px] uppercase tracking-wider text-coal/45">El cliente no las ve</span>
            </div>

            {/* Existing comments */}
            {(order.comments?.length > 0) ? (
              <div className="flex flex-col gap-2">
                {[...order.comments].sort((a,b) => a.ts - b.ts).map((c, i) => (
                  <div key={i} className={`rounded-xl px-3 py-2 ${c.role === 'cashier' ? 'bg-tangelo/10 border border-tangelo/20' : 'bg-mint/10 border border-mint/20'}`}>
                    <p className={`font-body text-[10px] font-bold uppercase tracking-wider mb-0.5 ${c.role === 'cashier' ? 'text-tangelo' : 'text-mint'}`}>
                      {c.role === 'cashier' ? 'Cajero' : 'Tú'} · {c.name}
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
              <>
                <button onClick={prepare} disabled={loading} className="btn-mustard w-full btn-lg">
                  En preparación
                </button>
                <button onClick={transit} disabled={loading} className="btn-primary w-full btn-lg">
                  <Navigation size={20} /> Iniciar entrega
                </button>
              </>
            )}
            {order.status === 'preparing' && (
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
  const cashOrders   = orders.filter(o => o.cashOnDelivery || o.payment === 'Efectivo' || o.payment === 'Mixto')
  const totalFees    = orders.reduce((s, o) => s + (o.deliveryPrice || 0), 0)
  const totalCash    = cashOrders.reduce((s, o) => s + cashAmount(o), 0)

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

  const cashOrders = completedToday.filter(o => o.cashOnDelivery || o.payment === 'Efectivo' || o.payment === 'Mixto')
  const totalCash  = cashOrders.reduce((s, o) => s + cashAmount(o), 0)

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
      <div className="bg-cream w-full max-w-lg rounded-t-3xl sm:rounded-3xl max-h-[90dvh] overflow-y-auto scroll-custom animate-sheet-up sm:animate-scale-in">
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
            <p className="font-display text-base tracking-wide mb-1">Pedidos entregados hoy</p>
            <p className="font-body text-2xl font-bold text-coal">{completedToday.length} pedidos</p>
          </div>

          <div className="card border border-mustard/30">
            <p className="font-display text-base tracking-wide mb-2">Efectivo a entregar en caja</p>
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
            <p className="font-display text-base tracking-wide mb-3">Lo que te deben por domicilios</p>
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
    id: 'flujo', icon: ClipboardList, title: 'Flujo de trabajo',
    content: [
      { type: 'steps', items: [
        'Abre la app y selecciona tu sede (o "Ambas sedes" para recibir pedidos de Santa Lucía y Santa Teresita al mismo tiempo).',
        'Cuando el cajero te asigne un pedido, aparecerá en "Pedidos" con la campana en rojo. Ábrelo y toca "Aceptar pedido".',
        'Toca "Iniciar entrega" cuando salgas con el pedido hacia el cliente.',
        'Toca "Llegué al destino" cuando estés frente al cliente.',
        'Toca "Marcar como entregado" al entregar. Si fue en efectivo, el pedido queda en "Cuadre".',
        'Al terminar el turno, usa el botón "Cuadre" y muéstrale el resumen al cajero para entregar el efectivo.',
      ]},
    ],
  },
  {
    id: 'sedes', icon: MapPin, title: 'Trabajar en ambas sedes',
    content: [
      { type: 'p', text: 'Al entrar a la app puedes elegir "Ambas sedes" para recibir pedidos de Santa Lucía y Santa Teresita simultáneamente. No necesitas salir y cambiar de sede.' },
      { type: 'table', rows: [
        ['Ambas sedes',    'Ves pedidos de Santa Lucía y Santa Teresita a la vez'],
        ['Santa Lucía',    'Solo ves pedidos de la sede de Santa Lucía'],
        ['Santa Teresita', 'Solo ves pedidos de la sede de Santa Teresita'],
      ]},
      { type: 'tip', text: 'Para cambiar de sede sin cerrar sesión, toca el ícono de ubicación en la esquina superior derecha.' },
    ],
  },
  {
    id: 'estados', icon: Tag, title: 'Estados del pedido',
    content: [
      { type: 'table', rows: [
        ['ASIGNADO',   'El cajero te asignó el pedido — acéptalo pronto'],
        ['ACEPTADO',   'Confirmaste que vas a recoger y entregar'],
        ['EN CAMINO',  'Iniciaste la entrega — el cliente puede ver tu ruta'],
        ['LLEGÓ',      'Llegaste donde el cliente'],
        ['CUADRE',     'Entregado en efectivo — pendiente cuadre con cajero'],
        ['COMPLETADO', 'Pedido cerrado y cuadrado'],
      ]},
    ],
  },
  {
    id: 'roles', icon: Bike, title: 'Cambiar de rol',
    content: [
      { type: 'p', text: 'Si tienes más de un rol (por ejemplo, domiciliario y cajero), puedes cambiar entre ellos sin cerrar sesión usando el selector de rol en la barra superior.' },
      { type: 'steps', items: [
        'Toca el ícono con la flecha en la esquina superior derecha.',
        'Selecciona el rol al que quieres cambiar: Cajero, Cliente, etc.',
        'La app cambia de vista inmediatamente sin necesidad de cerrar sesión.',
      ]},
      { type: 'tip', text: 'Para volver a tu vista de domiciliario, toca el mismo selector y elige "Domiciliario".' },
    ],
  },
  {
    id: 'navegacion', icon: Route, title: 'Navegación al cliente',
    content: [
      { type: 'p', text: 'Dentro del detalle de cada pedido encontrarás dos botones de navegación:' },
      { type: 'table', rows: [
        ['Google Maps', 'Abre Google Maps con la dirección del cliente lista para navegar'],
        ['Waze',        'Abre Waze con la dirección del cliente lista para navegar'],
      ]},
      { type: 'tip', text: 'Tu ubicación GPS se comparte automáticamente con el cliente cuando el pedido está "En camino". Activa el GPS compartido en la barra superior para que el cajero también te ubique aunque no tengas pedido activo.' },
    ],
  },
  {
    id: 'efectivo', icon: Banknote, title: 'Pedidos en efectivo',
    content: [
      { type: 'p', text: 'Antes de llegar donde el cliente, abre el detalle del pedido y revisa la sección "Pago":' },
      { type: 'table', rows: [
        ['Paga exacto',    'El cliente tiene el dinero exacto — no necesitas traer cambio'],
        ['Necesita cambio','El cajero indica cuánto paga el cliente y cuánto debes devolver'],
      ]},
      { type: 'tip', text: 'Al marcar como entregado un pedido en efectivo, queda en estado "Cuadre" hasta que lo cuadres con el cajero.' },
    ],
  },
  {
    id: 'cuadre', icon: Calculator, title: 'Cuadre de turno',
    content: [
      { type: 'p', text: 'Al terminar el turno, toca el botón "Cuadre" en la barra superior para ver el resumen del día:' },
      { type: 'table', rows: [
        ['Efectivo a entregar', 'Total en efectivo que recibiste de los clientes y debes entregar al cajero'],
        ['Lo que te deben',     'Total de domicilios ganados que el cajero te debe pagar a ti'],
      ]},
      { type: 'tip', text: 'Muéstrale la pantalla de cuadre al cajero para hacer el recuento juntos y cerrar el turno.' },
    ],
  },
  {
    id: 'gps', icon: Radio, title: 'GPS compartido',
    content: [
      { type: 'p', text: 'La app tiene dos modos de compartir tu ubicación:' },
      { type: 'table', rows: [
        ['Automático',    'Cuando tienes un pedido "En camino", tu GPS se comparte automáticamente con el cliente'],
        ['GPS manual ', 'Activa el botón GPS en la barra superior para que el cajero te ubique en todo momento, aunque no tengas pedido activo'],
      ]},
      { type: 'tip', text: 'Desactiva el GPS manual cuando termines el turno para ahorrar batería.' },
    ],
  },
  {
    id: 'comentarios', icon: MessageSquare, title: 'Comentarios en pedidos',
    content: [
      { type: 'p', text: 'Dentro del detalle de cada pedido puedes dejar comentarios visibles para el cajero: timbre roto, cliente no estaba, dirección incorrecta, etc.' },
      { type: 'tip', text: 'El cajero también puede dejarte notas en el pedido. Revisa la sección "Nota del cajero" antes de salir a entregar.' },
    ],
  },
  {
    id: 'historial', icon: Calendar, title: 'Historial de entregas',
    content: [
      { type: 'p', text: 'En la pestaña "Entregados" puedes ver todos tus pedidos del día. Usa el selector de fecha para consultar días anteriores.' },
      { type: 'tip', text: 'El historial muestra solo tus pedidos entregados, no los de otros domiciliarios.' },
    ],
  },
]

function DriverManualSection({ section }) {
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
                    <span className="font-body text-xs font-semibold text-coal w-32 flex-shrink-0">{col1}</span>
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

// ─── Sugerencia de ruta (nearest-neighbor) ─────────────────────────────────────
function RouteSuggestionModal({ orders, geoCache, clusters, sede, onClose, onOrderClick }) {
  // Punto de inicio: si el domiciliario eligió una sede concreta, partimos de ella.
  // Si eligió "Ambas sedes", agrupamos por sede y empezamos por la sede con más pedidos.
  // El pin exacto del cliente manda; si no hay, lo que encontró el buscador.
  const ordersWithGeo = orders
    .map(o => ({ ...o, geo: geoDelPedido(o, geoCache) }))
    .filter(o => o.geo)

  const ordersSinGeo = orders.filter(o => !geoDelPedido(o, geoCache))

  // Determinar coords de inicio
  let startCoords = null
  let startLabel  = ''
  if (sede?.id && sede.id !== 'all' && SEDES[sede.id]) {
    startCoords = SEDES[sede.id].coords
    startLabel  = SEDES[sede.id].name
  } else if (ordersWithGeo.length > 0) {
    // Ambas sedes → usar la sede del primer pedido (por orden de llegada)
    const firstSedeId = ordersWithGeo[0].sedeId
    if (firstSedeId && SEDES[firstSedeId]) {
      startCoords = SEDES[firstSedeId].coords
      startLabel  = SEDES[firstSedeId].name
    }
  }

  // Nearest-neighbor desde startCoords (o desde el primer pedido si no hay sede).
  // Es el respaldo: si Google da el orden óptimo por calle, se usa ese.
  const rutaCercania = []
  const remaining = [...ordersWithGeo]
  let current = startCoords
  while (remaining.length > 0) {
    if (!current) {
      rutaCercania.push(remaining.shift())
      current = rutaCercania[rutaCercania.length - 1].geo
      continue
    }
    let bestIdx = 0
    let bestDist = haversineKm(current.lat, current.lng, remaining[0].geo.lat, remaining[0].geo.lng)
    for (let k = 1; k < remaining.length; k++) {
      const d = haversineKm(current.lat, current.lng, remaining[k].geo.lat, remaining[k].geo.lng)
      if (d < bestDist) { bestDist = d; bestIdx = k }
    }
    rutaCercania.push({ ...remaining[bestIdx], distFromPrev: bestDist })
    current = remaining[bestIdx].geo
    remaining.splice(bestIdx, 1)
  }

  // Orden óptimo por calle (Google): sale de la sede, entrega todo y vuelve.
  // Se pide una vez por grupo de pedidos; el backend lo guarda 10 min.
  const claveOpt = startCoords && ordersWithGeo.length >= 2 && ordersWithGeo.length <= 10
    ? ordersWithGeo.map(o => `${o.id}@${o.geo.lat},${o.geo.lng}`).sort().join('|') + `|${startCoords.lat},${startCoords.lng}`
    : null
  const [opt, setOpt] = useState({ clave: null, r: null })
  useEffect(() => {
    if (!claveOpt) return
    let vigente = true
    optimizarRuta(startCoords, ordersWithGeo.map(o => ({ id: o.id, lat: o.geo.lat, lng: o.geo.lng })))
      .then(r => { if (vigente) setOpt({ clave: claveOpt, r }) })
    return () => { vigente = false }
  }, [claveOpt]) // eslint-disable-line react-hooks/exhaustive-deps
  const optimizando = !!claveOpt && opt.clave !== claveOpt
  const optima = claveOpt && opt.clave === claveOpt ? opt.r : null
  const porId = Object.fromEntries(ordersWithGeo.map(o => [o.id, o]))
  const route = optima && optima.orden.every(id => porId[id])
    ? optima.orden.map((id, i) => ({
        ...porId[id], distFromPrev: optima.tramos[i]?.km ?? 0, minFromPrev: optima.tramos[i]?.min, porCalle: true,
      }))
    : rutaCercania
  const regreso = optima?.tramos?.[optima.tramos.length - 1]

  // Mapa: orderId → cluster index (para mostrar etiqueta de zona)
  const orderClusterTag = {}
  clusters.forEach((c, i) => {
    c.forEach(o => { orderClusterTag[o.id] = i + 1 })
  })

  const openMultiRoute = () => {
    if (route.length === 0) return
    const origin = startCoords
      ? encodeURIComponent((sede?.id && sede.id !== 'all' && SEDES[sede.id]?.mapsAddress) || `${startCoords.lat},${startCoords.lng}`)
      : encodeURIComponent(route[0].fullAddress + ', Medellín, Colombia')
    const destOrders = startCoords ? route : route.slice(1)
    if (destOrders.length === 0) return
    // Con pin exacto se navega a las coordenadas; el texto solo como respaldo
    // (Google Maps también se confunde con el "#43-7").
    const destino = o => encodeURIComponent(o.geo?.exacto
      ? `${o.geo.lat},${o.geo.lng}`
      : o.fullAddress + ', Medellín, Colombia')
    const last = destOrders[destOrders.length - 1]
    const destination = destino(last)
    const waypoints = destOrders.slice(0, -1).map(destino).join('|')
    const wpParam = waypoints ? `&waypoints=${waypoints}` : ''
    window.open(`https://www.google.com/maps/dir/?api=1&origin=${origin}&destination=${destination}${wpParam}&travelmode=driving`, '_blank')
  }

  const totalKm = route.reduce((s, r, i) => {
    if (i === 0 && startCoords) return s + haversineKm(startCoords.lat, startCoords.lng, r.geo.lat, r.geo.lng)
    if (i === 0) return 0
    return s + r.distFromPrev
  }, 0)

  return (
    <div className="fixed inset-0 z-[110] flex items-end sm:items-center justify-center bg-coal/50 backdrop-blur-sm animate-fade-in"
      onClick={e => { if (e.target === e.currentTarget) onClose() }}>
      <div className="bg-cream w-full max-w-lg rounded-t-3xl sm:rounded-3xl max-h-[92dvh] overflow-y-auto scroll-custom animate-sheet-up sm:animate-scale-in">
        <div className="sticky top-0 bg-gradient-to-r from-mint to-tangelo px-6 py-5 rounded-t-3xl flex items-center justify-between">
          <div className="min-w-0">
            <p className="font-display text-2xl text-cream tracking-wide flex items-center gap-2">
              <Route size={22} /> Ruta sugerida
            </p>
            <p className="font-body text-xs text-cream/80">
              {route.length} pedido{route.length !== 1 ? 's' : ''} · {optima
                ? <>~{optima.km.toFixed(1)} km · ~{optima.min} min por calle, con regreso</>
                : <>~{totalKm.toFixed(1)} km en total{optimizando ? ' · buscando la mejor ruta…' : ''}</>}
            </p>
          </div>
          <button onClick={onClose} className="text-cream/80 hover:text-cream"><X size={22} /></button>
        </div>

        <div className="p-5 flex flex-col gap-4">
          {/* Banner de pedidos sin geocodificar */}
          {ordersSinGeo.length > 0 && (
            <div className="bg-mustard/10 border border-mustard/30 rounded-xl px-3 py-2.5 flex items-start gap-2">
              <Search size={14} className="text-mustard flex-shrink-0 mt-0.5" />
              <div>
                <p className="font-body text-xs font-semibold text-coal">
                  Calculando {ordersSinGeo.length} ubicación{ordersSinGeo.length !== 1 ? 'es' : ''}…
                </p>
                <p className="font-body text-[11px] text-coal/60">
                  Espera unos segundos y vuelve a abrir esta vista para incluir esos pedidos.
                </p>
              </div>
            </div>
          )}

          {/* Banner de clusters detectados */}
          {clusters.length > 0 && (
            <div className="bg-mint/10 border border-mint/30 rounded-xl px-3 py-2.5">
              <p className="font-body text-xs font-bold text-mint uppercase tracking-wider mb-1.5">
                <Target size={14} className="inline-block mr-1.5 -mt-0.5" aria-hidden="true" />Pedidos cercanos detectados
              </p>
              <div className="flex flex-col gap-0.5">
                {clusters.map((c, i) => (
                  <p key={i} className="font-body text-xs text-coal">
                    <span className="font-bold">Zona {i + 1}:</span> {c.length} pedido{c.length !== 1 ? 's' : ''} a ≤ 400 m entre sí
                    {' '}({c.map(o => o.orderNumber ? `#${o.orderNumber}` : o.name?.split(' ')[0]).join(', ')})
                  </p>
                ))}
              </div>
            </div>
          )}

          {/* Lista ordenada */}
          {startLabel && (
            <div className="flex items-center gap-2 text-coal/60 font-body text-xs">
              <MapPin size={14} className="text-cherry" />
              <span>Saliendo desde <strong>{startLabel}</strong></span>
            </div>
          )}

          {route.length === 0 ? (
            <p className="font-body text-sm text-coal/60 text-center py-6">
              Aún no hay ubicaciones calculadas para tus pedidos.
            </p>
          ) : (
            <div className="flex flex-col gap-2">
              {route.map((o, i) => {
                const tag = orderClusterTag[o.id]
                return (
                  <div key={o.id}>
                    <button
                      onClick={() => onOrderClick && onOrderClick(o)}
                      className="w-full text-left bg-smoked/40 hover:bg-smoked/70 rounded-xl px-3 py-2.5 flex items-center gap-3 transition-colors"
                    >
                      <div className="w-7 h-7 rounded-full bg-cherry text-cream flex items-center justify-center font-display text-sm flex-shrink-0">
                        {i + 1}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-1.5 mb-0.5">
                          {o.orderNumber && (
                            <span className="font-display text-sm text-cherry">#{o.orderNumber}</span>
                          )}
                          <span className="font-body font-semibold text-sm text-coal truncate">{o.name}</span>
                          {tag && (
                            <span className="text-[9px] font-bold uppercase tracking-wider bg-mint/20 text-mint px-1.5 py-0.5 rounded-full">
                              Zona {tag}
                            </span>
                          )}
                        </div>
                        <p className="font-body text-xs text-coal/60 truncate">{o.fullAddress}</p>
                      </div>
                      <span className="font-body text-[11px] text-coal/40 font-semibold whitespace-nowrap">
                        {o.porCalle
                          ? `${o.distFromPrev.toFixed(1)} km${o.minFromPrev ? ` · ${o.minFromPrev} min` : ''}`
                          : i === 0 && startCoords
                          ? `${haversineKm(startCoords.lat, startCoords.lng, o.geo.lat, o.geo.lng).toFixed(2)} km`
                          : i === 0
                            ? '—'
                            : `${o.distFromPrev.toFixed(2)} km`}
                      </span>
                    </button>
                    {i < route.length - 1 && (
                      <div className="flex items-center gap-1 pl-10 py-0.5 text-coal/30">
                        <ChevronDown size={12} />
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          )}

          {regreso && route[0]?.porCalle && (
            <p className="font-body text-[11px] text-coal/50 pl-10">
              Regreso a {startLabel || 'la sede'}: {regreso.km.toFixed(1)} km{regreso.min ? ` · ${regreso.min} min` : ''}
            </p>
          )}
          {optima && (
            <p className="font-body text-[11px] text-mint font-semibold text-center">
              <Check size={12} className="inline-block mr-1 -mt-0.5" aria-hidden="true" />Orden calculado por calle con Google Maps
            </p>
          )}

          {/* Acciones */}
          {route.length > 0 && (
            <button onClick={openMultiRoute} className="btn-primary w-full">
              <Navigation size={16} /> Abrir ruta completa en Google Maps
            </button>
          )}
          <p className="font-body text-[11px] text-coal/40 text-center">
            Sugerencia automática. Ajusta tu ruta según tráfico real y prioridades.
          </p>
        </div>
      </div>
    </div>
  )
}
