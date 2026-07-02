import { useEffect, useMemo, useState } from 'react'
import { collection, onSnapshot } from 'firebase/firestore'
import type { Timestamp } from 'firebase/firestore'
import { db } from '@/services/firebase'
import { Search, Phone } from 'lucide-react'
import { ClienteDetailModal, type Customer } from '@/components/ClienteDetailModal'

const fmtDate = (ts?: Timestamp) =>
  ts?.toDate ? ts.toDate().toLocaleDateString('es-CO', { day: '2-digit', month: 'short', year: 'numeric' }) : '—'

const SEDE_NAMES: Record<string, string> = {
  santa_lucia: 'Santa Lucía',
  santa_teresita: 'Santa Teresita',
}

type SortBy = 'recent' | 'orders' | 'name'

export default function Clientes() {
  const [customers, setCustomers] = useState<Customer[]>([])
  const [search, setSearch] = useState('')
  const [sortBy, setSortBy] = useState<SortBy>('recent')
  const [minOrders, setMinOrders] = useState('')
  const [loading, setLoading] = useState(true)
  const [selected, setSelected] = useState<Customer | null>(null)

  useEffect(() => {
    return onSnapshot(collection(db, 'customers'), (snap) => {
      const docs = snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<Customer, 'id'>) }))
      setCustomers(docs)
      setLoading(false)
    }, (err) => { console.error('Error al leer clientes:', err); setLoading(false) })
  }, [])

  const filtered = useMemo(() => {
    const q = search.toLowerCase().trim()
    const min = Number(minOrders) || 0
    let list = customers.filter((c) => {
      if ((c.orderCount || 0) < min) return false
      if (!q) return true
      return c.name?.toLowerCase().includes(q) || c.phone?.includes(q) || c.email?.toLowerCase().includes(q)
    })
    list = [...list].sort((a, b) => {
      if (sortBy === 'orders') return (b.orderCount || 0) - (a.orderCount || 0)
      if (sortBy === 'name') return (a.name || '').localeCompare(b.name || '')
      return (b.lastOrderAt?.seconds || 0) - (a.lastOrderAt?.seconds || 0)
    })
    return list
  }, [customers, search, sortBy, minOrders])

  const totalOrders = customers.reduce((s, c) => s + (c.orderCount || 0), 0)

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-4xl font-display font-bold text-coal">Clientes</h1>
        <p className="text-muted-fg mt-1">Clientes frecuentes, su progreso de fidelización y su historial de pedidos</p>
      </div>

      {/* Resumen */}
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-4 mb-6">
        <div className="bg-white border border-gray-200 rounded-lg p-4">
          <p className="text-sm text-muted-fg">Clientes</p>
          <p className="text-2xl font-display font-bold text-coal">{customers.length}</p>
        </div>
        <div className="bg-white border border-gray-200 rounded-lg p-4">
          <p className="text-sm text-muted-fg">Pedidos acumulados</p>
          <p className="text-2xl font-display font-bold text-mint">{totalOrders}</p>
        </div>
      </div>

      {/* Filtros */}
      <div className="bg-white border border-gray-200 rounded-lg p-3 mb-6 flex flex-wrap items-center gap-2 max-w-3xl">
        <div className="flex items-center gap-2 flex-1 min-w-[220px]">
          <Search className="w-4 h-4 text-muted-fg shrink-0" />
          <input
            className="text-sm w-full outline-none"
            placeholder="Buscar por nombre, teléfono o correo…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <select value={sortBy} onChange={(e) => setSortBy(e.target.value as SortBy)} className="border rounded px-2 py-1.5 text-sm">
          <option value="recent">Más recientes</option>
          <option value="orders">Más pedidos</option>
          <option value="name">Nombre (A-Z)</option>
        </select>
        <input
          type="number"
          min={0}
          value={minOrders}
          onChange={(e) => setMinOrders(e.target.value)}
          placeholder="Mín. pedidos"
          className="border rounded px-2 py-1.5 text-sm w-28"
        />
      </div>

      {loading ? (
        <p className="text-muted-fg">Cargando clientes…</p>
      ) : filtered.length === 0 ? (
        <p className="text-muted-fg">{search || minOrders ? 'Sin resultados para ese filtro.' : 'Aún no hay clientes registrados.'}</p>
      ) : (
        <div className="space-y-2 max-w-3xl">
          <p className="text-xs text-muted-fg">{filtered.length} cliente{filtered.length !== 1 ? 's' : ''}</p>
          {filtered.map((c) => {
            const lastAddress = c.addresses?.length ? c.addresses[c.addresses.length - 1] : null
            const loyaltyChips = Object.entries(c.loyalty || {})
              .filter(([, v]) => (v.totalDelivered || 0) > 0)
              .map(([sedeId, v]) => `${SEDE_NAMES[sedeId] || sedeId}: ${v.count ?? 0}/10`)
            return (
              <div
                key={c.id}
                onClick={() => setSelected(c)}
                className="bg-white border border-gray-200 rounded-lg p-4 flex items-start gap-3 cursor-pointer hover:border-primary/40 hover:shadow-sm"
              >
                <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center shrink-0 font-display font-bold text-primary">
                  {(c.name || 'C').charAt(0).toUpperCase()}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-semibold text-sm text-coal">{c.name || 'Sin nombre'}</p>
                  <div className="flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs text-muted-fg mt-0.5">
                    {c.phone && (
                      <a href={`tel:${c.phone}`} onClick={(e) => e.stopPropagation()} className="flex items-center gap-1 text-primary font-medium">
                        <Phone className="w-3 h-3" /> {c.phone}
                      </a>
                    )}
                    {c.email && <span className="truncate">{c.email}</span>}
                  </div>
                  {lastAddress && <p className="text-xs text-muted-fg mt-0.5 truncate">📍 {lastAddress}</p>}
                  {loyaltyChips.length > 0 && (
                    <p className="text-xs text-mint font-medium mt-0.5">🎁 {loyaltyChips.join(' · ')}</p>
                  )}
                </div>
                <div className="text-right shrink-0">
                  <p className="font-display text-lg font-bold text-coal">{c.orderCount || 0}</p>
                  <p className="text-[10px] uppercase tracking-wider text-muted-fg">pedidos</p>
                  <p className="text-xs text-muted-fg mt-1">Últ.: {fmtDate(c.lastOrderAt)}</p>
                </div>
              </div>
            )
          })}
        </div>
      )}

      {selected && <ClienteDetailModal customer={selected} onClose={() => setSelected(null)} />}
    </div>
  )
}
