import { useEffect, useMemo, useState } from 'react'
import { collection, onSnapshot, query, orderBy, limit } from 'firebase/firestore'
import { db } from '@/services/firebase'
import { type Order, DELIVERED_STATUSES, fmtCOP } from '@/lib/orders'

const DAY_MS = 24 * 60 * 60 * 1000

const dayKey = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`

const dayLabel = (d: Date) =>
  d.toLocaleDateString('es-CO', { weekday: 'short', day: '2-digit' })

// Extrae productos del texto libre de items ("2x Hamburguesa Especial (+ queso)").
// Best-effort: agrupa por nombre sin adiciones ni notas.
function parseItems(items?: string): { name: string; qty: number }[] {
  if (!items) return []
  const out: { name: string; qty: number }[] = []
  for (const raw of items.split('\n')) {
    const line = raw.trim()
    if (!line) continue
    const m = line.match(/^(\d+)\s*x\s+(.+)$/i)
    if (!m) continue
    let name = m[2]
      .replace(/\(.*?\)/g, '')     // adiciones "(Adición + queso, ...)"
      .replace(/\|[^|—]*/g, '')    // salsas/cebollas "| Salsas: ..."
      .replace(/—\s*".*?"/g, '')   // notas — "sin cebolla"
      .replace(/\s+/g, ' ')
      .trim()
    if (!name || /premio fidelización/i.test(line)) name = '🎁 Hamburguesa Especial (premio)'
    out.push({ name, qty: Number(m[1]) || 1 })
  }
  return out
}

const Bar = ({ label, value, max, display, color = 'bg-primary' }: {
  label: string; value: number; max: number; display: string; color?: string
}) => (
  <div className="flex items-center gap-2 text-sm">
    <span className="w-24 shrink-0 text-right text-muted-fg text-xs">{label}</span>
    <div className="flex-1 bg-gray-100 rounded-full h-4 overflow-hidden">
      <div className={`${color} h-4 rounded-full transition-all`} style={{ width: `${max > 0 ? (value / max) * 100 : 0}%` }} />
    </div>
    <span className="w-24 shrink-0 text-xs text-coal font-medium">{display}</span>
  </div>
)

const Card = ({ title, subtitle, children }: { title: string; subtitle?: string; children: React.ReactNode }) => (
  <div className="bg-white border border-gray-200 rounded-lg p-4">
    <p className="font-display font-semibold text-coal">{title}</p>
    {subtitle && <p className="text-xs text-muted-fg mb-3">{subtitle}</p>}
    {!subtitle && <div className="mb-3" />}
    {children}
  </div>
)

export default function Reportes() {
  const [orders, setOrders] = useState<Order[]>([])
  const [days, setDays] = useState(14)
  const [sede, setSede] = useState('')

  useEffect(() => {
    const q = query(collection(db, 'orders'), orderBy('createdAt', 'desc'), limit(500))
    return onSnapshot(q, (snap) => {
      setOrders(snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<Order, 'id'>) })))
    }, (err) => console.error('Error al leer pedidos:', err))
  }, [])

  // Embudo: eventos "llegó al checkout" que escribe la app de domicilios.
  const [funnel, setFunnel] = useState<{ at?: { toDate?: () => Date } }[]>([])
  useEffect(() => {
    const q = query(collection(db, 'metrics_funnel'), orderBy('at', 'desc'), limit(2000))
    return onSnapshot(q, (snap) => setFunnel(snap.docs.map((d) => d.data() as { at?: { toDate?: () => Date } })), () => {})
  }, [])

  // Carritos que llegaron al checkout vs pedidos que el CLIENTE envió (los del
  // cajero se excluyen: no pasan por el checkout del cliente). Sin filtro de
  // sede: el embudo se mide global.
  const funnelStats = useMemo(() => {
    const cutoff = Date.now() - days * DAY_MS
    const checkouts = funnel.filter((e) => {
      const d = e.at?.toDate?.()
      return !!d && d.getTime() >= cutoff
    }).length
    const clientOrders = orders.filter((o) => {
      if ((o as unknown as { cashierId?: string }).cashierId) return false
      const d = o.createdAt?.toDate?.()
      return !!d && d.getTime() >= cutoff
    }).length
    const abandoned = Math.max(0, checkouts - clientOrders)
    const rate = checkouts > 0 ? Math.round((abandoned / checkouts) * 100) : null
    return { checkouts, clientOrders, abandoned, rate }
  }, [funnel, orders, days])

  // Solo pedidos ENTREGADOS dentro del rango — ventas reales, no intentos.
  const delivered = useMemo(() => {
    const cutoff = Date.now() - days * DAY_MS
    return orders.filter((o) => {
      if (!DELIVERED_STATUSES.includes(o.status)) return false
      if (sede && o.sedeName !== sede) return false
      const d = o.createdAt?.toDate?.()
      return !!d && d.getTime() >= cutoff
    })
  }, [orders, days, sede])

  const sedes = useMemo(
    () => Array.from(new Set(orders.map((o) => o.sedeName).filter(Boolean) as string[])).sort(),
    [orders],
  )

  // Ventas por día
  const byDay = useMemo(() => {
    const map: Record<string, { label: string; total: number; count: number }> = {}
    for (let i = days - 1; i >= 0; i--) {
      const d = new Date(Date.now() - i * DAY_MS)
      map[dayKey(d)] = { label: dayLabel(d), total: 0, count: 0 }
    }
    delivered.forEach((o) => {
      const d = o.createdAt!.toDate()
      const k = dayKey(d)
      if (map[k]) { map[k].total += o.totalPrice || 0; map[k].count++ }
    })
    return Object.values(map)
  }, [delivered, days])

  // Comparación entre sedes (sin el filtro de sede, para poder compararlas)
  const bySede = useMemo(() => {
    const cutoff = Date.now() - days * DAY_MS
    const map: Record<string, { total: number; count: number }> = {}
    orders.forEach((o) => {
      if (!DELIVERED_STATUSES.includes(o.status)) return
      const d = o.createdAt?.toDate?.()
      if (!d || d.getTime() < cutoff) return
      const k = o.sedeName || 'Sin sede'
      map[k] = map[k] || { total: 0, count: 0 }
      map[k].total += o.totalPrice || 0
      map[k].count++
    })
    return Object.entries(map).sort(([, a], [, b]) => b.total - a.total)
  }, [orders, days])

  // Top productos (parseo best-effort del texto de items)
  const topProducts = useMemo(() => {
    const map: Record<string, number> = {}
    delivered.forEach((o) => parseItems(o.items).forEach(({ name, qty }) => {
      map[name] = (map[name] || 0) + qty
    }))
    return Object.entries(map).sort(([, a], [, b]) => b - a).slice(0, 10)
  }, [delivered])

  // Horas pico (pedidos entregados por hora de creación)
  const byHour = useMemo(() => {
    const map: Record<number, number> = {}
    delivered.forEach((o) => {
      const h = o.createdAt!.toDate().getHours()
      map[h] = (map[h] || 0) + 1
    })
    const hours = Object.keys(map).map(Number).sort((a, b) => a - b)
    return hours.map((h) => ({ h, count: map[h] }))
  }, [delivered])

  const totalVentas = delivered.reduce((s, o) => s + (o.totalPrice || 0), 0)
  const totalDomis = delivered.reduce((s, o) => s + (o.deliveryPrice || 0), 0)
  const ticketPromedio = delivered.length ? totalVentas / delivered.length : 0

  const maxDia = Math.max(1, ...byDay.map((d) => d.total))
  const maxSede = Math.max(1, ...bySede.map(([, v]) => v.total))
  const maxProd = Math.max(1, ...topProducts.map(([, n]) => n))
  const maxHora = Math.max(1, ...byHour.map((x) => x.count))

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-3 mb-6">
        <div>
          <h1 className="text-4xl font-display font-bold text-coal">Reportes</h1>
          <p className="text-muted-fg mt-1">Ventas entregadas — últimos {days} días{sede ? ` · ${sede}` : ' · todas las sedes'}</p>
        </div>
        <div className="flex items-center gap-2">
          <select value={sede} onChange={(e) => setSede(e.target.value)} className="border rounded px-2 py-1 text-sm">
            <option value="">Todas las sedes</option>
            {sedes.map((s) => <option key={s} value={s}>{s}</option>)}
          </select>
          {[7, 14, 30].map((n) => (
            <button
              key={n}
              onClick={() => setDays(n)}
              className={`px-3 py-1 rounded text-sm font-medium ${days === n ? 'bg-primary text-white' : 'border text-coal'}`}
            >
              {n}d
            </button>
          ))}
        </div>
      </div>

      {/* Totales del período */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-6">
        <div className="bg-white border border-gray-200 rounded-lg p-4">
          <p className="text-sm text-muted-fg">Pedidos entregados</p>
          <p className="text-2xl font-display font-bold text-coal">{delivered.length}</p>
        </div>
        <div className="bg-white border border-gray-200 rounded-lg p-4">
          <p className="text-sm text-muted-fg">Ventas</p>
          <p className="text-2xl font-display font-bold text-mint">{fmtCOP(totalVentas)}</p>
        </div>
        <div className="bg-white border border-gray-200 rounded-lg p-4">
          <p className="text-sm text-muted-fg">Domicilios cobrados</p>
          <p className="text-2xl font-display font-bold text-tangelo">{fmtCOP(totalDomis)}</p>
        </div>
        <div className="bg-white border border-gray-200 rounded-lg p-4">
          <p className="text-sm text-muted-fg">Ticket promedio</p>
          <p className="text-2xl font-display font-bold text-coal">{fmtCOP(Math.round(ticketPromedio))}</p>
        </div>
      </div>

      {/* Embudo de carritos: checkout iniciado vs pedido enviado (todas las sedes) */}
      <div className="bg-white border border-gray-200 rounded-lg p-4 mb-6">
        <div className="flex flex-wrap items-center gap-x-6 gap-y-1">
          <p className="text-sm font-display font-semibold text-coal">🛒 Embudo de pedidos <span className="font-normal text-muted-fg">(todas las sedes)</span></p>
          <p className="text-sm text-muted-fg">Llegaron al checkout: <span className="font-bold text-coal">{funnelStats.checkouts}</span></p>
          <p className="text-sm text-muted-fg">Enviaron pedido: <span className="font-bold text-mint">{funnelStats.clientOrders}</span></p>
          <p className="text-sm text-muted-fg">
            Abandono:{' '}
            {funnelStats.rate === null
              ? <span className="text-muted-fg">sin datos aún</span>
              : <span className={`font-bold ${funnelStats.rate > 40 ? 'text-red-600' : 'text-coal'}`}>{funnelStats.abandoned} ({funnelStats.rate}%)</span>}
          </p>
        </div>
        <p className="text-xs text-muted-fg mt-1">Se mide desde que el cliente llega con su carrito al paso de dirección. Los datos se acumulan desde el 10 de julio de 2026.</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card title="Ventas por día" subtitle="Total vendido cada día (pedidos entregados)">
          <div className="space-y-1.5">
            {byDay.map((d, i) => (
              <Bar key={i} label={d.label} value={d.total} max={maxDia}
                display={`${fmtCOP(d.total)} (${d.count})`} />
            ))}
          </div>
        </Card>

        <div className="flex flex-col gap-6">
          <Card title="Comparación entre sedes" subtitle="Ventas del período por sede">
            {bySede.length === 0 ? <p className="text-sm text-muted-fg">Sin datos.</p> : (
              <div className="space-y-1.5">
                {bySede.map(([name, v]) => (
                  <Bar key={name} label={name.split(',')[0]} value={v.total} max={maxSede}
                    display={`${fmtCOP(v.total)} (${v.count})`} color="bg-mint" />
                ))}
              </div>
            )}
          </Card>

          <Card title="Horas pico" subtitle="Pedidos entregados según la hora en que se pidieron">
            {byHour.length === 0 ? <p className="text-sm text-muted-fg">Sin datos.</p> : (
              <div className="space-y-1.5">
                {byHour.map(({ h, count }) => (
                  <Bar key={h} label={`${h}:00`} value={count} max={maxHora}
                    display={`${count} pedido${count !== 1 ? 's' : ''}`} color="bg-mustard" />
                ))}
              </div>
            )}
          </Card>
        </div>

        <Card title="Productos más vendidos" subtitle="Leído del detalle de cada pedido (aproximado)">
          {topProducts.length === 0 ? <p className="text-sm text-muted-fg">Sin datos.</p> : (
            <div className="space-y-1.5">
              {topProducts.map(([name, qty]) => (
                <div key={name} className="flex items-center gap-2 text-sm">
                  <div className="flex-1 min-w-0">
                    <p className="text-xs text-coal truncate">{name}</p>
                    <div className="bg-gray-100 rounded-full h-3 overflow-hidden mt-0.5">
                      <div className="bg-cherry h-3 rounded-full" style={{ width: `${(qty / maxProd) * 100}%` }} />
                    </div>
                  </div>
                  <span className="w-10 shrink-0 text-xs text-coal font-medium text-right">{qty}</span>
                </div>
              ))}
            </div>
          )}
        </Card>
      </div>
    </div>
  )
}
