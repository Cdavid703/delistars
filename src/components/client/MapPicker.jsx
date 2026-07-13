import { useEffect, useRef } from 'react'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'

// Mini-mapa para que el cliente ajuste el pin exacto de su dirección.
// Leaflet plano (sin react-leaflet) + tiles gratuitos de OpenStreetMap. Se
// importa de forma diferida (React.lazy) desde AddressBook, así el peso de
// Leaflet solo se descarga cuando el cliente abre el mapa.
export default function MapPicker({ initialLat, initialLng, onChange }) {
  const elRef       = useRef(null)
  const onChangeRef = useRef(onChange)
  onChangeRef.current = onChange

  useEffect(() => {
    const el = elRef.current
    if (!el) return
    // Centro por defecto: coordenada dada o el centro de Medellín.
    const lat = initialLat ?? 6.2447, lng = initialLng ?? -75.5916
    const map = L.map(el, { zoomControl: true, attributionControl: true }).setView([lat, lng], 17)
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19,
      attribution: '© OpenStreetMap',
    }).addTo(map)

    // Pin con emoji (evita el lío de las imágenes de marcador de Leaflet con
    // los bundlers). La punta del 📍 queda en la coordenada (iconAnchor).
    const icon = L.divIcon({
      className: 'ds-pin',
      html: '<div style="font-size:30px;line-height:1;filter:drop-shadow(0 2px 2px rgba(0,0,0,.35))">📍</div>',
      iconSize:   [30, 30],
      iconAnchor: [15, 28],
    })
    const marker = L.marker([lat, lng], { draggable: true, icon }).addTo(map)
    const emit = (ll) => onChangeRef.current?.(ll.lat, ll.lng)
    marker.on('dragend', () => emit(marker.getLatLng()))
    map.on('click', (e) => { marker.setLatLng(e.latlng); emit(e.latlng) })

    // El mapa está dentro de un modal que se acaba de montar: recalcula tamaño.
    const t = setTimeout(() => map.invalidateSize(), 150)
    return () => { clearTimeout(t); map.remove() }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return (
    <div ref={elRef}
      style={{ height: 220, width: '100%' }}
      className="rounded-xl overflow-hidden border border-coal/15 z-0" />
  )
}
