import { useState } from 'react'
import {
  collection, query, where, getDocs, doc, addDoc, updateDoc, setDoc,
  Timestamp, serverTimestamp,
} from 'firebase/firestore'
import { db } from '@/services/firebase'
import { useAuthStore } from '@/store/authStore'
import { isSuperAdminEmail } from '@/lib/team'
import { toast } from 'sonner'
import { Search, Gift, Trash2, Lock } from 'lucide-react'

const SEDES = [
  { id: 'santa_lucia', name: 'Santa Lucía' },
  { id: 'santa_teresita', name: 'Santa Teresita' },
]

const LOYALTY_REWARD_NAME = 'Hamburguesa Especial'
const LOYALTY_EXPIRY_MS = 60 * 24 * 60 * 60 * 1000

type SedeLoyalty = { count?: number; totalDelivered?: number; lastCountedDate?: string }
interface Customer {
  id: string; name?: string; email?: string; phone?: string
  loyalty?: Record<string, SedeLoyalty>
}
interface Reward {
  id: string; sedeId: string; status: string; orderId?: string | null
  earnedAt?: { toDate: () => Date }; expiresAt?: { toDate: () => Date }
  redeemedAt?: { toDate: () => Date }; manual?: boolean
}

const STATUS_LABEL: Record<string, { label: string; cls: string }> = {
  available: { label: 'Disponible', cls: 'bg-mint/15 text-mint' },
  redeemed:  { label: 'Canjeado',   cls: 'bg-gray-200 text-gray-600' },
  expired:   { label: 'Vencido',    cls: 'bg-amber-100 text-amber-700' },
  revoked:   { label: 'Anulado',    cls: 'bg-pepper/15 text-pepper' },
}

const fmtDate = (ts?: { toDate: () => Date }) => ts?.toDate ? ts.toDate().toLocaleDateString('es-CO') : '—'

