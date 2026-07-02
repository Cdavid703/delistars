import { useEffect, useState } from 'react'
import { collection, doc, onSnapshot, query, orderBy, limit, setDoc, serverTimestamp } from 'firebase/firestore'
import { db } from '@/services/firebase'
import { useAuthStore } from '@/store/authStore'
import { type Order, ACTIVE_STATUSES, DELIVERED_STATUSES, isToday, fmtCOP, statusInfo, statusLabel } from '@/lib/orders'
import { toast } from 'sonner'
import { Power } from 'lucide-react'

const StatCard = ({ icon, color, label, value }: { icon: string; color: string; label: string; value: string | number }) => (
  <div className="bg-white border border-gray-200 rounded-lg p-6 flex items-center gap-4">
    <div className={`${color} text-white rounded-lg p-3 text-xl`}>{icon}</div>
    <div>
      <p className="text-3xl font-display font-bold text-coal leading-none">{value}</p>
      <p className="text-sm text-muted-fg mt-1">{label}</p>
    </div>
  </div>
)

// Umbral (minutos sin avanzar) por estado para considerar un pedido "atascado".
// Se mide desde updatedAt (cada transición lo refresca) o createdAt si falta.
const STUCK_THRESHOLDS: Record<string, number> = {
  pending:    15, // la caja no ha cotizado
  quoted:     30, // el cliente no ha confirmado el pago
  assigned:   15, // el domiciliario no ha aceptado
  accepted:   40,
  preparing:  40,
  in_transit: 45,
  arrived:    20,
}

const minutesSince = (o: Order): number | null => {
  const ts = o.updatedAt?.toDate?.() || o.createdAt?.toDate?.()
  if (!ts) return null
  return Math.floor((Date.now() - ts.getTime()) / 60000)
}

