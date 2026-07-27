import { useEffect, useMemo, useState } from 'react'
import { collection, onSnapshot, query, orderBy, limit, doc, updateDoc, serverTimestamp } from 'firebase/firestore'
import { db } from '@/services/firebase'
import { useAuthStore } from '@/store/authStore'
import { type Order, isCashOrder, fmtCOP, fmtDateTime, statusLabel, isToday } from '@/lib/orders'
import { OrderDetailModal } from '@/components/OrderDetailModal'
import { toast } from 'sonner'
import { AlertTriangle, CheckCircle2, XCircle, Copy, Eye, CalendarX } from 'lucide-react'

// Estados en los que un pedido sigue "vivo" y por tanto puede quedarse atascado.
const OPEN_STATUSES = ['pending', 'quoted', 'assigned', 'accepted', 'preparing', 'in_transit', 'arrived']

// Minutos sin avanzar (desde updatedAt, o createdAt si falta) para considerarlo
// atascado DENTRO del mismo día. Los de días anteriores se marcan siempre.
const STUCK_THRESHOLDS: Record<string, number> = {
  pending: 15, quoted: 30, assigned: 15, accepted: 40, preparing: 40, in_transit: 45, arrived: 20,
}

const minutesSince = (o: Order): number => {
  const ts = o.updatedAt?.toDate?.() || o.createdAt?.toDate?.()
  return ts ? Math.floor((Date.now() - ts.getTime()) / 60000) : 0
}

const humanMins = (m: number) => {
  if (m < 60) return `${m} min`
  const h = Math.floor(m / 60)
  if (h < 24) return `${h} h`
  return `${Math.floor(h / 24)} día${Math.floor(h / 24) > 1 ? 's' : ''}`
}

// Dos pedidos son "posible duplicado" si son del mismo teléfono (o mismo
// cliente), el mismo día y se crearon con menos de 20 minutos de diferencia:
// el patrón típico de un cliente que no ve respuesta y reenvía su pedido.
const DUP_WINDOW_MS = 20 * 60 * 1000

