import { useState, useEffect, useRef, useMemo } from 'react'
import {
  collection, query, where, getDocs,
  doc, updateDoc, setDoc, serverTimestamp, arrayUnion
} from 'firebase/firestore'
import { db } from '../../services/firebase'
import { useAuth } from '../../contexts/AuthContext'
import Logo from '../common/Logo'
import { format } from 'date-fns'
import { es } from 'date-fns/locale'
import {
  MapPin, Phone, ShoppingBag,
  CheckCircle, Bell,
  Calculator, X, MessageSquare, BookOpen,
  Search, ChevronDown, HelpCircle,
  Send, Radio, Route, Target, Gift, Check, Pencil, AlertTriangle, ChevronLeft,
  ClipboardList, Tag, Banknote, Calendar, Lightbulb, Bike, ChevronRight
} from 'lucide-react'
import { SEDES } from '../../services/roles'
import { cashAmount } from '../../utils/payments'
import { revisarUbicacion, linkPedirUbicacion } from '../../utils/geoLink'
import { sonar, sonidoDeEstado } from '../../utils/sonidos'
import { pedidosCerca, geoDelPedido } from '../../utils/cercania'
import { optimizarRuta, ubicarDireccion } from '../../services/recorrido'
import TurnoDomiciliario from './TurnoDomiciliario'
import CampanaAvisos from '../common/CampanaAvisos'
import ChatDomiciliario from '../common/ChatDomiciliario'
import CuadresEfectivo from '../common/CuadresEfectivo'
import { transferenciaPendiente } from '../../utils/cuadres'
import { LogoWhatsApp, LogoGoogleMaps, LogoWaze } from '../common/LogosApps'
import ContactosParaOtro from '../common/ContactosParaOtro'
import { IndicacionesBreves } from '../common/IncidenciaReparto'
import { EN_RUTA, ENTREGADOS, esEfectivo, ordenarRuta, pasoReparto, etiquetaReparto, fmt, nombreDe, ultimoDeCaja, puedeReportar, grupoReparto } from '../../utils/reparto'
import { AntesDeSalir, EnReparto } from './AhoraDomiciliario'
import useAccionesReparto from './useAccionesReparto'
import { HojaNoEntrega, EstadoNoEntrega } from './NoEntrega'
import {
  NavDomiciliario, HojaMas, VistaCaja, TarjetaCobro, BotonesNavegar,
} from './RutaDomiciliario'

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

const isToday = ts => {
  if (!ts?.toDate) return false
  return ts.toDate().toDateString() === new Date().toDateString()
}


// Colores del diseño elegido en la app (26 oct 2026): «F1 · Día crema» de día y
// «F · Noche» de noche, según el modo del celular. Las pantallas nuevas los
// leen como var(--d-*); lo demás (detalle, «Más») usa el modo oscuro de la web.
const COLORES_DIA = {
  '--d-fondo': '#FDF6ED', '--d-texto': '#262626', '--d-fuerte': '#262626', '--d-sec': '#6B6560',
  '--d-tarjeta': '#FFFFFF', '--d-boton': '#262626', '--d-borde': '#D9D3C9', '--d-ok': '#13746A', '--d-warn': '#925A00',
  '--d-cta': '#EA3329', '--d-cta-texto': '#FFFFFF', '--d-sombra': '0 6px 18px rgba(38,38,38,0.08)',
}
const COLORES_NOCHE = {
  '--d-fondo': '#141414', '--d-texto': '#F4E7D0', '--d-fuerte': '#FFFFFF', '--d-sec': '#BFB6A8',
  '--d-tarjeta': '#232323', '--d-boton': '#333131', '--d-borde': '#4A4746', '--d-ok': '#49AA9F', '--d-warn': '#E88F00',
  '--d-cta': '#ED5B3E', '--d-cta-texto': '#1A1A1A', '--d-sombra': 'none',
}

/** ¿El celular está en modo oscuro? Mientras el panel está abierto pone <html class="oscuro">. */
function useNocheDelCelular() {
  const consulta = typeof window !== 'undefined' && window.matchMedia ? window.matchMedia('(prefers-color-scheme: dark)') : null
  const [noche, setNoche] = useState(() => !!consulta?.matches)
  useEffect(() => {
    if (!consulta) return undefined
    const cambio = (e) => setNoche(e.matches)
    consulta.addEventListener?.('change', cambio)
    return () => consulta.removeEventListener?.('change', cambio)
  }, []) // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    const raiz = document.documentElement
    raiz.classList.toggle('oscuro', noche)
    return () => raiz.classList.remove('oscuro')
  }, [noche])
  return noche
}

