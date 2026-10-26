import { useEffect, useRef, useState } from 'react'
import { doc, onSnapshot } from 'firebase/firestore'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import { Route, Clock, Bike, MapPin, Lock } from 'lucide-react'
import { db } from '../services/firebase'
import { useAuth } from '../contexts/AuthContext'
import { ROLES } from '../services/roles'
import Logo from '../components/common/Logo'

// Recorrido de una entrega (especificación §12.1): solo administración. Lo
// graba el scheduler mientras el pedido va en camino y llegó, y se borra 7
// días después de la entrega (salvo reclamo abierto). ?recorrido=<orderId>

const metros = (a, b) => {
  const R = 6371000, rad = (x) => (x * Math.PI) / 180
  const h = Math.sin(rad(b.lat - a.lat) / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(rad(b.lng - a.lng) / 2) ** 2
  return 2 * R * Math.asin(Math.sqrt(h))
}
const hora = (ms) => (ms ? new Date(ms).toLocaleString('es-CO', { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' }) : '—')
const icono = (emoji) => L.divIcon({ className: 'ds-live-pin', html: `<div style="font-size:26px;line-height:1">${emoji}</div>`, iconSize: [26, 26], iconAnchor: [13, 24] })

export default function RecorridoPedido({ orderId }) {
  const { user, role, loading } = useAuth()
  const [rec, setRec] = useState(undefined) // undefined = cargando; null = no hay
  const elRef = useRef(null)
  const mapRef = useRef(null)
  const esAdmin = role === ROLES.ADMIN

  useEffect(() => {
    if (!esAdmin || !orderId) return undefined
    return onSnapshot(doc(db, 'recorridos', orderId), (s) => setRec(s.exists() ? s.data() : null), () => setRec(null))
  }, [esAdmin, orderId])

  // Dibuja la ruta: inicio, línea, última posición y destino.
  useEffect(() => {
    const puntos = rec?.puntos || []
    if (!elRef.current || !puntos.length) return undefined
    mapRef.current?.remove()
    const map = L.map(elRef.current)
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 19, attribution: '© OpenStreetMap' }).addTo(map)
    const linea = puntos.map((p) => [p.lat, p.lng])
    L.polyline(linea, { color: '#E5202A', weight: 5, opacity: 0.85 }).addTo(map)
    L.marker(linea[0], { icon: icono('🟢') }).addTo(map).bindTooltip(`Salió · ${hora(puntos[0].t)}`)
    L.marker(linea[linea.length - 1], { icon: icono('🛵') }).addTo(map).bindTooltip(`Último punto · ${hora(puntos[puntos.length - 1].t)}`)
    const todos = [...linea]
    if (rec.destino) { L.marker([rec.destino.lat, rec.destino.lng], { icon: icono('🏠') }).addTo(map).bindTooltip('Dirección del cliente'); todos.push([rec.destino.lat, rec.destino.lng]) }
    map.fitBounds(todos, { padding: [30, 30], maxZoom: 17 })
    mapRef.current = map
    return () => { map.remove(); mapRef.current = null }
  }, [rec])

  if (loading) return null
  const puntos = rec?.puntos || []
  let m = 0
  for (let i = 1; i < puntos.length; i++) m += metros(puntos[i - 1], puntos[i])
  const minutos = puntos.length > 1 ? Math.round((puntos[puntos.length - 1].t - puntos[0].t) / 60000) : 0

  return (
    <div className="min-h-screen-safe bg-smoked px-4 py-6 flex flex-col items-center">
      <div className="w-full max-w-3xl flex flex-col gap-4">
        <div className="flex items-center justify-between">
          <Logo variant="light" size="sm" />
          <a href="/admin/" className="font-body text-sm text-coal/60 underline">Volver al panel</a>
        </div>
        {!user || !esAdmin ? (
          <div className="card flex items-center gap-2 font-body text-sm text-coal/70">
            <Lock size={16} aria-hidden="true" /> Los recorridos solo los ve administración. Entra con tu cuenta de administración.
          </div>
        ) : rec === undefined ? (
          <p className="font-body text-sm text-coal/55">Cargando…</p>
        ) : !rec || !puntos.length ? (
          <div className="card font-body text-sm text-coal/70">
            Este pedido no tiene recorrido guardado. Se graba solo mientras va en camino, y se borra 7 días después de la entrega.
          </div>
        ) : (
          <>
            <div className="card flex flex-col gap-2">
              <p className="font-display text-xl tracking-wide text-coal flex items-center gap-2">
                <Route size={20} className="text-cherry" aria-hidden="true" /> Recorrido del pedido {rec.orderNumber ? `#${rec.orderNumber}` : ''}
              </p>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 font-body text-sm">
                <p className="flex items-center gap-1.5"><Bike size={15} className="text-coal/50" aria-hidden="true" /> {rec.driverName || rec.driverEmail || '—'}</p>
                <p className="flex items-center gap-1.5"><Clock size={15} className="text-coal/50" aria-hidden="true" /> {minutos} min</p>
                <p className="flex items-center gap-1.5"><Route size={15} className="text-coal/50" aria-hidden="true" /> {(m / 1000).toFixed(1)} km</p>
                <p className="text-coal/60">{puntos.length} puntos</p>
              </div>
              <p className="font-body text-xs text-coal/60 flex items-start gap-1.5">
                <MapPin size={14} className="flex-shrink-0 mt-0.5" aria-hidden="true" /> {rec.direccion || 'Sin dirección'} · {rec.sedeName || ''}
              </p>
              <p className="font-body text-xs text-coal/50">
                Salió {hora(puntos[0].t)} · último punto {hora(puntos[puntos.length - 1].t)}
                {rec.terminadoAt ? ` · terminó ${hora(rec.terminadoAt)} · se borra el ${hora(rec.terminadoAt + 7 * 86400000)}` : ' · entrega en curso'}
                {rec.retenidoPorReclamo ? ' · se conserva por un reclamo abierto' : ''}
              </p>
            </div>
            <div ref={elRef} className="w-full h-[60vh] rounded-2xl overflow-hidden border border-coal/10 bg-white" />
          </>
        )}
      </div>
    </div>
  )
}
