import { useEffect, useMemo, useState } from 'react'
import { collection, onSnapshot, query, orderBy, limit } from 'firebase/firestore'
import { db } from '@/services/firebase'
import { type Order, cashAmount, isCashOrder, fmtCOP } from '@/lib/orders'

// Estados donde el dinero del pedido ya se cobró (o está en manos del
// domiciliario pendiente de entregar en caja). Los rechazados/cancelados
// NO cuentan: ese dinero nunca entró.
const MONEY_STATUSES = ['delivered_paid', 'delivered_cash', 'pending_cuadre', 'completed']

const sameDay = (o: Order, dateStr: string) => {
  if (!o.createdAt?.toDate) return false
  return o.createdAt.toDate().toDateString() === new Date(dateStr + 'T00:00:00').toDateString()
}

// Porción digital del pedido: transferencia/Nequi/Wompi completo, o la parte
// no efectivo de un Mixto.
const digitalAmount = (o: Order): number => {
  if (o.payment === 'Transferencia' || o.payment === 'Nequi' || o.payment === 'Wompi') return o.totalPrice || 0
  if (o.payment === 'Mixto') return Math.max(0, (o.totalPrice || 0) - cashAmount(o))
  return 0
}

const todayStr = () => {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

export default function Cuadre() {
  const [orders, setOrders] = useState<Order[]>([])
  const [date, setDate] = useState(todayStr)

  useEffect(() => {
    const q = query(collection(db, 'orders'), orderBy('createdAt', 'desc'), limit(500))
    return onSnapshot(q, (snap) => {
      setOrders(snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<Order, 'id'>) })))
    }, (err) => console.error('Error al leer pedidos:', err))
  }, [])

  const dayOrders = useMemo(
    () => orders.filter((o) => MONEY_STATUSES.includes(o.status) && sameDay(o, date)),
    [orders, date],
  )

  const bySede = useMemo(() => {
    const groups: Record<string, Order[]> = {}
    dayOrders.forEach((o) => {
      const k = o.sedeName || 'Sin sede'
      ;(groups[k] = groups[k] || []).push(o)
    })
    return Object.entries(groups).sort(([a], [b]) => a.localeCompare(b))
  }, [dayOrders])

  const totCash = dayOrders.filter(isCashOrder).reduce((s, o) => s + cashAmount(o), 0)
  const totDigital = dayOrders.reduce((s, o) => s + digitalAmount(o), 0)
  const totVentas = dayOrders.reduce((s, o) => s + (o.totalPrice || 0), 0)
  const pendientes = dayOrders.filter((o) => o.status === 'pending_cuadre')

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-3 mb-6">
        <div>
          <h1 className="text-4xl font-display font-bold text-coal">Cuadre de caja</h1>
          <p className="text-muted-fg mt-1">Efectivo y pagos digitales del día, por sede y domiciliario</p>
        </div>
        <input
          type="date"
          value={date}
          max={todayStr()}
          onChange={(e) => setDate(e.target.value)}
          className="border rounded px-3 py-1.5 text-sm"
        />
      </div>

      {/* Totales del día */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-6">
        <div className="bg-white border border-gray-200 rounded-lg p-4">
          <p className="text-sm text-muted-fg">Pedidos cobrados</p>
          <p className="text-2xl font-display font-bold text-coal">{dayOrders.length}</p>
        </div>
        <div className="bg-white border border-gray-200 rounded-lg p-4">
          <p className="text-sm text-muted-fg">Ventas totales</p>
          <p className="text-2xl font-display font-bold text-coal">{fmtCOP(totVentas)}</p>
        </div>
        <div className="bg-white border border-gray-200 rounded-lg p-4">
          <p className="text-sm text-muted-fg">💵 Efectivo</p>
          <p className="text-2xl font-display font-bold text-mustard">{fmtCOP(totCash)}</p>
        </div>
        <div className="bg-white border border-gray-200 rounded-lg p-4">
          <p className="text-sm text-muted-fg">📲 Digital (transf./Nequi)</p>
          <p className="text-2xl font-display font-bold text-mint">{fmtCOP(totDigital)}</p>
        </div>
      </div>

      {pendientes.length > 0 && (
        <div className="bg-amber-50 border border-amber-200 rounded-lg px-4 py-3 mb-6 text-sm text-amber-800">
          ⚠️ Hay <strong>{pendientes.length}</strong> pedido{pendientes.length > 1 ? 's' : ''} en efectivo aún{' '}
          <strong>pendiente{pendientes.length > 1 ? 's' : ''} de cuadre</strong> — ese dinero (
          {fmtCOP(pendientes.reduce((s, o) => s + cashAmount(o), 0))}) todavía está en manos de los domiciliarios.
        </div>
      )}

      {dayOrders.length === 0 ? (
        <p className="text-muted-fg">No hay pedidos cobrados en esta fecha (se revisan los últimos 500 pedidos).</p>
      ) : (
        <div className="space-y-6">
          {bySede.map(([sedeName, list]) => {
            const cash = list.filter(isCashOrder)
            const cashTotal = cash.reduce((s, o) => s + cashAmount(o), 0)
            const cashPend = cash.filter((o) => o.status === 'pending_cuadre')
            const digital = list.reduce((s, o) => s + digitalAmount(o), 0)
            const domis = list.reduce((s, o) => s + (o.deliveryPrice || 0), 0)

            const byDriver: Record<string, Order[]> = {}
            cash.forEach((o) => {
              const k = o.driverName || 'Sin domiciliario'
              ;(byDriver[k] = byDriver[k] || []).push(o)
            })

            return (
              <div key={sedeName} className="bg-white border border-gray-200 rounded-lg p-5">
                <div className="flex flex-wrap items-center justify-between gap-2 mb-4">
                  <p className="font-display text-xl font-bold text-coal">📍 {sedeName}</p>
                  <p className="text-sm text-muted-fg">{list.length} pedidos · domicilios {fmtCOP(domis)}</p>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-4">
                  <div className="bg-mustard/10 border border-mustard/30 rounded-lg px-4 py-3">
                    <p className="text-xs text-muted-fg">💵 Efectivo del día</p>
                    <p className="text-xl font-display font-bold text-mustard">{fmtCOP(cashTotal)}</p>
                    {cashPend.length > 0 && (
                      <p className="text-xs text-cherry mt-0.5">
                        Pendiente: {fmtCOP(cashPend.reduce((s, o) => s + cashAmount(o), 0))} ({cashPend.length})
                      </p>
                    )}
                  </div>
                  <div className="bg-mint/10 border border-mint/30 rounded-lg px-4 py-3">
                    <p className="text-xs text-muted-fg">📲 Digital</p>
                    <p className="text-xl font-display font-bold text-mint">{fmtCOP(digital)}</p>
                  </div>
                  <div className="bg-gray-50 border border-gray-200 rounded-lg px-4 py-3">
                    <p className="text-xs text-muted-fg">Ventas de la sede</p>
                    <p className="text-xl font-display font-bold text-coal">
                      {fmtCOP(list.reduce((s, o) => s + (o.totalPrice || 0), 0))}
                    </p>
                  </div>
                </div>

                {Object.keys(byDriver).length > 0 && (
                  <>
                    <p className="text-xs font-bold uppercase tracking-wider text-muted-fg mb-2">
                      Efectivo por domiciliario
                    </p>
                    <div className="space-y-1.5">
                      {Object.entries(byDriver)
                        .sort(([a], [b]) => a.localeCompare(b))
                        .map(([driver, dOrders]) => {
                          const dTotal = dOrders.reduce((s, o) => s + cashAmount(o), 0)
                          const dPend = dOrders.filter((o) => o.status === 'pending_cuadre')
                          return (
                            <div key={driver} className="flex items-center justify-between text-sm border border-gray-100 rounded-lg px-3 py-2">
                              <span className="text-coal">🛵 {driver} <span className="text-muted-fg">({dOrders.length})</span></span>
                              <span className="font-semibold text-coal">
                                {fmtCOP(dTotal)}
                                {dPend.length > 0 && (
                                  <span className="text-cherry font-normal text-xs ml-2">
                                    (pdte. {fmtCOP(dPend.reduce((s, o) => s + cashAmount(o), 0))})
                                  </span>
                                )}
                              </span>
                            </div>
                          )
                        })}
                    </div>
                  </>
                )}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
