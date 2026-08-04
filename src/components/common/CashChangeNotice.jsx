import { Banknote } from 'lucide-react'
import { cashAmount } from '../../utils/payments'

const fmt = v => (v !== undefined && v !== null && v !== '') ? `$${Number(v).toLocaleString('es-CO')}` : '—'

// Aviso DESTACADO del billete con el que paga el cliente y el cambio a llevar.
// Antes esta información vivía enterrada dentro del bloque de precios y solo
// usaba lo que el cajero hubiera registrado (payAmount): si el cajero no lo
// llenaba, lo que el cliente había indicado (cashBillAmount) se perdía y el
// domiciliario salía sin saber cuánto cambio llevar.
export default function CashChangeNotice({ order, className = '' }) {
  const esEfectivo = order.cashOnDelivery || order.payment === 'Efectivo' || order.payment === 'Mixto'
  if (!esEfectivo) return null

  // El dato del cajero manda; si no lo registró, se usa el que dio el cliente.
  const billete = order.payAmount ?? order.cashBillAmount ?? null
  const cambio  = order.change   ?? order.cashChange   ?? null
  // Lo que realmente se cobra en efectivo (en Mixto solo esa porción).
  const aCobrar = cashAmount(order)

  const pagaExacto = order.payExact === true || (billete == null && cambio == null)

  return (
    <div className={`rounded-2xl border-2 border-mustard bg-mustard/15 p-4 flex flex-col gap-2 ${className}`}>
      <div className="flex items-center gap-2">
        <Banknote size={18} className="text-mustard flex-shrink-0" />
        <p className="font-display text-base tracking-wide text-coal">
          💵 Efectivo — {order.payment === 'Mixto' ? 'pago mixto' : 'contra entrega'}
        </p>
      </div>

      <div className="flex justify-between font-body text-sm">
        <span className="text-coal/70">A cobrar en efectivo:</span>
        <span className="font-bold text-coal">{fmt(aCobrar)}</span>
      </div>

      {pagaExacto ? (
        <p className="font-body text-sm font-semibold text-mint">✓ El cliente paga exacto — no se necesita cambio</p>
      ) : (
        <>
          <div className="flex justify-between font-body text-sm">
            <span className="text-coal/70">El cliente paga con:</span>
            <span className="font-semibold text-coal">{fmt(billete)}</span>
          </div>
          <div className="flex justify-between items-center bg-cream/70 rounded-xl px-3 py-2">
            <span className="font-body text-sm font-bold text-coal">Cambio a llevar:</span>
            <span className="font-display text-2xl text-mustard">{fmt(cambio)}</span>
          </div>
        </>
      )}
    </div>
  )
}
