import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { collection, doc, onSnapshot, query, orderBy, limit } from 'firebase/firestore'
import { db } from '@/services/firebase'
import { useAuthStore } from '@/store/authStore'
import { type Order, ACTIVE_STATUSES, DELIVERED_STATUSES, isToday, fmtCOP, statusInfo } from '@/lib/orders'
import { Power } from 'lucide-react'
import { estadoSede, textoEstado, SEDES_HORARIO, type Horario } from '@/lib/horarios'
import AvisoMercadeo from '@/components/mercadeo/AvisoMercadeo'

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
  const { role } = useAuthStore()
  const [orders, setOrders] = useState<Order[]>([])
  // Estado de las sedes para clientes. Se cambia en Sedes → Horarios.
  const [horarios, setHorarios] = useState<Record<string, Horario> | null | undefined>(undefined)
  // Re-render periódico para que los minutos de "atascado" avancen solos.
  const [, setTick] = useState(0)

  useEffect(() => {
    const q = query(collection(db, 'orders'), orderBy('createdAt', 'desc'), limit(500))
    return onSnapshot(q, (snap) => {
      setOrders(snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<Order, 'id'>) })))
    }, (err) => console.error('Error al leer pedidos:', err))
  }, [])

  useEffect(() => {
    return onSnapshot(doc(db, 'config', 'horarios'), (snap) => {
      setHorarios(snap.exists() ? (snap.data() as Record<string, Horario>) : null)
    }, () => setHorarios(null))
  }, [])

  useEffect(() => {
    const t = setInterval(() => setTick((n) => n + 1), 60000)
    return () => clearInterval(t)
  }, [])


  const today = orders.filter((o) => isToday(o.createdAt))
  const abiertos = orders.filter((o) => ACTIVE_STATUSES.includes(o.status) || ['pending', 'quoted'].includes(o.status))
  // "Activos" cuenta SOLO los de hoy: antes incluía pedidos de días pasados que
  // habían quedado sin cerrar, y el resumen del día mostraba cifras infladas.
  const activos = abiertos.filter((o) => isToday(o.createdAt))
  const abiertosViejos = abiertos.filter((o) => !isToday(o.createdAt))
  const entregadosHoy = today.filter((o) => DELIVERED_STATUSES.includes(o.status))
  const cuadre = orders.filter((o) => o.status === 'pending_cuadre')
  const ingresosHoy = entregadosHoy.reduce((s, o) => s + (o.totalPrice || 0), 0)

  // Pedidos de hoy que llevan demasiado tiempo sin avanzar. El detalle y las
  // acciones viven en Domicilios → "Por revisar"; aquí solo se avisa.
  const stuckHoy = activos.filter((o) => {
    const limitMins = STUCK_THRESHOLDS[o.status]
    const mins = minutesSince(o)
    return limitMins != null && mins != null && mins >= limitMins
  }).length

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-3 mb-8">
        <div>
          <h1 className="text-3xl sm:text-4xl font-display font-bold text-coal">Resumen de hoy</h1>
          <p className="text-muted-fg mt-1">Pedidos de domicilios en tiempo real (todas las sedes)</p>
        </div>
        {/* Estado de cada sede para clientes (se maneja en Sedes → Horarios). */}
        {horarios !== undefined && (
          <Link to="/sedes" className="flex flex-wrap gap-2" title="Cambiar horarios en Sedes">
            {SEDES_HORARIO.map((s) => {
              const e = estadoSede(horarios?.[s], Date.now())
              return (
                <span key={s} className={`flex items-center gap-2 px-3 py-2 rounded-lg text-xs font-semibold border ${
                  e.abierta ? 'bg-mint/10 border-mint/40 text-mint' : 'bg-gray-100 border-gray-300 text-coal/60'}`}>
                  <Power className="w-3.5 h-3.5" />
                  {s === 'santa_lucia' ? 'Santa Lucía' : 'Santa Teresita'}: {textoEstado(e)}
                </span>
              )
            })}
          </Link>
        )}
      </div>

      {/* Lo que tiene Mercadeo programado hoy y mañana (calendario). */}
      <AvisoMercadeo />

      {/* Aviso compacto: el detalle y las acciones viven en Domicilios → "Por
          revisar" (aquí sólo se avisa, para no convertir el resumen del día en
          una lista de pendientes de otros días). */}
      {role === 'admin' && (stuckHoy > 0 || abiertosViejos.length > 0) && (
        <Link
          to="/domicilios"
          className="block bg-red-50 border border-red-200 rounded-lg p-4 mb-8 hover:bg-red-100 transition-colors"
        >
          <p className="font-semibold text-red-800 text-sm flex items-center gap-2">
            ⚠️
            {abiertosViejos.length > 0 && (
              <span>{abiertosViejos.length} pedido{abiertosViejos.length > 1 ? 's' : ''} de días anteriores sin cerrar</span>
            )}
            {abiertosViejos.length > 0 && stuckHoy > 0 && <span>·</span>}
            {stuckHoy > 0 && (
              <span>{stuckHoy} de hoy sin avanzar</span>
            )}
          </p>
          <p className="text-xs text-red-700/80 mt-1">
            Ábrelos en <strong>Domicilios → Por revisar</strong> para marcarlos entregados o cancelarlos. →
          </p>
        </Link>
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