export default function Fidelizacion() {
  const { user } = useAuthStore()
  const canManage = isSuperAdminEmail(user?.email)
  const [search, setSearch]   = useState('')
  const [loading, setLoading] = useState(false)
  const [customer, setCustomer] = useState<Customer | null>(null)
  const [rewards, setRewards]   = useState<Reward[]>([])
  const [editCounts, setEditCounts] = useState<Record<string, string>>({})
  const [searched, setSearched] = useState(false)

  const loadCustomer = async (id: string) => {
    const snap = await getDocs(collection(db, 'customers', id, 'rewards'))
    const list = snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<Reward, 'id'>) }))
    list.sort((a, b) => (b.earnedAt?.toDate?.().getTime() || 0) - (a.earnedAt?.toDate?.().getTime() || 0))
    setRewards(list)
  }

  const handleSearch = async () => {
    const term = search.trim().toLowerCase()
    if (!term) return
    setLoading(true); setSearched(true)
    setCustomer(null); setRewards([]); setEditCounts({})
    try {
      const field = term.includes('@') ? 'email' : 'phone'
      const snap = await getDocs(query(collection(db, 'customers'), where(field, '==', term)))
      if (snap.empty) { toast.error('No se encontró ningún cliente con ese dato'); return }
      const found = { id: snap.docs[0].id, ...(snap.docs[0].data() as Omit<Customer, 'id'>) }
      setCustomer(found)
      await loadCustomer(found.id)
    } catch {
      toast.error('Error al buscar el cliente')
    } finally {
      setLoading(false)
    }
  }

  const saveCount = async (sedeId: string) => {
    if (!customer || !canManage) return
    const value = Number(editCounts[sedeId])
    if (!Number.isFinite(value) || value < 0) { toast.error('Escribe un número válido (0 o más)'); return }
    try {
      await setDoc(doc(db, 'customers', customer.id), { loyalty: { [sedeId]: { count: value } } }, { merge: true })
      setCustomer((c) => c ? { ...c, loyalty: { ...c.loyalty, [sedeId]: { ...c.loyalty?.[sedeId], count: value } } } : c)
      toast.success('Progreso actualizado')
    } catch {
      toast.error('Error al actualizar el progreso')
    }
  }

  const grantReward = async (sedeId: string) => {
    if (!customer || !canManage) return
    const sedeName = SEDES.find((s) => s.id === sedeId)?.name || sedeId
    if (!window.confirm(`¿Otorgar manualmente 1x ${LOYALTY_REWARD_NAME} gratis en ${sedeName}?`)) return
    try {
      await addDoc(collection(db, 'customers', customer.id, 'rewards'), {
        sedeId,
        type:       'hamburguesa_especial',
        earnedAt:   serverTimestamp(),
        expiresAt:  Timestamp.fromMillis(Date.now() + LOYALTY_EXPIRY_MS),
        status:     'available',
        redeemedAt: null,
        orderId:    null,
        notified:   false,
        cycleReset: false,
        manual:     true,
      })
      toast.success('Premio otorgado')
      await loadCustomer(customer.id)
    } catch {
      toast.error('Error al otorgar el premio')
    }
  }

  const revokeReward = async (rewardId: string) => {
    if (!customer || !canManage) return
    if (!window.confirm('¿Anular este premio? El cliente ya no podrá usarlo.')) return
    try {
      await updateDoc(doc(db, 'customers', customer.id, 'rewards', rewardId), {
        status: 'revoked', revokedAt: serverTimestamp(),
      })
      toast.success('Premio anulado')
      await loadCustomer(customer.id)
    } catch {
      toast.error('Error al anular el premio')
    }
  }

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-4xl font-display font-bold text-coal">Fidelización</h1>
        <p className="text-muted-fg mt-1">Progreso y premios de Hamburguesa Especial gratis por cliente y sede</p>
      </div>

      <div className="bg-white border border-gray-200 rounded-lg p-4 mb-8 max-w-xl">
        <h2 className="text-sm font-display font-semibold text-coal mb-2">Buscar cliente</h2>
        <div className="flex gap-2">
          <input
            className="border rounded px-3 py-2 text-sm flex-1"
            placeholder="Correo o teléfono del cliente"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') handleSearch() }}
          />
          <button onClick={handleSearch} disabled={loading} className="bg-primary text-white rounded px-4 py-2 text-sm font-medium flex items-center gap-1.5 disabled:opacity-50">
            <Search className="w-4 h-4" /> {loading ? 'Buscando…' : 'Buscar'}
          </button>
        </div>
      </div>

      {searched && !loading && !customer && (
        <p className="text-muted-fg">No se encontró ningún cliente con ese correo o teléfono.</p>
      )}

      {customer && (
        <div className="flex flex-col gap-6 max-w-3xl">
          <div className="bg-white border border-gray-200 rounded-lg p-4">
            <p className="font-display font-semibold text-coal">{customer.name || 'Sin nombre'}</p>
            <p className="text-sm text-muted-fg">{customer.email || '—'} · {customer.phone || '—'}</p>
          </div>

          {!canManage && (
            <div className="flex items-center gap-2 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 text-xs text-amber-700">
              <Lock className="w-3.5 h-3.5 flex-shrink-0" />
              Solo puedes consultar. Corregir progreso, otorgar y anular premios está reservado a los administradores principales.
            </div>
          )}

          {SEDES.map((sede) => {
            const loy = customer.loyalty?.[sede.id] || {}
            const count = loy.count ?? 0
            const available = rewards.filter((r) => r.sedeId === sede.id && r.status === 'available')
            return (
              <div key={sede.id} className="bg-white border border-gray-200 rounded-lg p-4">
                <div className="flex items-center justify-between mb-2">
                  <p className="font-display font-semibold text-coal">{sede.name}</p>
                  {available.length > 0 && (
                    <span className="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full bg-mint/15 text-mint">
                      {available.length} premio{available.length > 1 ? 's' : ''} disponible{available.length > 1 ? 's' : ''}
                    </span>
                  )}
                </div>
                <div className="flex items-center gap-2 text-sm text-muted-fg mb-3">
                  <span>Progreso: <strong className="text-coal">{count}/10</strong></span>
                  <span>· Total entregados: {loy.totalDelivered ?? 0}</span>
                  <span>· Último contado: {loy.lastCountedDate || '—'}</span>
                </div>
                {canManage && (
                  <div className="flex items-center gap-2">
                    <input
                      type="number"
                      min={0}
                      className="border rounded px-2 py-1.5 text-sm w-24"
                      placeholder={String(count)}
                      value={editCounts[sede.id] ?? ''}
                      onChange={(e) => setEditCounts((c) => ({ ...c, [sede.id]: e.target.value }))}
                    />
                    <button onClick={() => saveCount(sede.id)} className="text-xs font-semibold text-primary border border-primary/30 rounded px-3 py-1.5 hover:bg-primary/5">
                      Corregir progreso
                    </button>
                    <button onClick={() => grantReward(sede.id)} className="text-xs font-semibold text-mint border border-mint/30 rounded px-3 py-1.5 hover:bg-mint/10 flex items-center gap-1 ml-auto">
                      <Gift className="w-3.5 h-3.5" /> Otorgar premio manual
                    </button>
                  </div>
                )}
              </div>
            )
          })}

          <div className="bg-white border border-gray-200 rounded-lg p-4">
            <p className="font-display font-semibold text-coal mb-3">Historial de premios</p>
            {rewards.length === 0 ? (
              <p className="text-sm text-muted-fg">Este cliente todavía no ha ganado ningún premio.</p>
            ) : (
              <div className="flex flex-col gap-2">
                {rewards.map((r) => {
                  const meta = STATUS_LABEL[r.status] || { label: r.status, cls: 'bg-gray-100 text-gray-500' }
                  const sedeName = SEDES.find((s) => s.id === r.sedeId)?.name || r.sedeId
                  return (
                    <div key={r.id} className="flex items-center justify-between gap-3 border border-gray-100 rounded-lg px-3 py-2">
                      <div className="min-w-0">
                        <p className="text-sm font-medium text-coal">
                          {LOYALTY_REWARD_NAME} · {sedeName} {r.manual && <span className="text-[10px] text-muted-fg">(otorgado manual)</span>}
                        </p>
                        <p className="text-xs text-muted-fg">
                          Ganado {fmtDate(r.earnedAt)} · Vence {fmtDate(r.expiresAt)}
                          {r.status === 'redeemed' && ` · Canjeado ${fmtDate(r.redeemedAt)}${r.orderId ? ` (pedido ${r.orderId.slice(0, 6)})` : ''}`}
                        </p>
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        <span className={`text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full ${meta.cls}`}>{meta.label}</span>
                        {r.status === 'available' && canManage && (
                          <button onClick={() => revokeReward(r.id)} title="Anular premio" className="text-pepper hover:bg-pepper/10 rounded p-1">
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        )}
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