export default function DeliveryPanel() {
  const { user, sede, logout, selectSede, allRoles } = useAuth()
  const [orders,          setOrders]         = useState([])
  const [vista,           setVista]          = useState('ruta')
  const [pestana,         setPestana]        = useState(null) // null = la elige sola
  const noche = useNocheDelCelular()
  // { id, notas }: el detalle lee el pedido vivo de `orders` (se recarga cada 5 s).
  const [selected,        setSelected]       = useState(null)
  const [notifCount,      setNotifCount]     = useState(0)
  const [showCuadre,      setShowCuadre]     = useState(false)
  const [showManual,      setShowManual]     = useState(false)
  const [mas,             setMas]            = useState(false)
  const [ordenRuta,       setOrdenRuta]      = useState([])
  // Hasta qué hora vio las notas de la caja de cada pedido { id: ms }.
  const [vistos,          setVistos]         = useState(() => {
    try { return JSON.parse(localStorage.getItem('ds_vistos_caja') || '{}') } catch { return {} }
  })
  const recargarRef      = useRef(null)
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
            setVista('ruta')
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

    recargarRef.current = fetchOrders
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

  const recargar = () => recargarRef.current?.()
  const marcarVisto = (o) => setVistos(prev => {
    const ultimo = ultimoDeCaja(o)
    if (!ultimo || (prev[o.id] || 0) >= ultimo) return prev
    // Solo los de los últimos 3 días, para que no crezca sin fin.
    const limite = Date.now() - 3 * 864e5
    const next = Object.fromEntries(Object.entries({ ...prev, [o.id]: ultimo }).filter(([, ts]) => ts > limite))
    try { localStorage.setItem('ds_vistos_caja', JSON.stringify(next)) } catch { /* sin almacenamiento */ }
    return next
  })
  const abrir = (o, { notas = false } = {}) => { setSelected({ id: o.id, notas, foto: o }); if (notas) marcarVisto(o) }
  const selectedOrder = selected ? (orders.find(o => o.id === selected.id) || selected.foto) : null

  const pendingOrders   = orders.filter(o => o.status === 'assigned' && isToday(o.createdAt))
  const activeOrders    = orders.filter(o => EN_RUTA.includes(o.status))
  const completedOrders = orders.filter(o => {
    if (!ENTREGADOS.includes(o.status)) return false
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

  const ruta = ordenarRuta([...pendingOrders, ...activeOrders], ordenRuta)
  // Diseño elegido en la app (26 oct 2026): «Por recoger» y «En reparto». Sin
  // elegir, abre en «En reparto» si lleva pedidos en la calle.
  const porRecoger = ruta.filter(o => grupoReparto(o) === 'recoger')
  const enReparto  = ruta.filter(o => grupoReparto(o) === 'reparto')
  const pestanaRuta = pestana ?? (enReparto.length ? 'reparto' : 'recoger')
  // Pedidos del día con notas (los activos y los entregados de hoy).
  const pedidosConCaja = orders.filter(o => EN_RUTA.includes(o.status) || o.status === 'assigned' ||
    (ENTREGADOS.includes(o.status) && isToday(o.createdAt)))
  const sinLeerCaja = pedidosConCaja.filter(o => ultimoDeCaja(o) > (vistos[o.id] || 0)).length
  const nombre = user?.displayName?.split(' ')[0] || user?.email?.split('@')[0] || 'Domiciliario'
  const titulo = vista === 'entregados' ? 'Entregados' : vista === 'caja' ? 'Caja' : 'Mi ruta'

  return (
    <div className="min-h-screen-safe flex flex-col bg-[var(--d-fondo)] text-[var(--d-texto)]"
      style={{ ...(noche ? COLORES_NOCHE : COLORES_DIA), paddingBottom: 'calc(84px + env(safe-area-inset-bottom))' }}>
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
                <button onClick={() => { abrir(avisoCerca.order); setAvisoCerca(null) }}
                  className="btn-primary btn-sm flex-1">Ver pedido</button>
                <button onClick={() => setAvisoCerca(null)} className="btn-secondary btn-sm">Cerrar</button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* En la mano, en la calle: arriba solo el GPS y los avisos. Lo demás
          vive en «Más», en la barra de abajo. */}
      <header className="px-4 pb-3 flex flex-col gap-2" style={{ paddingTop: 'max(env(safe-area-inset-top), 12px)' }}>
        <div className="flex items-center gap-2.5">
          <Logo variant={noche ? 'dark' : 'light'} size="md" />
          <p className="flex-1 min-w-0 text-sm font-bold text-[var(--d-sec)] truncate">
            Hola, {nombre}{sede ? ` · ${sede.id === 'all' ? 'Ambas sedes' : sede.name}` : ''}
          </p>
          <CampanaAvisos destinos={[user?.email?.toLowerCase()]} oscuro={noche}
            onAbrirPedido={(id) => { const o = orders.find(x => x.id === id); if (o) abrir(o) }} />
        </div>
        {vista !== 'ruta' && (
          <h1 className="font-display text-[32px] tracking-wide leading-none normal-case text-[var(--d-fuerte)]">{titulo}</h1>
        )}
      </header>

      {vista === 'ruta' && (
        <>
          <TurnoDomiciliario email={user?.email} pendientes={activeOrders.length + pendingOrders.length}
            enReparto={enReparto.length} compartiendo={locationSharing} onUbicacion={toggleLocationSharing}
            sinUbicacion={typeof navigator !== 'undefined' && !navigator.geolocation}
            onDatos={(d) => setOrdenRuta(Array.isArray(d.ordenRuta) ? d.ordenRuta : [])}
            onEstado={(estado) => {
              // En turno se comparte la ubicación con la caja; al terminar sin pedidos, se apaga.
              if (estado === 'activo' && !locationSharing) toggleLocationSharing()
              if (estado === 'fuera' && locationSharing && activeOrders.length === 0) toggleLocationSharing()
            }} />

          {notifCount > 0 && (
            <p className="mx-4 mt-3 bg-[#C8261D] text-white rounded-2xl px-4 py-3 flex items-center gap-3 font-semibold text-sm">
              <Bell size={18} className="flex-shrink-0" aria-hidden="true" />
              {notifCount === 1 ? '¡Tienes 1 pedido por aceptar!' : `¡Tienes ${notifCount} pedidos por aceptar!`}
            </p>
          )}

          <div role="tablist" aria-label="Mis pedidos" className="mx-4 mt-3 grid grid-cols-2 gap-1 rounded-2xl p-1 bg-[var(--d-tarjeta)] shadow-[var(--d-sombra)]">
            {[['recoger', 'Por recoger', porRecoger.length], ['reparto', 'En reparto', enReparto.length]].map(([id, texto, n]) => {
              const activa = pestanaRuta === id
              return (
                <button key={id} role="tab" aria-selected={activa} onClick={() => setPestana(id)}
                  className={`min-h-[44px] rounded-xl text-[15px] font-bold flex items-center justify-center gap-1.5 ${
                    activa ? 'bg-[var(--d-boton)] text-white' : 'text-[var(--d-sec)]'}`}>
                  {texto}
                  {n > 0 && <span className={`min-w-[20px] h-5 px-1 rounded-full text-[11px] flex items-center justify-center ${
                    activa ? 'bg-white/20' : id === 'recoger' ? 'bg-[var(--d-cta)] text-[var(--d-cta-texto)]' : 'bg-[var(--d-borde)]'}`}>{n}</span>}
                </button>
              )
            })}
          </div>

          {/* Pedidos cercanos y orden sugerido (con 2 o más pedidos) */}
          {pestanaRuta === 'recoger' && routableOrders.length >= 2 && (
            <button onClick={() => setShowRoute(true)}
              className="mx-4 mt-2.5 rounded-2xl px-4 py-2.5 flex items-center gap-3 text-left border-[1.5px] border-[var(--d-borde)]">
              {nearbyClusters.length > 0
                ? <Target size={18} className="text-[var(--d-ok)] flex-shrink-0" aria-hidden="true" />
                : <Route size={18} className="text-[var(--d-sec)] flex-shrink-0" aria-hidden="true" />}
              <span className="flex-1 min-w-0 text-sm font-bold leading-tight">
                {nearbyClusters.length === 0 ? `Sugerir orden de entrega (${routableOrders.length} pedidos)`
                  : totalNearby === 2 ? '¡2 pedidos a menos de 400 m!'
                  : `¡${totalNearby} pedidos en ${nearbyClusters.length === 1 ? 'la misma zona' : `${nearbyClusters.length} zonas`} (≤ 400 m)!`}
              </span>
              <ChevronRight size={18} className="text-[var(--d-sec)] flex-shrink-0" aria-hidden="true" />
            </button>
          )}

          {pestanaRuta === 'recoger' && porRecoger.length > 0 && (
            <AntesDeSalir pedidos={porRecoger} enReparto={enReparto.length} sede={sede} geoCache={geoCache}
              onAbrir={(o) => abrir(o)} alSalir={() => { recargar(); setPestana('reparto') }} />
          )}
          {pestanaRuta === 'reparto' && enReparto.length > 0 && (
            <EnReparto key={enReparto[0].id} pedidos={enReparto} porRecoger={porRecoger.length} geoCache={geoCache}
              onAbrir={(o, opc) => abrir(o, opc)} alListo={recargar} irARecoger={() => setPestana('recoger')} />
          )}
          {(pestanaRuta === 'recoger' ? porRecoger : enReparto).length === 0 && (
            <div className="flex flex-col items-center justify-center gap-3 py-14 px-6 text-center">
              <Route size={32} className="text-[var(--d-sec)] opacity-50" aria-hidden="true" />
              <p className="text-[var(--d-sec)]">
                {pestanaRuta === 'recoger' ? 'No hay domicilios esperándote en la sede.' : 'No llevas pedidos en la calle.'}
              </p>
            </div>
          )}
        </>
      )}

      {vista === 'entregados' && (
        <>
          <DriverEntregadosSummary orders={completedOrders} onCuadre={() => setShowCuadre(true)} />
          <div className="mx-4 mt-4 flex items-center gap-2">
            <Calendar size={16} className="text-coal/50 flex-shrink-0" aria-hidden="true" />
            <input type="date" aria-label="Ver otro día" className="input-field py-2 text-sm flex-1"
              value={historyDate} onChange={e => setHistoryDate(e.target.value)} max={format(new Date(), 'yyyy-MM-dd')} />
            {historyDate && (
              <button onClick={() => setHistoryDate('')} className="font-body text-sm font-semibold text-[#C8261D] whitespace-nowrap px-2 min-h-[44px]">Ver hoy</button>
            )}
          </div>
          {completedOrders.length === 0 ? (
            <div className="flex flex-col items-center justify-center gap-3 py-14">
              <CheckCircle size={32} className="text-coal/25" aria-hidden="true" />
              <p className="font-body text-coal/50 text-center">{historyDate ? 'No hay entregados para esa fecha' : 'No hay entregados hoy'}</p>
            </div>
          ) : (
            <div className="mx-4 mt-3 bg-white rounded-[18px] border border-coal/10 overflow-hidden divide-y divide-coal/[0.08]">
              {completedOrders.map(o => (
                <button key={o.id} onClick={() => abrir(o)} className="w-full text-left flex items-center gap-2.5 px-4 py-3 min-h-[52px]">
                  <Check size={18} className="text-[#12766B] flex-shrink-0" aria-hidden="true" />
                  {o.orderNumber && <span className="font-display text-lg leading-none text-[#C8261D]">#{o.orderNumber}</span>}
                  <span className="flex-1 min-w-0 font-body text-sm font-semibold truncate">{nombreDe(o)}</span>
                  <span className="font-body text-xs text-coal/55">{o.deliveredAt?.toDate ? format(o.deliveredAt.toDate(), 'h:mm a', { locale: es }) : ''}</span>
                  <span className="font-body text-sm font-bold min-w-[72px] text-right">{fmt(o.totalPrice)}</span>
                </button>
              ))}
            </div>
          )}
        </>
      )}

      {vista === 'caja' && <VistaCaja pedidos={pedidosConCaja} vistos={vistos} onAbrir={(o) => abrir(o, { notas: true })} />}

      <NavDomiciliario vista={vista} cuentas={{ ruta: ruta.length, caja: sinLeerCaja }}
        setVista={(v) => (v === 'mas' ? setMas(true) : setVista(v))} />

      {mas && (
        <HojaMas user={user} sede={sede} allRoles={allRoles} logout={logout} onCerrar={() => setMas(false)}
          onManual={() => setShowManual(true)} onCuadre={() => setShowCuadre(true)}
          onCambiarSede={() => selectSede(null)} onVolverSede={(id) => setShowReturnNav(id)} />
      )}

      {selectedOrder && (
        <DriverOrderDetail key={selectedOrder.id} order={selectedOrder} abrirNotas={selected?.notas}
          parada={ruta.findIndex(o => o.id === selectedOrder.id) + 1} totalParadas={ruta.length}
          siguienteParada={ruta.find(o => o.id !== selectedOrder.id)}
          onSiguiente={(o) => abrir(o)} alListo={recargar}
          onVerNotas={() => marcarVisto(selectedOrder)}
          notasSinLeer={(selectedOrder.comments || []).filter(c => c.role === 'cashier' && (c.ts || 0) > (vistos[selectedOrder.id] || 0)).length}
          onClose={() => setSelected(null)} />
      )}

      {showCuadre && (
        <DriverCuadreTurnoModal orders={orders} sede={sede} user={user} onClose={() => setShowCuadre(false)} />
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
            <span className="inline-flex rounded-md bg-white p-0.5"><LogoGoogleMaps size={18} /></span> Abrir en Google Maps
          </button>
          <button onClick={openWaze} className="btn-secondary w-full btn-lg">
            <LogoWaze size={20} /> Abrir en Waze
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

// ─── Detalle del pedido (rediseño del 25 oct 2026) ────────────────────────────
// Pantalla completa: barra de pasos, cliente, dirección con Maps/Waze, cobro en
// grande, lo que lleva, chats y abajo un solo botón fijo para avanzar.
const PASOS_REPARTO = ['Recogido', 'En camino', 'Llegué', 'Entregado']
const horaCorta = t => (t?.toDate ? format(t.toDate(), 'h:mm a', { locale: es }) : '')

export function DriverOrderDetail({ order, onClose, abrirNotas = false, parada = 0, totalParadas = 0, siguienteParada, onSiguiente, alListo, onVerNotas, notasSinLeer = 0 }) {
  const { user } = useAuth()
  const [commentText,    setCommentText]   = useState('')
  const [sendingComment, setSendingComment] = useState(false)
  const [verPedido,      setVerPedido]     = useState(false)
  const [verNotas,       setVerNotas]      = useState(abrirNotas)
  const [noEntrega,      setNoEntrega]     = useState(false)
  const notasRef = useRef(null)

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


  // ── Pedir la ubicación por WhatsApp ────────────────────────────────────────
  // Si lo recibe otra persona, la ubicación se le pide a ella (§7.3).
  const waPedirUbicacion = linkPedirUbicacion({
    telefono:     order.destinatario?.telefono || order.phone,
    cliente:      order.destinatario?.nombre || order.name || order.clientName,
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

  const { loading, siguiente, markDelivered } = useAccionesReparto(order, { navCoords, alListo })
  const paso = pasoReparto(order)
  const entregado = paso === 3
  const etiqueta = etiquetaReparto(order)
  const detalleEtapa = order.status === 'in_transit' && order.inTransitAt ? `${etiqueta.texto} · salió ${horaCorta(order.inTransitAt)}`
    : entregado && order.deliveredAt ? `Entregado ${horaCorta(order.deliveredAt)}` : etiqueta.texto
  const notasDeCaja = (order.comments || []).filter(c => c.role === 'cashier')
  const ultimaCaja = [...notasDeCaja].sort((a, b) => (b.ts || 0) - (a.ts || 0))[0]
  const abrirLasNotas = () => {
    setVerNotas(true); onVerNotas?.()
    setTimeout(() => notasRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 50)
  }
  useEffect(() => {
    if (abrirNotas) setTimeout(() => notasRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 80)
  }, []) // eslint-disable-line react-hooks/exhaustive-deps
  // Mientras tiene las notas abiertas, lo que llegue ya lo vio.
  useEffect(() => { if (verNotas) onVerNotas?.() }, [verNotas, order.comments?.length]) // eslint-disable-line react-hooks/exhaustive-deps

  const waPhone = (() => {
    const digits = (order.phone || '').replace(/\D/g, '')
    return digits.length >= 10 ? `57${digits.slice(-10)}` : digits
  })()
  const tarjeta = 'mx-4 bg-white border border-coal/10 rounded-[20px] p-3.5'
  const botonGrande = 'w-full min-h-[58px] rounded-[18px] font-body text-[17px] font-bold text-white flex items-center justify-center gap-2 disabled:opacity-50 shadow-[0_14px_24px_-16px_rgba(38,38,38,0.7)]'
  const enExcepcion = ['no_entregado', 'regreso_declarado'].includes(order.excepcion) || (order.status === 'arrived' && etiqueta.tono === 'alerta')

  return (
    // Por encima de la barra de abajo (z-60). El botón fijo va fuera de la parte
    // que se desplaza: la animación de entrada vuelve `fixed` relativo a ella.
    <div className="fixed inset-0 z-[70] bg-cream animate-fade-in">
      <div className="absolute inset-0 overflow-y-auto scroll-custom">
      <div className="max-w-lg mx-auto flex flex-col gap-2.5" style={{ paddingBottom: 'calc(170px + env(safe-area-inset-bottom))' }}>
        <header className="sticky top-0 z-10 bg-cream/95 backdrop-blur-sm px-4 pb-2.5 flex items-center gap-2.5"
          style={{ paddingTop: 'max(env(safe-area-inset-top), 14px)' }}>
          <button onClick={onClose} aria-label="Volver a mi ruta"
            className="w-11 h-11 rounded-2xl border border-coal/10 bg-white flex items-center justify-center text-coal flex-shrink-0">
            <ChevronLeft size={21} aria-hidden="true" />
          </button>
          <div className="flex-1 min-w-0">
            <p className="flex items-baseline gap-2 flex-wrap">
              {order.orderNumber && <span className="font-display text-[32px] leading-none text-[#C8261D]">#{order.orderNumber}</span>}
              {parada > 0 && !entregado && <span className="font-body text-xs font-semibold text-coal/60">Parada {parada} de {totalParadas}</span>}
            </p>
            <p className={`font-body text-xs font-bold mt-0.5 ${etiqueta.tono === 'ok' ? 'text-[#12766B]' : etiqueta.tono === 'espera' ? 'text-[#8A5300]' : 'text-[#B3261E]'}`}>{detalleEtapa}</p>
          </div>
          <SedeBadge order={order} />
        </header>

        <div className="mx-4 grid grid-cols-4 gap-1" aria-label={`Paso ${paso + 1} de 4`}>
          {PASOS_REPARTO.map((t, i) => (
            <div key={t} className="flex flex-col gap-1.5">
              <span className={`h-1.5 rounded-full ${i < paso || entregado ? 'bg-mint' : i === paso ? 'bg-[#C8261D]' : 'bg-coal/[0.12]'}`} />
              <span className={`font-body text-[10px] font-bold ${i <= paso ? 'text-coal' : 'text-coal/45'}`}>{t}</span>
            </div>
          ))}
        </div>

        {entregado && (
          <>
            <section className="mx-4 mt-3 rounded-3xl bg-mint text-white px-5 py-7 flex flex-col items-center gap-2 text-center">
              <span className="w-16 h-16 rounded-full bg-white/20 flex items-center justify-center"><Check size={34} strokeWidth={2.6} aria-hidden="true" /></span>
              <p className="font-display text-[30px] tracking-wide normal-case">¡Pedido entregado!</p>
              <p className="font-body text-sm opacity-90">
                {esEfectivo(order) ? `${fmt(cashAmount(order))} en efectivo quedan en tu cuadre` : 'Ya estaba pagado: no hay nada que entregar en la caja'}
              </p>
            </section>
            {siguienteParada && (
              <button onClick={() => onSiguiente?.(siguienteParada)} className={`${tarjeta} flex items-center gap-3 text-left`}>
                <span className="w-8 h-8 rounded-full bg-coal text-cream font-display text-lg flex items-center justify-center flex-shrink-0">→</span>
                <span className="flex-1 min-w-0">
                  <span className="block font-body text-[11px] font-bold text-coal/55 uppercase tracking-wide">Siguiente parada</span>
                  <span className="block font-body text-sm font-bold truncate">
                    {siguienteParada.orderNumber ? `#${siguienteParada.orderNumber} ` : ''}{nombreDe(siguienteParada)}{siguienteParada.barrio ? ` · ${siguienteParada.barrio}` : ''}
                  </span>
                </span>
              </button>
            )}
          </>
        )}

        {/* No pudo entregar: la instrucción de la caja va primero (CP-1 a CP-3) */}
        {enExcepcion && (
          <section className={`${tarjeta} mt-1.5`}>
            <EstadoNoEntrega order={order} onHablarCaja={abrirLasNotas}
              entregar={(
                <button onClick={markDelivered} disabled={loading || transferenciaPendiente(order)}
                  className="w-full min-h-[56px] rounded-2xl bg-mint text-white font-body text-base font-bold disabled:opacity-50">
                  {esEfectivo(order) ? 'Sí lo entregué: cobré' : 'Sí lo entregué'}
                </button>
              )} />
          </section>
        )}

        {!entregado && order.loyaltyRedemption?.count > 0 && (
          <div className="mx-4 bg-mint/15 border-2 border-mint rounded-2xl p-3.5">
            <p className="font-body text-sm font-bold text-[#12766B] flex items-center gap-2"><Gift size={17} aria-hidden="true" /> Incluye premio de fidelización</p>
            <p className="font-body text-xs text-coal/80 mt-1">
              Lleva {order.loyaltyRedemption.count}x premio GRATIS (Hamburguesa Especial + Perro Grande con tocineta): ya está cubierto, no es parte del cobro.
            </p>
          </div>
        )}

        {!entregado && <div className="mx-4"><IndicacionesBreves order={order} /></div>}

        {/* Cliente. Para otra persona: los dos contactos, identificados (§7.3) */}
        {!entregado && (order.destinatario?.nombre ? <div className="mx-4"><ContactosParaOtro order={order} rol="domiciliario" /></div> : (
          <section className={`${tarjeta} flex flex-col gap-2.5`}>
            <div className="flex items-center gap-2.5">
              <span className="w-10 h-10 rounded-full bg-smoked font-display text-lg flex items-center justify-center flex-shrink-0">
                {(order.name || '?').split(/\s+/).filter(Boolean).slice(0, 2).map(x => x[0]).join('').toUpperCase()}
              </span>
              <div className="min-w-0">
                <p className="font-body text-[15px] font-bold truncate">{order.name}</p>
                {order.phone && <p className="font-body text-xs text-coal/60">{order.phone}</p>}
              </div>
            </div>
            {order.phone && (
              <div className="grid grid-cols-2 gap-2">
                <a href={`tel:${order.phone}`} className="min-h-[48px] rounded-2xl border-2 border-coal font-body text-sm font-bold text-coal flex items-center justify-center gap-1.5">
                  <Phone size={17} aria-hidden="true" /> Llamar
                </a>
                <a href={`https://wa.me/${waPhone}`} target="_blank" rel="noreferrer"
                  className="min-h-[48px] rounded-2xl bg-white border-2 border-[#25D366] font-body text-sm font-bold text-coal flex items-center justify-center gap-1.5">
                  <LogoWhatsApp size={20} /> WhatsApp
                </a>
              </div>
            )}
          </section>
        ))}

        {/* Dirección y navegación */}
        {!entregado && (
          <section className={tarjeta}>
            {!editingAddr ? (
              <div className="flex flex-col gap-2.5">
                <div className="flex items-start gap-2.5">
                  <MapPin size={20} className="text-[#C8261D] flex-shrink-0 mt-0.5" aria-hidden="true" />
                  <div className="flex-1 min-w-0">
                    <p className="font-body text-[15px] font-bold">{localAddr}</p>
                    {(order.barrio || order.reference) && (
                      <p className="font-body text-xs text-coal/60 mt-0.5">{[order.barrio, order.reference && `«${order.reference}»`].filter(Boolean).join(' · ')}</p>
                    )}
                    <p className={`font-body text-[11px] font-bold mt-1.5 ${precision === 'pin' ? 'text-[#12766B]' : precision === 'aprox' ? 'text-[#8a5a00]' : 'text-[#B3261E]'}`}>
                      {precision === 'pin' && '✓ Ubicación exacta: Maps y Waze te llevan al punto'}
                      {precision === 'aprox' && 'Ubicación aproximada: te deja cerca. Si no das con la casa, pídele la ubicación'}
                      {precision === 'texto' && 'Sin ubicación en el mapa: Waze casi siempre falla. Pídele la ubicación al cliente'}
                    </p>
                  </div>
                </div>
                <BotonesNavegar coords={navCoords} texto={localAddr} />
                {order.phone && precision !== 'pin' && (
                  <a href={waPedirUbicacion} target="_blank" rel="noreferrer"
                    className="min-h-[48px] rounded-2xl bg-white border-2 border-[#25D366] font-body text-sm font-bold text-coal flex items-center justify-center gap-2">
                    <LogoWhatsApp size={20} /> Pedirle la ubicación por WhatsApp
                  </a>
                )}
                <div className="flex flex-col gap-1">
                    {!pinOpen ? (
                      <button onClick={() => setPinOpen(true)}
                        className="btn-link text-xs self-start text-[#12766B] decoration-mint/40 min-h-[40px]">
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
                  <button
                    onClick={() => { setAddrDraft(localAddr); setEditingAddr(true); setAddrSuggestions([]); setAddrSearched(false) }}
                    className="btn-link text-xs self-start min-h-[40px]">
                    <Pencil size={13} aria-hidden="true" /> Corregir dirección
                  </button>
                </div>
              </div>
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
          </section>
        )}

        {!entregado && <div className="mx-4"><TarjetaCobro order={order} grande /></div>}

        {/* Lo que lleva */}
        <section className="mx-4 bg-white border border-coal/10 rounded-[20px] overflow-hidden">
          <button onClick={() => setVerPedido(v => !v)} aria-expanded={verPedido}
            className="w-full min-h-[52px] px-3.5 flex items-center gap-2 text-left">
            <ShoppingBag size={18} className="text-[#C8261D]" aria-hidden="true" />
            <span className="font-body text-sm font-bold">Lo que llevas</span>
            {order.driverNotes && <span className="font-body text-[11px] font-bold rounded-full bg-tangelo/15 text-[#9A3F12] px-2 py-0.5">Nota de la caja</span>}
            <span className="ml-auto font-body text-sm font-bold text-[#C8261D]">{verPedido ? 'Ocultar' : 'Ver'}</span>
          </button>
          {verPedido && (
            <div className="px-3.5 pb-3.5 flex flex-col gap-2">
              <p className="font-body text-sm text-coal whitespace-pre-wrap">{order.items}</p>
              {order.notes && <p className="font-body text-xs text-coal/70 bg-mustard/10 rounded-lg p-2">{order.notes}</p>}
              {order.driverNotes && (
                <p className="font-body text-xs text-[#6B4100] bg-mustard/[0.14] rounded-xl px-3 py-2"><b>Nota de la caja:</b> {order.driverNotes}</p>
              )}
              {order.totalPrice > 0 && (
                <div className="border-t border-coal/10 pt-2 flex flex-col gap-1 font-body text-sm">
                  <div className="flex justify-between"><span className="text-coal/60">Pedido</span><span>{fmt(order.quotedPrice)}</span></div>
                  <div className="flex justify-between"><span className="text-coal/60">Domicilio</span><span>{fmt(order.deliveryPrice)}</span></div>
                  <div className="flex justify-between font-bold"><span>Total · {order.payment}</span><span className="text-[#C8261D]">{fmt(order.totalPrice)}</span></div>
                </div>
              )}
            </div>
          )}
        </section>

        {/* Chat con el cliente (§8.3): solo ustedes dos lo ven */}
        {!entregado && <div className="mx-4"><ChatDomiciliario order={order} rol="driver" /></div>}

        {/* Notas internas con la caja (no las ve el cliente) */}
        <section ref={notasRef} className="mx-4 bg-white border border-coal/10 rounded-[20px] overflow-hidden scroll-mt-20">
          <button onClick={() => (verNotas ? setVerNotas(false) : abrirLasNotas())} aria-expanded={verNotas}
            className="w-full min-h-[56px] px-3.5 flex items-center gap-2.5 text-left">
            <MessageSquare size={20} className="text-coal flex-shrink-0" aria-hidden="true" />
            <span className="flex-1 min-w-0">
              <span className="block font-body text-sm font-bold">Hablar con la caja</span>
              <span className="block font-body text-xs text-coal/60 truncate">
                {ultimaCaja ? `Caja: «${ultimaCaja.text}»` : 'Solo la ven la caja y tú; el cliente no'}
              </span>
            </span>
            {!verNotas && notasSinLeer > 0 && <span className="min-w-[20px] h-5 px-1 rounded-full bg-[#C8261D] text-white font-body text-[11px] font-bold flex items-center justify-center" aria-label={`${notasSinLeer} sin leer`}>{notasSinLeer}</span>}
          </button>
          {verNotas && (
            <div className="px-3.5 pb-3.5 flex flex-col gap-2.5">
              {order.comments?.length > 0 ? (
                <div className="flex flex-col gap-2">
                  {[...order.comments].sort((a, b) => a.ts - b.ts).map((c, i) => (
                    <div key={i} className={`rounded-xl px-3 py-2 ${c.role === 'cashier' ? 'bg-tangelo/10 border border-tangelo/20 mr-6' : 'bg-mint/10 border border-mint/20 ml-6'}`}>
                      <p className={`font-body text-[10px] font-bold uppercase tracking-wider mb-0.5 ${c.role === 'cashier' ? 'text-[#9A3F12]' : 'text-[#12766B]'}`}>
                        {c.role === 'cashier' ? 'Caja' : 'Tú'} · {c.name}
                      </p>
                      <p className="font-body text-sm text-coal">{c.text}</p>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="font-body text-xs text-coal/50">Sin mensajes aún</p>
              )}
              <div className="flex gap-2">
                <textarea
                  className="textarea-field flex-1 h-14 scroll-custom text-sm"
                  placeholder="Escríbele a la caja (ej: no abren, timbre roto…)"
                  aria-label="Mensaje para la caja"
                  value={commentText}
                  onChange={e => setCommentText(e.target.value)}
                />
                <button onClick={sendComment} disabled={sendingComment || !commentText.trim()}
                  className="btn-mint px-3 self-end min-h-[48px]" aria-label="Enviar a la caja">
                  <Send size={18} aria-hidden="true" />
                </button>
              </div>
            </div>
          )}
        </section>
      </div>
      </div>

      {/* Un solo botón fijo para avanzar */}
      <div className="absolute inset-x-0 bottom-0 z-20 bg-gradient-to-b from-cream/0 via-cream to-cream"
        style={{ paddingBottom: 'max(env(safe-area-inset-bottom), 16px)' }}>
        <div className="max-w-lg mx-auto px-4 pt-6 flex flex-col gap-1.5">
          {siguiente?.bloqueado && (
            <p className="font-body text-sm text-coal bg-mustard/20 border border-mustard/50 rounded-xl px-3 py-2 flex items-start gap-2">
              <AlertTriangle size={16} className="text-mustard flex-shrink-0 mt-0.5" aria-hidden="true" />
              <span><strong>Transferencia pendiente de verificar.</strong> No entregues hasta que la caja confirme que la plata llegó.</span>
            </p>
          )}
          {entregado ? (
            <button onClick={() => (siguienteParada ? onSiguiente?.(siguienteParada) : onClose())} className={`${botonGrande} bg-coal`}>
              {siguienteParada ? 'Ir a la siguiente parada' : 'Volver a mi ruta'}
            </button>
          ) : siguiente && (
            <button onClick={siguiente.accion} disabled={loading || siguiente.bloqueado}
              className={`${botonGrande} ${siguiente.tono === 'mint' ? 'bg-mint' : 'bg-[#C8261D]'}`}>
              {loading ? 'Guardando…' : siguiente.texto}
            </button>
          )}
          {puedeReportar(order) && (
            <button onClick={() => setNoEntrega(true)} className="min-h-[44px] font-body text-sm font-bold text-[#B3261E]">No puedo entregar</button>
          )}
        </div>
      </div>

      {noEntrega && <HojaNoEntrega order={order} onCerrar={() => setNoEntrega(false)} alAvisar={alListo} />}
    </div>
  )
}

// ─── Resumen de entregados ────────────────────────────────────────────────────
function DriverEntregadosSummary({ orders, onCuadre }) {
  const cashOrders = orders.filter(esEfectivo)
  const totalFees  = orders.reduce((s, o) => s + (o.deliveryPrice || 0), 0)
  const totalCash  = cashOrders.reduce((s, o) => s + cashAmount(o), 0)
  const tarjeta = 'bg-white rounded-[18px] border border-coal/10 p-3.5'
  return (
    <>
      <section className="mx-4 mt-1 grid grid-cols-2 gap-2">
        <div className={tarjeta}>
          <p className="font-body text-[11px] font-bold text-coal/60 uppercase">Efectivo en mano</p>
          <p className="font-display text-[30px] leading-none text-[#B86F00] mt-1">{fmt(totalCash)}</p>
          <p className="font-body text-[11px] text-coal/60 mt-0.5">{cashOrders.length ? 'Entrégalo en la caja' : 'Sin pedidos en efectivo'}</p>
        </div>
        <div className={tarjeta}>
          <p className="font-body text-[11px] font-bold text-coal/60 uppercase">Tus domicilios</p>
          <p className="font-display text-[30px] leading-none text-[#12766B] mt-1">{fmt(totalFees)}</p>
          <p className="font-body text-[11px] text-coal/60 mt-0.5">{orders.length} entrega{orders.length === 1 ? '' : 's'}</p>
        </div>
      </section>
      <button onClick={onCuadre} className="mx-4 mt-2.5 min-h-[52px] rounded-2xl border-2 border-coal font-body text-sm font-bold text-coal">
        Ver mi cuadre de turno
      </button>
    </>
  )
}

// ─── Cuadre de turno del domiciliario ────────────────────────────────────────
function DriverCuadreTurnoModal({ orders, sede, user, onClose }) {
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
          {/* Entregas de efectivo y fondos para cambio (§13.2, §13.3) */}
          <CuadresEfectivo modo="domiciliario" sedeId={sede?.id} user={user} pedidos={completedToday} />
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
        'Inicia el turno: mientras estés en turno te llegan los pedidos ya asignados, sin tener que aceptarlos.',
        'En "Por recoger" ves los domicilios que te esperan en la sede: barra verde = listo, naranja = en cocina, y lo que hay por cobrar.',
        'Toca "Salir con los listos" (máximo 5 en la calle). Si quieres esperar los demás, "Esperar y llevar".',
        'En "En reparto" la parada actual va en grande: minutos, dirección, cobro, Google Maps, Waze, Llamar y WhatsApp.',
        'Toca "Llegué" frente al cliente y "Entregado" al entregar. Si fue en efectivo, queda en tu cuadre.',
        'Al terminar el turno, en "Entregados" toca "Ver mi cuadre de turno" y entrégale el efectivo a la caja.',
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
      { type: 'tip', text: 'Para cambiar de sede sin cerrar sesión, toca "Más" en la barra de abajo y luego "Cambiar de sede".' },
    ],
  },
  {
    id: 'estados', icon: Tag, title: 'Estados del pedido',
    content: [
      { type: 'table', rows: [
        ['EN COCINA',          'Lo están preparando: espera en la sede'],
        ['LISTO PARA RECOGER', 'Ya puedes salir con el pedido'],
        ['EN CAMINO',          'Saliste: el cliente ve tu ubicación'],
        ['EN EL DESTINO',      'Llegaste donde el cliente'],
        ['NO SE PUDO ENTREGAR','Le avisaste a la caja: espera su instrucción'],
        ['ENTREGADO',          'Si fue en efectivo, queda en tu cuadre con la caja'],
      ]},
    ],
  },
  {
    id: 'roles', icon: Bike, title: 'Cambiar de rol',
    content: [
      { type: 'p', text: 'Si tienes más de un rol (por ejemplo, domiciliario y cajero), puedes cambiar entre ellos sin cerrar sesión con "Ver como", en "Más".' },
      { type: 'steps', items: [
        'Toca "Más" en la barra de abajo y busca "Ver como".',
        'Selecciona el rol al que quieres cambiar: Cajero, Cliente, etc.',
        'La app cambia de vista inmediatamente sin necesidad de cerrar sesión.',
      ]},
      { type: 'tip', text: 'Para volver a tu vista de domiciliario, toca el mismo selector y elige "Domiciliario".' },
    ],
  },
  {
    id: 'navegacion', icon: Route, title: 'Navegación al cliente',
    content: [
      { type: 'p', text: 'En "En reparto" y en el detalle de cada pedido encontrarás dos botones de navegación:' },
      { type: 'table', rows: [
        ['Google Maps', 'Abre Google Maps con la dirección del cliente lista para navegar'],
        ['Waze',        'Abre Waze con la dirección del cliente lista para navegar'],
      ]},
      { type: 'tip', text: 'Tu ubicación GPS se comparte automáticamente con el cliente cuando el pedido está "En camino". Con la flecha de ubicación encendida en la franja del turno, la caja también te ubica aunque no tengas pedido.' },
    ],
  },
  {
    id: 'efectivo', icon: Banknote, title: 'Pedidos en efectivo',
    content: [
      { type: 'p', text: 'En "En reparto", "COBRAR" te dice cuánto cobrar, con qué billete paga y cuánto cambio llevar:' },
      { type: 'table', rows: [
        ['Paga exacto',    'El cliente tiene el dinero exacto — no necesitas traer cambio'],
        ['Necesita cambio','El cajero indica cuánto paga el cliente y cuánto debes devolver'],
      ]},
      { type: 'tip', text: 'Al tocar "Entregado" en un pedido en efectivo, queda en tu cuadre hasta que le entregues la plata a la caja.' },
    ],
  },
  {
    id: 'cuadre', icon: Calculator, title: 'Cuadre de turno',
    content: [
      { type: 'p', text: 'Al terminar el turno, ve a "Entregados" y toca "Ver mi cuadre de turno" (también está en "Más"):' },
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
        ['Ubicación con la caja', 'La flecha de la franja del turno: encendida, la caja te ubica en todo momento, aunque no tengas pedido. Se prende sola al iniciar el turno'],
      ]},
      { type: 'tip', text: 'Al terminar el turno se deja de compartir la ubicación (si no llevas pedidos), para ahorrar batería.' },
    ],
  },
  {
    id: 'comentarios', icon: MessageSquare, title: 'Comentarios en pedidos',
    content: [
      { type: 'p', text: 'En el detalle de cada pedido, "Hablar con la caja" te deja escribirle: timbre roto, no abren, dirección incorrecta, etc. En "Caja", en la barra de abajo, ves las notas de todos tus pedidos.' },
      { type: 'tip', text: 'La caja también puede dejarte notas en el pedido: aparecen en "Lo que llevas". Revísalas antes de salir.' },
    ],
  },
  {
    id: 'historial', icon: Calendar, title: 'Historial de entregas',
    content: [
      { type: 'p', text: 'En "Entregados", en la barra de abajo, ves tus pedidos del día. Usa el selector de fecha para consultar días anteriores.' },
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
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-coal/50 backdrop-blur-sm animate-fade-in"
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
              <span className="inline-flex rounded-md bg-white p-0.5"><LogoGoogleMaps size={16} /></span> Abrir ruta completa en Google Maps
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
