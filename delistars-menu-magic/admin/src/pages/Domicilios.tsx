import { useEffect, useMemo, useState } from 'react'
import { collection, onSnapshot, query, orderBy, limit } from 'firebase/firestore'
import { db } from '@/services/firebase'
import { type Order, DELIVERED_STATUSES, isToday, fmtCOP, fmtDateTime, statusInfo } from '@/lib/orders'

export default function Domicilios() {
  const [orders, setOrders] = useState<Order[]>([])
  const [soloHoy, setSoloHoy] = useState(true)
  const [sede, setSede] = useState<string>('')

  useEffect(() => {
    const q = query(collection(db, 'orders'), orderBy('createdAt', 'desc'), limit(500))
    return onSnapshot(q, (snap) => {
      setOrders(snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<Order, 'id'>) })))
    }, (err) => console.error('Error al leer pedidos:', err))
  }, [])

  const sedes = useMemo(
    () => Array.from(new Set(orders.map((o) => o.sedeName).filter(Boolean))) as string[],
    [orders]
  )

  const filtered = orders.filter((o) => {
    if (soloHoy && !isToday(o.createdAt)) return false
    if (sede && o.sedeName !== sede) return false
    return true
  })

  const entregados = filtered.filter((o) => DELIVERED_STATUSES.includes(o.status))
  const ingresos = entregados.reduce((s, o) => s + (o.totalPrice || 0), 0)
  const domicilios = entregados.reduce((s, o) => s + (o.deliveryPrice || 0), 0)

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-3 mb-8">
        <div>
          <h1 className="text-4xl font-display font-bold text-coal">Domicilios</h1>
          <p className="text-muted-fg mt-1">Pedidos y reportes</p>
        </div>
        <div className="flex items-center gap-2">
          <select value={sede} onChange={(e) => setSede(e.target.value)} className="border rounded px-2 py-1 text-sm">
            <option value="">Todas las sedes</option>
            {sedes.map((s) => <option key={s} value={s}>{s}</option>)}
          </select>
          <button
            onClick={() => setSoloHoy((v) => !v)}
            className={`px-3 py-1 rounded text-sm font-medium ${soloHoy ? 'bg-primary text-white' : 'border text-coal'}`}
          >
            {soloHoy ? 'Hoy' : 'Todo'}
          </button>
        </div>
      </div>

      {/* Reportes */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-8">
        <div className="bg-white border border-gray-200 rounded-lg p-4">
          <p className="text-sm text-muted-fg">Pedidos</p>
          <p className="text-2xl font-display font-bold text-coal">{filtered.length}</p>
        </div>
        <div className="bg-white border border-gray-200 rounded-lg p-4">
          <p className="text-sm text-muted-fg">Ingresos (entregados)</p>
          <p className="text-2xl font-display font-bold text-mint">{fmtCOP(ingresos)}</p>
        </div>
        <div className="bg-white border border-gray-200 rounded-lg p-4">
          <p className="text-sm text-muted-fg">Domicilios cobrados</p>
          <p className="text-2xl font-display font-bold text-tangelo">{fmtCOP(domicilios)}</p>
        </div>
      </div>

      {/* Lista de pedidos */}
      {filtered.length === 0 ? (
        <p className="text-muted-fg">No hay pedidos para el filtro seleccionado.</p>
      ) : (
        <div className="space-y-3">
          {filtered.map((o) => {
            const s = statusInfo(o.status)
            return (
              <div key={o.id} className="bg-white border border-gray-200 rounded-lg p-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="font-semibold text-coal">
                      {o.orderNumber && <span className="text-cherry mr-2">#{o.orderNumber}</span>}
                      {o.name || o.clientName || '—'}
                      {o.sedeName && <span className="text-xs text-muted-fg font-normal ml-2">{o.sedeName}</span>}
                    </p>
                    <p className="text-sm text-muted-fg truncate">
                      {o.deliveryMode === 'pickup' ? '🏪 Recoge en sede' : (o.fullAddress || '—')}
                    </p>
                    <p className="text-xs text-muted-fg mt-0.5">{fmtDateTime(o.createdAt)} · {o.payment || '—'}</p>
                  </div>
                  <div className="text-right shrink-0">
                    <span className={`px-3 py-1 rounded-full text-xs font-semibold ${s.cls}`}>{s.label}</span>
                    {(o.totalPrice || 0) > 0 && (
                      <p className="font-display text-lg text-coal mt-1">{fmtCOP(o.totalPrice)}</p>
                    )}
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
