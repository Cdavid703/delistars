import { useEffect, useState } from 'react'
import {
  collection, query, where, getDocs, doc, addDoc, updateDoc, setDoc,
  Timestamp, serverTimestamp,
} from 'firebase/firestore'
import type { Timestamp as TimestampType } from 'firebase/firestore'
import { db } from '@/services/firebase'
import { useAuthStore } from '@/store/authStore'
import { isSuperAdminEmail } from '@/lib/team'
import { type Order, DELIVERED_STATUSES, CLOSED_STATUSES, fmtCOP, fmtDateTime, statusInfo } from '@/lib/orders'
import { OrderDetailModal } from '@/components/OrderDetailModal'
import { toast } from 'sonner'
import { Gift, Lock, Phone, Trash2, X } from 'lucide-react'

const SEDES = [
  { id: 'santa_lucia', name: 'Santa Lucía' },
  { id: 'santa_teresita', name: 'Santa Teresita' },
]

// Debe coincidir con LOYALTY_REWARD.name de src/services/firebase.js (domicilios)
const LOYALTY_REWARD_NAME = 'Hamburguesa Especial + Perro Grande con tocineta'
const LOYALTY_EXPIRY_MS = 60 * 24 * 60 * 60 * 1000

type SedeLoyalty = { count?: number; totalDelivered?: number; lastCountedDate?: string }
export interface Customer {
  id: string
  name?: string
  email?: string
  phone?: string
  addresses?: string[]
  orderCount?: number
  lastOrderAt?: TimestampType
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

// El status del documento puede seguir en 'available' aunque ya venció (no hay
// proceso que lo actualice solo) — hay que chequear también la fecha.
const isLive = (r: Reward) => r.status === 'available' && (!r.expiresAt?.toDate || r.expiresAt.toDate().getTime() > Date.now())
const statusOf = (r: Reward) => (r.status === 'available' && !isLive(r)) ? 'expired' : r.status

export function ClienteDetailModal({ customer, onClose }: { customer: Customer; onClose: () => void }) {
  const { user } = useAuthStore()
  const canManage = isSuperAdminEmail(user?.email)

  const [rewards, setRewards] = useState<Reward[]>([])
  const [editCounts, setEditCounts] = useState<Record<string, string>>({})
  const [orders, setOrders] = useState<Order[]>([])
  const [ordersLoading, setOrdersLoading] = useState(true)
  const [selectedOrder, setSelectedOrder] = useState<Order | null>(null)

  const loadRewards = async () => {
    const snap = await getDocs(collection(db, 'customers', customer.id, 'rewards'))
    const list = snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<Reward, 'id'>) }))
    list.sort((a, b) => (b.earnedAt?.toDate?.().getTime() || 0) - (a.earnedAt?.toDate?.().getTime() || 0))
    setRewards(list)
  }

  useEffect(() => {
    loadRewards()
    // Sin orderBy en la query para no requerir un índice compuesto nuevo
    // (mismo patrón que ClientPanel.jsx: filtra por clientUid, ordena en JS).
    getDocs(query(collection(db, 'orders'), where('clientUid', '==', customer.id)))
      .then((snap) => {
        const list = snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<Order, 'id'>) }))
        list.sort((a, b) => (b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0))
        setOrders(list)
      })
      .catch((err) => console.error('Error al leer pedidos del cliente:', err))
      .finally(() => setOrdersLoading(false))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [customer.id])

  const saveCount = async (sedeId: string) => {
    if (!canManage) return
    const value = Number(editCounts[sedeId])
    if (!Number.isFinite(value) || value < 0) { toast.error('Escribe un número válido (0 o más)'); return }
    try {
      await setDoc(doc(db, 'customers', customer.id), { loyalty: { [sedeId]: { count: value } } }, { merge: true })
      toast.success('Progreso actualizado')
    } catch {
      toast.error('Error al actualizar el progreso')
    }
  }

  const grantReward = async (sedeId: string) => {
    if (!canManage) return
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
      await loadRewards()
    } catch {
      toast.error('Error al otorgar el premio')
    }
  }

  const revokeReward = async (rewardId: string) => {
    if (!canManage) return
    if (!window.confirm('¿Anular este premio? El cliente ya no podrá usarlo.')) return
    try {
      await updateDoc(doc(db, 'customers', customer.id, 'rewards', rewardId), {
        status: 'revoked', revokedAt: serverTimestamp(),
      })
      toast.success('Premio anulado')
      await loadRewards()
    } catch {
      toast.error('Error al anular el premio')
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
      onClick={(e) => { if (e.target === e.currentTarget) onClose() }}
    >
      <div className="bg-white rounded-xl shadow-xl w-full max-w-2xl max-h-[90vh] overflow-y-auto">
        <div className="sticky top-0 bg-white border-b border-gray-200 px-5 py-4 flex items-center justify-between">
          <div>
            <p className="font-display text-xl font-bold text-coal">{customer.name || 'Sin nombre'}</p>
            <div className="flex items-center gap-3 text-xs text-muted-fg mt-0.5">
              {customer.phone && <span className="flex items-center gap-1"><Phone className="w-3 h-3" /> {customer.phone}</span>}
              {customer.email && <span>{customer.email}</span>}
            </div>
          </div>
          <button onClick={onClose} className="p-1.5 rounded hover:bg-gray-100 text-coal/60"><X className="w-5 h-5" /></button>
        </div>

        <div className="p-5 flex flex-col gap-6">
          {!canManage && (
            <div className="flex items-center gap-2 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 text-xs text-amber-700">
              <Lock className="w-3.5 h-3.5 flex-shrink-0" />
              Solo puedes consultar la fidelización. Corregir progreso, otorgar y anular premios está reservado a los administradores principales.
            </div>
          )}

          {/* Fidelización por sede */}
          <div className="flex flex-col gap-3">
            <p className="font-display font-semibold text-coal">Fidelización</p>
            {SEDES.map((sede) => {
              const loy = customer.loyalty?.[sede.id] || {}
              const count = loy.count ?? 0
              const available = rewards.filter((r) => r.sedeId === sede.id && isLive(r))
              return (
                <div key={sede.id} className="border border-gray-200 rounded-lg p-3">
                  <div className="flex items-center justify-between mb-1.5">
                    <p className="text-sm font-semibold text-coal">{sede.name}</p>
                    {available.length > 0 && (
                      <span className="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full bg-mint/15 text-mint">
                        {available.length} premio{available.length > 1 ? 's' : ''} disponible{available.length > 1 ? 's' : ''}
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-2 text-xs text-muted-fg mb-2">
                    <span>Progreso: <strong className="text-coal">{count}/10</strong></span>
                    <span>· Entregados: {loy.totalDelivered ?? 0}</span>
                    <span>· Último: {loy.lastCountedDate || '—'}</span>
                  </div>
                  {canManage && (
                    <div className="flex items-center gap-2">
                      <input
                        type="number"
                        min={0}
                        className="border rounded px-2 py-1 text-sm w-20"
                        placeholder={String(count)}
                        value={editCounts[sede.id] ?? ''}
                        onChange={(e) => setEditCounts((c) => ({ ...c, [sede.id]: e.target.value }))}
                      />
                      <button onClick={() => saveCount(sede.id)} className="text-xs font-semibold text-primary border border-primary/30 rounded px-2.5 py-1 hover:bg-primary/5">
                        Corregir
                      </button>
                      <button onClick={() => grantReward(sede.id)} className="text-xs font-semibold text-mint border border-mint/30 rounded px-2.5 py-1 hover:bg-mint/10 flex items-center gap-1 ml-auto">
                        <Gift className="w-3.5 h-3.5" /> Otorgar premio
                      </button>
                    </div>
                  )}
                </div>
              )
            })}

            {rewards.length > 0 && (
              <div className="flex flex-col gap-1.5">
                <p className="text-xs font-bold uppercase tracking-wider text-muted-fg">Historial de premios</p>
                {rewards.map((r) => {
                  const status = statusOf(r)
                  const meta = STATUS_LABEL[status] || { label: status, cls: 'bg-gray-100 text-gray-500' }
                  const sedeName = SEDES.find((s) => s.id === r.sedeId)?.name || r.sedeId
                  return (
                    <div key={r.id} className="flex items-center justify-between gap-3 border border-gray-100 rounded-lg px-3 py-2">
                      <div className="min-w-0">
                        <p className="text-xs font-medium text-coal">
                          {LOYALTY_REWARD_NAME} · {sedeName} {r.manual && <span className="text-[10px] text-muted-fg">(manual)</span>}
                        </p>
                        <p className="text-[11px] text-muted-fg">
                          Ganado {fmtDate(r.earnedAt)} · Vence {fmtDate(r.expiresAt)}
                          {r.status === 'redeemed' && ` · Canjeado ${fmtDate(r.redeemedAt)}`}
                        </p>
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        <span className={`text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full ${meta.cls}`}>{meta.label}</span>
                        {isLive(r) && canManage && (
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

          {/* Pedidos del cliente */}
          <div className="flex flex-col gap-2">
            <p className="font-display font-semibold text-coal">Pedidos ({orders.length})</p>
            {ordersLoading ? (
              <p className="text-sm text-muted-fg">Cargando pedidos…</p>
            ) : orders.length === 0 ? (
              <p className="text-sm text-muted-fg">Este cliente aún no ha hecho pedidos.</p>
            ) : (
              <>
                {(() => {
                  const completados = orders.filter((o) => DELIVERED_STATUSES.includes(o.status)).length
                  const cerrados = orders.filter((o) => CLOSED_STATUSES.includes(o.status)).length
                  const enCurso = orders.length - completados - cerrados
                  // El total (orders.length) incluye TODOS los intentos, no solo los
                  // que se entregaron — este desglose evita la confusión de "por qué
                  // aparecen tantos pedidos si solo se completó uno".
                  return (
                    <p className="text-xs text-muted-fg -mt-1">
                      {completados} completado{completados !== 1 ? 's' : ''}
                      {cerrados > 0 && ` · ${cerrados} rechazado${cerrados !== 1 ? 's' : ''}/cancelado${cerrados !== 1 ? 's' : ''}`}
                      {enCurso > 0 && ` · ${enCurso} en curso`}
                    </p>
                  )
                })()}
                <div className="flex flex-col gap-1.5 max-h-72 overflow-y-auto">
                {orders.map((o) => {
                  const s = statusInfo(o.status)
                  return (
                    <button
                      key={o.id}
                      onClick={() => setSelectedOrder(o)}
                      className="flex items-center justify-between gap-3 border border-gray-100 rounded-lg px-3 py-2 text-left hover:border-primary/40 hover:bg-gray-50"
                    >
                      <div className="min-w-0">
                        <p className="text-sm text-coal">
                          {o.orderNumber && <span className="text-cherry font-semibold mr-1.5">#{o.orderNumber}</span>}
                          {o.sedeName || '—'}
                        </p>
                        <p className="text-xs text-muted-fg">{fmtDateTime(o.createdAt)}</p>
                      </div>
                      <div className="text-right shrink-0">
                        <span className={`px-2 py-0.5 rounded-full text-[10px] font-semibold ${s.cls}`}>{s.label}</span>
                        {(o.totalPrice || 0) > 0 && <p className="text-sm font-semibold text-coal mt-0.5">{fmtCOP(o.totalPrice)}</p>}
                      </div>
                    </button>
                  )
                })}
                </div>
              </>
            )}
          </div>
        </div>
      </div>

      {selectedOrder && <OrderDetailModal order={selectedOrder} onClose={() => setSelectedOrder(null)} />}
    </div>
  )
}
