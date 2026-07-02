import { useEffect, useMemo, useState } from 'react'
import { collection, onSnapshot, query, orderBy, limit } from 'firebase/firestore'
import { db } from '@/services/firebase'
import { type Order, fmtDateTime } from '@/lib/orders'

const Stars = ({ n }: { n: number }) => (
  <span className="text-mustard tracking-tight">{'★'.repeat(n)}<span className="text-gray-300">{'★'.repeat(5 - n)}</span></span>
)

const avg = (arr: Order[]) =>
  arr.length ? arr.reduce((s, o) => s + (o.rating || 0), 0) / arr.length : 0

export default function Calificaciones() {
  const [orders, setOrders] = useState<Order[]>([])
  const [sede, setSede] = useState('')
  const [soloComentarios, setSoloComentarios] = useState(false)

  // Mismo patrón que Domicilios: últimos 500 pedidos, filtro en el cliente
  // (evita índices compuestos nuevos en Firestore).
  useEffect(() => {
    const q = query(collection(db, 'orders'), orderBy('createdAt', 'desc'), limit(500))
    return onSnapshot(q, (snap) => {
      setOrders(snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<Order, 'id'>) })))
    }, (err) => console.error('Error al leer pedidos:', err))
  }, [])

  const rated = useMemo(
    () => orders
      .filter((o) => (o.rating || 0) > 0)
      .sort((a, b) => (b.ratedAt?.seconds || b.createdAt?.seconds || 0) - (a.ratedAt?.seconds || a.createdAt?.seconds || 0)),
    [orders],
  )

  const sedes = useMemo(
    () => Array.from(new Set(rated.map((o) => o.sedeName).filter(Boolean) as string[])).sort(),
    [rated],
  )

  const filtered = rated.filter((o) => {
    if (sede && o.sedeName !== sede) return false
    if (soloComentarios && !o.ratingComment) return false
    return true
  })

  // Distribución 5★..1★ y promedios por sede / domiciliario
  const dist = [5, 4, 3, 2, 1].map((n) => ({
    n,
    count: filtered.filter((o) => o.rating === n).length,
  }))
  const maxDist = Math.max(1, ...dist.map((d) => d.count))

  const byDriver = useMemo(() => {
    const groups: Record<string, Order[]> = {}
    filtered.forEach((o) => {
      const k = o.driverName || 'Sin domiciliario'
      ;(groups[k] = groups[k] || []).push(o)
    })
    return Object.entries(groups)
      .map(([name, list]) => ({ name, count: list.length, avg: avg(list) }))
      .sort((a, b) => b.count - a.count)
  }, [filtered])

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-3 mb-6">
        <div>
          <h1 className="text-4xl font-display font-bold text-coal">Calificaciones</h1>
          <p className="text-muted-fg mt-1">Lo que los clientes opinan de sus pedidos (últimos 500 pedidos)</p>
        </div>
        <div className="flex items-center gap-2">
          <select value={sede} onChange={(e) => setSede(e.target.value)} className="border rounded px-2 py-1 text-sm">
            <option value="">Todas las sedes</option>
            {sedes.map((s) => <option key={s} value={s}>{s}</option>)}
          </select>
          <button
            onClick={() => setSoloComentarios((v) => !v)}
            className={`px-3 py-1 rounded text-sm font-medium ${soloComentarios ? 'bg-primary text-white' : 'border text-coal'}`}
          >
            Con comentario
          </button>
        </div>
      </div>

      {/* Resumen */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-6">
        <div className="bg-white border border-gray-200 rounded-lg p-4">
          <p className="text-sm text-muted-fg">Promedio</p>
          <p className="text-2xl font-display font-bold text-coal">
            {filtered.length ? avg(filtered).toFixed(1) : '—'} <span className="text-mustard text-lg">★</span>
          </p>
        </div>
        <div className="bg-white border border-gray-200 rounded-lg p-4">
          <p className="text-sm text-muted-fg">Calificaciones</p>
          <p className="text-2xl font-display font-bold text-coal">{filtered.length}</p>
        </div>
        <div className="bg-white border border-gray-200 rounded-lg p-4">
          <p className="text-sm text-muted-fg">Con comentario</p>
          <p className="text-2xl font-display font-bold text-coal">{filtered.filter((o) => o.ratingComment).length}</p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-8">
        {/* Distribución */}
        <div className="bg-white border border-gray-200 rounded-lg p-4">
          <p className="font-display font-semibold text-coal mb-3">Distribución</p>
          <div className="space-y-1.5">
            {dist.map((d) => (
              <div key={d.n} className="flex items-center gap-2 text-sm">
                <span className="w-8 text-right text-muted-fg">{d.n}★</span>
                <div className="flex-1 bg-gray-100 rounded-full h-3 overflow-hidden">
                  <div className="bg-mustard h-3 rounded-full" style={{ width: `${(d.count / maxDist) * 100}%` }} />
                </div>
                <span className="w-8 text-muted-fg">{d.count}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Por domiciliario */}
        <div className="bg-white border border-gray-200 rounded-lg p-4">
          <p className="font-display font-semibold text-coal mb-3">Por domiciliario</p>
          {byDriver.length === 0 ? (
            <p className="text-sm text-muted-fg">Sin datos aún.</p>
          ) : (
            <div className="space-y-1.5">
              {byDriver.map((d) => (
                <div key={d.name} className="flex items-center justify-between text-sm">
                  <span className="text-coal truncate">{d.name}</span>
                  <span className="text-muted-fg shrink-0 ml-3">
                    {d.avg.toFixed(1)} <span className="text-mustard">★</span> · {d.count}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Lista */}
      <p className="font-display font-semibold text-coal mb-3">Calificaciones recientes</p>
      {filtered.length === 0 ? (
        <p className="text-muted-fg">Todavía no hay calificaciones para este filtro.</p>
      ) : (
        <div className="space-y-2 max-w-3xl">
          {filtered.map((o) => (
            <div key={o.id} className="bg-white border border-gray-200 rounded-lg p-4">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-coal">
                    <Stars n={o.rating || 0} />
                    <span className="ml-2">{o.name || o.clientName || '—'}</span>
                    {o.orderNumber && <span className="text-cherry ml-2">#{o.orderNumber}</span>}
                  </p>
                  {o.ratingComment && (
                    <p className="text-sm text-coal/80 mt-1 italic">"{o.ratingComment}"</p>
                  )}
                  <p className="text-xs text-muted-fg mt-1">
                    {o.sedeName || '—'}{o.driverName ? ` · 🛵 ${o.driverName}` : ''} · {fmtDateTime(o.ratedAt || o.createdAt)}
                  </p>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