export default function PedidosPorRevisar() {
  const { user } = useAuthStore()
  const [orders, setOrders] = useState<Order[]>([])
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [busyId, setBusyId] = useState<string | null>(null)
  const [, setTick] = useState(0)

  useEffect(() => {
    const q = query(collection(db, 'orders'), orderBy('createdAt', 'desc'), limit(500))
    return onSnapshot(q, (snap) => {
      setOrders(snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<Order, 'id'>) })))
    }, (err) => console.error('Error al leer pedidos:', err))
  }, [])

  // Refresca los contadores de tiempo cada minuto.
  useEffect(() => {
    const t = setInterval(() => setTick((n) => n + 1), 60000)
    return () => clearInterval(t)
  }, [])

  const abiertos = useMemo(() => orders.filter((o) => OPEN_STATUSES.includes(o.status)), [orders])

  // Grupo 1: pedidos de días anteriores que quedaron abiertos (lo más grave:
  // no cuentan como venta, su efectivo no entra al cuadre y ensucian el panel).
  const viejos = useMemo(
    () => abiertos.filter((o) => !isToday(o.createdAt)).sort((a, b) => minutesSince(b) - minutesSince(a)),
    [abiertos],
  )

  // Grupo 2: pedidos de HOY que llevan demasiado tiempo sin avanzar.
  const atascadosHoy = useMemo(
    () => abiertos
      .filter((o) => isToday(o.createdAt))
      .filter((o) => minutesSince(o) >= (STUCK_THRESHOLDS[o.status] ?? 9999))
      .sort((a, b) => minutesSince(b) - minutesSince(a)),
    [abiertos],
  )

  // Mapa id → pedido del que parece ser duplicado.
  const dupDe = useMemo(() => {
    const map: Record<string, Order> = {}
    const key = (o: Order) => (o.phone || '').replace(/\D/g, '') || `n:${(o.name || o.clientName || '').toLowerCase()}`
    abiertos.forEach((o) => {
      const t = o.createdAt?.toDate?.()?.getTime()
      if (!t) return
      const gemelo = orders.find((x) => {
        if (x.id === o.id) return false
        if (key(x) !== key(o)) return false
        const tx = x.createdAt?.toDate?.()?.getTime()
        if (!tx) return false
        // el "original" es el más antiguo dentro de la ventana
        return tx < t && t - tx <= DUP_WINDOW_MS
      })
      if (gemelo) map[o.id] = gemelo
    })
    return map
  }, [abiertos, orders])

  const patch = async (o: Order, data: Record<string, unknown>, okMsg: string) => {
    setBusyId(o.id)
    try {
      await updateDoc(doc(db, 'orders', o.id), {
        ...data,
        updatedAt: serverTimestamp(),
        adminNote: `Cerrado desde el panel por ${user?.email || 'admin'}`,
      })
      toast.success(okMsg)
    } catch {
      toast.error('No se pudo actualizar el pedido')
    } finally {
      setBusyId(null)
    }
  }

  const marcarEntregado = (o: Order) => {
    // Si se cobró en efectivo, va a "pendiente de cuadre" para que ese dinero
    // entre al cuadre de caja; si no, se cierra como completado.
    const destino = isCashOrder(o) ? 'pending_cuadre' : 'completed'
    if (!window.confirm(
      `¿Marcar como ENTREGADO el pedido${o.orderNumber ? ` #${o.orderNumber}` : ''} de ${o.name || o.clientName || 'este cliente'}?\n\n` +
      `Total: ${fmtCOP(o.totalPrice)}\n` +
      (isCashOrder(o) ? 'Es en efectivo: pasará a "pendiente de cuadre".' : 'Se contará como venta completada.')
    )) return
    patch(o, { status: destino, deliveredAt: serverTimestamp() }, 'Pedido marcado como entregado')
  }

  const cancelar = (o: Order) => {
    if (!window.confirm(
      `¿CANCELAR el pedido${o.orderNumber ? ` #${o.orderNumber}` : ''} de ${o.name || o.clientName || 'este cliente'}?\n\n` +
      'No contará como venta. Queda registrado con su motivo (no se borra).'
    )) return
    patch(o, { status: 'cancelled', cancelledAt: serverTimestamp(), cancelReason: 'Cerrado por administración' }, 'Pedido cancelado')
  }

  const Fila = ({ o, critico }: { o: Order; critico: boolean }) => {
    const dup = dupDe[o.id]
    const mins = minutesSince(o)
    return (
      <div className={`border rounded-lg p-3 flex flex-col sm:flex-row sm:items-center gap-3 ${critico ? 'bg-red-50 border-red-200' : 'bg-amber-50 border-amber-200'}`}>
        <div className="flex-1 min-w-0">
          <div className="flex items-center flex-wrap gap-2">
            {o.orderNumber && <span className="font-display text-cherry font-semibold">#{o.orderNumber}</span>}
            <span className="text-coal font-medium truncate">{o.name || o.clientName || '—'}</span>
            {o.sedeName && <span className="text-xs text-muted-fg">· {o.sedeName}</span>}
            {o.driverName && <span className="text-xs text-muted-fg">· 🛵 {o.driverName}</span>}
          </div>
          <div className="flex items-center flex-wrap gap-2 mt-1">
            <span className={`text-xs font-semibold ${critico ? 'text-red-700' : 'text-amber-700'}`}>
              {statusLabel(o.status)} hace {humanMins(mins)}
            </span>
            <span className="text-xs text-muted-fg">· {fmtDateTime(o.createdAt)}</span>
            <span className="text-xs text-muted-fg">· {fmtCOP(o.totalPrice)}</span>
            {isCashOrder(o) && <span className="text-xs text-mint font-semibold">· efectivo</span>}
          </div>
          {dup && (
            <p className="mt-1.5 text-xs bg-white border border-amber-300 rounded px-2 py-1 inline-flex items-center gap-1.5 text-amber-800">
              <Copy className="w-3 h-3" />
              Parece <strong>duplicado</strong> de {dup.orderNumber ? `#${dup.orderNumber}` : 'otro pedido'} ({fmtDateTime(dup.createdAt)}) — si es el mismo, cancela este.
            </p>
          )}
          {o.totalPrice === 0 && (
            <p className="mt-1 text-xs text-muted-fg">Sin cotizar (total en $0): si lo marcas entregado no sumará ventas.</p>
          )}
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <button onClick={() => setSelectedId(o.id)} disabled={busyId === o.id}
            className="inline-flex items-center gap-1 text-xs font-semibold px-2.5 py-1.5 rounded border border-gray-300 bg-white text-coal hover:bg-gray-50 disabled:opacity-50">
            <Eye className="w-3.5 h-3.5" /> Ver
          </button>
          <button onClick={() => marcarEntregado(o)} disabled={busyId === o.id}
            className="inline-flex items-center gap-1 text-xs font-semibold px-2.5 py-1.5 rounded bg-mint text-white hover:opacity-90 disabled:opacity-50">
            <CheckCircle2 className="w-3.5 h-3.5" /> Entregado
          </button>
          <button onClick={() => cancelar(o)} disabled={busyId === o.id}
            className="inline-flex items-center gap-1 text-xs font-semibold px-2.5 py-1.5 rounded border border-red-300 bg-white text-red-700 hover:bg-red-50 disabled:opacity-50">
            <XCircle className="w-3.5 h-3.5" /> Cancelar
          </button>
        </div>
      </div>
    )
  }

  const total = viejos.length + atascadosHoy.length

  return (
    <div>
      <div className="mb-6">
        <h2 className="text-2xl font-display font-bold text-coal">Pedidos por revisar</h2>
        <p className="text-muted-fg text-sm mt-1">
          Pedidos que siguen abiertos y necesitan una decisión. Cerrarlos mantiene correctas las ventas y el cuadre de caja.
        </p>
      </div>

      {total === 0 && (
        <div className="bg-mint/10 border border-mint/30 rounded-lg p-6 text-center">
          <CheckCircle2 className="w-10 h-10 text-mint mx-auto mb-2" />
          <p className="font-display text-lg text-coal">Todo al día</p>
          <p className="text-sm text-muted-fg mt-1">No hay pedidos pendientes de revisar.</p>
        </div>
      )}

      {viejos.length > 0 && (
        <div className="mb-8">
          <div className="flex items-center gap-2 mb-3">
            <CalendarX className="w-5 h-5 text-red-600" />
            <h3 className="font-display text-lg text-coal">De días anteriores ({viejos.length})</h3>
          </div>
          <p className="text-sm text-muted-fg mb-3">
            Quedaron sin cerrar en jornadas pasadas. Mientras sigan abiertos no cuentan como venta y su efectivo no aparece en el cuadre.
          </p>
          <div className="space-y-2">
            {viejos.map((o) => <Fila key={o.id} o={o} critico />)}
          </div>
        </div>
      )}

      {atascadosHoy.length > 0 && (
        <div>
          <div className="flex items-center gap-2 mb-3">
            <AlertTriangle className="w-5 h-5 text-amber-600" />
            <h3 className="font-display text-lg text-coal">De hoy, sin avanzar ({atascadosHoy.length})</h3>
          </div>
          <p className="text-sm text-muted-fg mb-3">
            Llevan más tiempo del normal en su estado. Revisa con la caja o el domiciliario antes de cerrarlos.
          </p>
          <div className="space-y-2">
            {atascadosHoy.map((o) => <Fila key={o.id} o={o} critico={false} />)}
          </div>
        </div>
      )}

      {selectedId && (() => {
        const sel = orders.find((o) => o.id === selectedId)
        return sel ? <OrderDetailModal order={sel} onClose={() => setSelectedId(null)} /> : null
      })()}
    </div>
  )
}