export default function Dashboard() {
  const { user } = useAuthStore()
  const [orders, setOrders] = useState<Order[]>([])
  const [platformActive, setPlatformActive] = useState<boolean | null>(null)
  const [toggling, setToggling] = useState(false)
  // Re-render periódico para que los minutos de "atascado" avancen solos.
  const [, setTick] = useState(0)

  useEffect(() => {
    const q = query(collection(db, 'orders'), orderBy('createdAt', 'desc'), limit(500))
    return onSnapshot(q, (snap) => {
      setOrders(snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<Order, 'id'>) })))
    }, (err) => console.error('Error al leer pedidos:', err))
  }, [])

  useEffect(() => {
    return onSnapshot(doc(db, 'config', 'client_platform'), (snap) => {
      setPlatformActive(snap.exists() ? !!snap.data().active : false)
    }, () => setPlatformActive(null))
  }, [])

  useEffect(() => {
    const t = setInterval(() => setTick((n) => n + 1), 60000)
    return () => clearInterval(t)
  }, [])

  const togglePlatform = async () => {
    if (platformActive === null) return
    setToggling(true)
    try {
      await setDoc(doc(db, 'config', 'client_platform'), {
        active:    !platformActive,
        updatedBy: user?.email || 'admin',
        updatedAt: serverTimestamp(),
      }, { merge: true })
      toast.success(!platformActive ? 'Plataforma ABIERTA a clientes' : 'Plataforma CERRADA a clientes')
    } catch {
      toast.error('No se pudo cambiar el estado de la plataforma')
    } finally {
      setToggling(false)
    }
  }

  const today = orders.filter((o) => isToday(o.createdAt))
  const activos = orders.filter((o) => ACTIVE_STATUSES.includes(o.status) || ['pending', 'quoted'].includes(o.status))
  const entregadosHoy = today.filter((o) => DELIVERED_STATUSES.includes(o.status))
  const cuadre = orders.filter((o) => o.status === 'pending_cuadre')
  const ingresosHoy = entregadosHoy.reduce((s, o) => s + (o.totalPrice || 0), 0)

  const stuck = activos
    .map((o) => ({ o, mins: minutesSince(o) }))
    .filter(({ o, mins }) => {
      const limitMins = STUCK_THRESHOLDS[o.status]
      return limitMins != null && mins != null && mins >= limitMins
    })
    .sort((a, b) => (b.mins || 0) - (a.mins || 0))

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-3 mb-8">
        <div>
          <h1 className="text-4xl font-display font-bold text-coal">Resumen de hoy</h1>
          <p className="text-muted-fg mt-1">Pedidos de domicilios en tiempo real (todas las sedes)</p>
        </div>
        {/* Control de plataforma: mismo interruptor que tiene el cajero */}
        <button
          onClick={togglePlatform}
          disabled={toggling || platformActive === null}
          className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold border transition-colors disabled:opacity-50 ${
            platformActive
              ? 'bg-mint/10 border-mint/40 text-mint hover:bg-mint/20'
              : 'bg-gray-100 border-gray-300 text-coal/60 hover:bg-gray-200'
          }`}
          title="Abre o cierra la plataforma de pedidos para los clientes"
        >
          <Power className="w-4 h-4" />
          {platformActive === null ? 'Plataforma…' : platformActive ? 'Plataforma ACTIVA' : 'Plataforma APAGADA'}
          <span className={`w-2 h-2 rounded-full ${platformActive ? 'bg-mint animate-pulse' : 'bg-gray-400'}`} />
        </button>
      </div>

      {/* Pedidos atascados — llevan demasiado tiempo sin avanzar */}
      {stuck.length > 0 && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-4 mb-8">
          <p className="font-semibold text-red-800 text-sm mb-2">
            ⚠️ {stuck.length} pedido{stuck.length > 1 ? 's llevan' : ' lleva'} demasiado tiempo sin avanzar
          </p>
          <div className="space-y-1.5">
            {stuck.map(({ o, mins }) => (
              <div key={o.id} className="flex items-center justify-between gap-3 text-sm bg-white border border-red-100 rounded px-3 py-1.5">
                <span className="text-coal truncate">
                  {o.orderNumber && <span className="text-cherry font-semibold mr-1.5">#{o.orderNumber}</span>}
                  {o.name || o.clientName || '—'}{o.sedeName ? ` · ${o.sedeName}` : ''}
                  {o.driverName ? ` · 🛵 ${o.driverName}` : ''}
                </span>
                <span className="shrink-0 text-red-700 font-semibold">
                  {statusLabel(o.status)} hace {mins} min
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-4 mb-8">
        <StatCard icon="📦" color="bg-cherry"   label="Activos"        value={activos.length} />
        <StatCard icon="✅" color="bg-mint"     label="Entregados hoy" value={entregadosHoy.length} />
        <StatCard icon="⏳" color="bg-mustard"  label="Pdte. cuadre"   value={cuadre.length} />
        <StatCard icon="💰" color="bg-coal"     label="Ingresos hoy"   value={fmtCOP(ingresosHoy)} />
      </div>

      <h2 className="text-xl font-display font-semibold text-coal mb-4">Pedidos activos</h2>
      {activos.length === 0 ? (
        <p className="text-muted-fg">No hay pedidos activos en este momento.</p>
      ) : (
        <div className="space-y-3">
          {activos.map((o) => {
            const s = statusInfo(o.status)
            return (
              <div key={o.id} className="bg-white border border-gray-200 rounded-lg p-4 flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <p className="font-semibold text-coal">
                    {o.orderNumber && <span className="text-cherry mr-2">#{o.orderNumber}</span>}
                    {o.name || o.clientName || '—'}
                  </p>
                  <p className="text-sm text-muted-fg truncate">
                    {o.deliveryMode === 'pickup' ? '🏪 Recoge en sede' : (o.fullAddress || '—')}
                    {o.sedeName ? ` · ${o.sedeName}` : ''}
                  </p>
                </div>
                <span className={`shrink-0 px-3 py-1 rounded-full text-xs font-semibold ${s.cls}`}>{s.label}</span>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
