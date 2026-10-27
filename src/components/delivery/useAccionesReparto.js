import { useState } from 'react'
import { doc, updateDoc, serverTimestamp } from 'firebase/firestore'
import { db, registerLoyaltyDelivery, actualizarPedido } from '../../services/firebase'
import { conApi, ErrorApi } from '../../services/pedidosApi'
import { medirRuta } from '../../services/recorrido'
import { SEDES } from '../../services/roles'
import { transferenciaPendiente } from '../../utils/cuadres'
import { etapaDe } from '../../utils/etapas'
import { esEfectivo, cobroDe, fmt } from '../../utils/reparto'

/** Hora (ms) de llegada si se sale ya y el recorrido toma `min` minutos. */
const llegadaEn = min => Date.now() + min * 60000

/**
 * Cambio del domiciliario por la API (el servidor valida y cuenta la
 * fidelización al entregar). Si el servidor no responde, el camino directo.
 * Lanza ErrorApi con el mensaje para el domiciliario.
 */
export async function cambiarPedido(order, ruta, cuerpo, data, despuesDirecto) {
  await conApi(`${order.id}/${ruta}`, { ...cuerpo, version: order.version ?? 0 }, async () => {
    await actualizarPedido(order, data, { rol: 'domiciliario' })
    despuesDirecto?.()
  })
}

/**
 * Salir con el pedido. Al salir se calcula a qué hora llega: es el único
 * momento seguro con la página abierta (después el domiciliario navega con
 * Google Maps o Waze y el celular pausa la página y su GPS). Se guarda en el
 * pedido para que el cliente vea una hora real aunque no lleguen más ubicaciones.
 */
export async function salirConPedido(order, navCoords) {
  await cambiarPedido(order, 'transiciones', { a: 'en_camino' }, { status: 'in_transit', inTransitAt: serverTimestamp() })
  if (!navCoords) return
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

/**
 * Lo que el domiciliario hace con un pedido: aceptar (pedidos viejos), salir,
 * llegar y entregar. Lo usan «En reparto» y el detalle.
 * `navCoords`: a dónde va (para calcular la hora de llegada al salir).
 * `alListo`: después de cada cambio que salió bien (p. ej. recargar la lista).
 */
export default function useAccionesReparto(order, { navCoords = null, alListo } = {}) {
  const [loading, setLoading] = useState(false)

  // Devuelve false si hubo un error que se le mostró al domiciliario.
  const correr = async (fn) => {
    setLoading(true)
    try {
      await fn()
      alListo?.()
      return true
    } catch (err) {
      if (err instanceof ErrorApi) { alert(err.message); return false }
      throw err
    } finally { setLoading(false) }
  }

  const accept  = () => correr(() => cambiarPedido(order, 'aceptar', {}, { status: 'accepted', acceptedAt: serverTimestamp() }))
  const transit = () => correr(() => salirConPedido(order, navCoords))
  const arrived = () => correr(() => cambiarPedido(order, 'transiciones', { a: 'llego' }, { status: 'arrived', arrivedAt: serverTimestamp() }))

  const markDelivered = ({ confirmar = true } = {}) => {
    // §13.1: pagada en digital, no se entrega hasta que la caja confirme la plata.
    if (transferenciaPendiente(order)) { alert('La caja aún no confirma la transferencia. Pídele que la verifique antes de entregar.'); return false }
    const c = cobroDe(order)
    if (confirmar && !window.confirm(c.efectivo && c.monto > 0 ? `¿Recibiste ${fmt(c.monto)} y entregaste el pedido?` : '¿Entregaste el pedido?')) return false
    const newStatus = esEfectivo(order) ? 'pending_cuadre' : 'completed'
    // Por la API el servidor cuenta la fidelización; en el respaldo, como siempre.
    return correr(() => cambiarPedido(order, 'transiciones', { a: 'entregado' }, { status: newStatus, deliveredAt: serverTimestamp() },
      () => registerLoyaltyDelivery(order))) // best-effort, no bloquea la entrega
  }

  // El botón grande de cada paso (textos de la app, 26 oct 2026). null: nada que avanzar.
  const { excepcion } = etapaDe(order)
  let siguiente = null
  if (order.status === 'assigned') siguiente = { texto: 'Aceptar pedido', accion: accept, tono: 'mint' }
  else if (['accepted', 'preparing'].includes(order.status)) siguiente = { texto: 'Salir con el pedido', accion: transit, tono: 'cherry' }
  else if (order.status === 'in_transit') siguiente = { texto: 'Llegué', accion: arrived, tono: 'cherry' }
  else if (order.status === 'arrived' && !excepcion) {
    siguiente = { texto: 'Entregado', accion: () => markDelivered(), tono: 'cherry', bloqueado: transferenciaPendiente(order) }
  }

  return { loading, siguiente, markDelivered }
}
