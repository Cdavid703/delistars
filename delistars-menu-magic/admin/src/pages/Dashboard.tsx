import { useEffect, useState } from 'react'
import { collection, onSnapshot, query, orderBy, limit } from 'firebase/firestore'
import { db } from '@/services/firebase'
import { type Order, ACTIVE_STATUSES, DELIVERED_STATUSES, isToday, fmtCOP, statusInfo } from '@/lib/orders'

const StatCard = ({ icon, color, label, value }: { icon: string; color: string; label: string; value: string | number }) => (
  <div className="bg-white border border-gray-200 rounded-lg p-6 flex items-center gap-4">
    <div className={`${color} text-white rounded-lg p-3 text-xl`}>{icon}</div>
    <div>
      <p className="text-3xl font-display font-bold text-coal leading-none">{value}</p>
      <p className="text-sm text-muted-fg mt-1">{label}</p>
    </div>
  </div>
)

export default function Dashboard() {
  const [orders, setOrders] = useState<Order[]>([])

  useEffect(() => {
    const q = query(collection(db, 'orders'), orderBy('createdAt', 'desc'), limit(500))
    return onSnapshot(q, (snap) => {
      setOrders(snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<Order, 'id'>) })))
    }, (err) => console.error('Error al leer pedidos:', err))
  }, [])

  const today = orders.filter((o) => isToday(o.createdAt))
  const activos = orders.filter((o) => ACTIVE_STATUSES.includes(o.status))
  const entregadosHoy = today.filter((o) => DELIVERED_STATUSES.includes(o.status))
  const cuadre = orders.filter((o) => o.status === 'pending_cuadre')
  const ingresosHoy = entregadosHoy.reduce((s, o) => s + (o.totalPrice || 0), 0)

  return (
    <div>
      <div className="mb-8">
        <h1 className="text-4xl font-display font-bold text-coal">Resumen de hoy</h1>
        <p className="text-muted-fg mt-1">Pedidos de domicilios en tiempo real (todas las sedes)</p>
      </div>

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
