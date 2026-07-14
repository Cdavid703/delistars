import { useEffect, useRef } from 'react'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'

// Mapa en vivo para que el cliente vea al domiciliario acercarse mientras el
// pedido está "en camino". Muestra el pin del domiciliario (se actualiza cada
// vez que llega una nueva coordenada por Firestore) y, si se conoce, el pin del
// destino. Leaflet plano + tiles gratuitos de OSM; se importa de forma diferida
// (React.lazy) para no cargar Leaflet hasta que haga falta.
const pinIcon = (emoji) => L.divIcon({
  className: 'ds-live-pin',
  html: `<div style="font-size:28px;line-height:1;filter:drop-shadow(0 2px 2px rgba(0,0,0,.35))">${emoji}</div>`,
  iconSize:   [28, 28],
  iconAnchor: [14, 26],
})

export default function LiveDriverMap({ driverLat, driverLng, destLat, destLng }) {
  const elRef        = useRef(null)
  const mapRef       = useRef(null)
  const driverMkRef  = useRef(null)

  // Init una sola vez
  useEffect(() => {
    const el = elRef.current
    if (!el || driverLat == null) return
    const map = L.map(el, { zoomControl: true, attributionControl: true })
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19,
      attribution: '© OpenStreetMap',
    }).addTo(map)

    const driverMk = L.marker([driverLat, driverLng], { icon: pinIcon('🛵') }).addTo(map)
    const points = [[driverLat, driverLng]]
    if (destLat != null && destLng != null) {
      L.marker([destLat, destLng], { icon: pinIcon('🏠') }).addTo(map)
      points.push([destLat, destLng])
    }
    if (points.length > 1) map.fitBounds(points, { padding: [40, 40], maxZoom: 16 })
    else map.setView([driverLat, driverLng], 16)

    mapRef.current = map
    driverMkRef.current = driverMk
    const t = setTimeout(() => map.invalidateSize(), 150)
    return () => { clearTimeout(t); map.remove(); mapRef.current = null; driverMkRef.current = null }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Mover el pin del domiciliario cuando cambia su coordenada (sin recrear el mapa)
  useEffect(() => {
    if (!mapRef.current || !driverMkRef.current || driverLat == null) return
    driverMkRef.current.setLatLng([driverLat, driverLng])
    if (destLat != null && destLng != null) {
      mapRef.current.fitBounds([[driverLat, driverLng], [destLat, destLng]], { padding: [40, 40], maxZoom: 16 })
    } else {
      mapRef.current.panTo([driverLat, driverLng])
    }
  }, [driverLat, driverLng, destLat, destLng])

  return (
    <div ref={elRef}
      style={{ height: 240, width: '100%' }}
      className="rounded-xl overflow-hidden border border-cherry/20 z-0" />
  )
}
