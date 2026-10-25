import { Bike, Store, MessageCircle, Check, Receipt, Gift, CircleCheck, CircleX, AlertCircle, Plus, Banknote, Clock, Smartphone, ShieldCheck, ShieldAlert } from 'lucide-react'
import { etapaDe, ETAPAS } from '../../utils/etapas'
import { minutosEnEtapa, DEMORA, porAsignar } from '../../utils/tableroCaja'

// Tarjeta de pedido de la caja. Se lee de un vistazo, de arriba abajo:
//   1. número, etapa real y cuánto lleva en ella (se pone naranja/roja si se demora)
//   2. lo que pide atención (una línea por aviso, sin cajas gigantes)
//   3. quién y a dónde
//   4. qué pidió (sin precios por línea)
//   5. total, cómo paga, domiciliario y el chulito de facturado
// La etapa sale de etapaDe (no del status viejo): un pedido «listo» ya no dice
// «En preparación».

const NOMBRE_ETAPA = Object.fromEntries(ETAPAS.domicilio.map((e) => [e.id, e.texto]))

const pesos = (n) => `$${Math.round(Number(n) || 0).toLocaleString('es-CO')}`

function textoMinutos(m) {
  if (m == null) return ''
  if (m < 1) return 'ahora'
  if (m < 60) return `${m} min`
  const h = Math.floor(m / 60)
  return `${h} h ${m % 60} min`
}

function Demora({ order, ahora }) {
  const { etapa } = etapaDe(order)
  const m = minutosEnEtapa(order, ahora)
  if (m == null || etapa === 'entregado') return null
  const [aviso, alerta] = DEMORA[etapa] || [Infinity, Infinity]
  const tono = m >= alerta ? 'bg-pepper text-cream' : m >= aviso ? 'bg-tangelo/15 text-tangelo' : 'text-coal/45'
  return (
    <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 font-body text-[11px] font-semibold tabular ${tono}`}
      title="Tiempo en esta etapa">
      <Clock size={11} aria-hidden="true" /> {textoMinutos(m)}
    </span>
  )
}

// Una línea de aviso: icono + texto corto. El tono dice cuánto urge.
const TONO = {
  urgente: 'bg-pepper/10 text-pepper',
  atencion: 'bg-tangelo/10 text-coal',
  bien: 'bg-mint/10 text-mint',
  premio: 'bg-mint text-cream',
}
function Aviso({ tono, icono: Icono, children }) {
  return (
    <p className={`flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 font-body text-xs font-semibold leading-snug ${TONO[tono]}`}>
      <Icono size={13} className="flex-shrink-0" aria-hidden="true" />
      <span className="min-w-0">{children}</span>
    </p>
  )
}

function avisosDe(order, unreadCount) {
  const a = []
  if (order.excepcion === 'cancelacion_solicitada') a.push({ k: 'cancelar', tono: 'urgente', icono: AlertCircle, texto: 'Pidió cancelar · ábrelo para resolver' })
  if (unreadCount > 0) a.push({ k: 'chat', tono: 'urgente', icono: MessageCircle, texto: unreadCount === 1 ? '1 mensaje nuevo del cliente' : `${unreadCount} mensajes nuevos del cliente` })
  if (order.loyaltyRedemption?.count > 0) a.push({ k: 'premio', tono: 'premio', icono: Gift, texto: `Premio ×${order.loyaltyRedemption.count} · Hamburguesa Especial + Perro Grande · NO cobrar` })
  if (order.needsRequote) a.push({ k: 'recotizar', tono: 'atencion', icono: Plus, texto: 'Agregó productos · vuelve a cotizar' })
  if (order.excepcion === 'cambio_pendiente' && order.cambioPropuesto?.estado === 'pendiente') a.push({ k: 'cambio', tono: 'atencion', icono: Clock, texto: 'Cambio propuesto · esperando al cliente' })
  if (!order.excepcion && order.cambioPropuesto?.estado === 'rechazado') a.push({ k: 'rechazo', tono: 'urgente', icono: CircleX, texto: 'Rechazó el cambio · queda el original' })
  if (porAsignar(order)) a.push({ k: 'asignar', tono: 'atencion', icono: Bike, texto: order.sinDomiciliario ? 'Nadie en turno · asígnalo a mano' : 'Sin domiciliario · asígnalo' })
  if (order.pagoAdelantado && order.status === 'pending') a.push({ k: 'completo', tono: 'bien', icono: CircleCheck, texto: `Pedido completo · ${order.payment} · solo aceptar` })
  if (order.status === 'pending_cuadre') a.push({ k: 'cuadre', tono: 'atencion', icono: Banknote, texto: 'Efectivo por cuadrar con la caja' })
  return a
}

// Productos sin el precio de cada línea; las unidades de un combo quedan debajo.
function lineas(items) {
  return String(items || '').split('\n').map((l) => l.replace(/\s*\(= \$[\d.,]+\)\s*$/, '').trimEnd()).filter((l) => l.trim())
}

function Pago({ order }) {
  const p = order.payment
  if (!p) return <span className="font-body text-xs text-coal/45">Pago por definir</span>
  const digital = ['Transferencia', 'Nequi', 'Mixto'].includes(p)
  const Icono = p === 'Efectivo' ? Banknote : Smartphone
  return (
    <span className="inline-flex items-center gap-1 font-body text-xs text-coal/70">
      <Icono size={13} className="text-coal/45" aria-hidden="true" /> {p}
      {digital && order.deliveryMode !== 'pickup' && (order.transferValidated
        ? <ShieldCheck size={13} className="text-mint" aria-label="Transferencia verificada" />
        : <ShieldAlert size={13} className="text-tangelo" aria-label="Transferencia por verificar" />)}
    </span>
  )
}

// Botón dentro de la tarjeta (la tarjeta ya es un botón): abre la asignación
// del domiciliario sin pasar por el detalle.
function BotonAsignar({ onAsignar }) {
  const ir = (e) => { e.stopPropagation(); onAsignar?.() }
  return (
    <span role="button" tabIndex={0} onClick={ir}
      onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); ir(e) } }}
      className="inline-flex items-center gap-1 rounded-full bg-cherry px-2.5 py-1 font-body text-[11px] font-semibold text-cream cursor-pointer select-none transition-colors hover:bg-cherry/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cherry/40">
      <Bike size={12} aria-hidden="true" /> Asignar
    </span>
  )
}

// Chulito de "facturado": se prende y apaga sin abrir el pedido.
function Facturado({ facturado, onToggle }) {
  const stop = (e) => { e.stopPropagation(); onToggle?.() }
  return (
    <span role="checkbox" aria-checked={facturado} tabIndex={0} onClick={stop}
      onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); stop(e) } }}
      title={facturado ? 'Facturado (toca para quitar)' : 'Marcar como facturado'}
      className={`inline-flex items-center gap-1 rounded-full px-2 py-1 font-body text-[11px] font-semibold cursor-pointer select-none transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cherry/40 ${
        facturado ? 'bg-mint/15 text-mint hover:bg-mint/25' : 'bg-smoked text-coal/45 hover:text-coal/70'}`}>
      {facturado ? <Check size={12} strokeWidth={3} aria-hidden="true" /> : <Receipt size={12} aria-hidden="true" />}
      {facturado ? 'Facturado' : 'Facturar'}
    </span>
  )
}

export default function OrderCard({ order, onClick, unreadCount = 0, onToggleFacturado, onAsignar, ahora, tablero = false }) {
  const { etapa, excepcion } = etapaDe(order)
  const pickup = order.deliveryMode === 'pickup'
  const avisos = avisosDe(order, unreadCount)
  const prods = lineas(order.items)
  const visibles = tablero ? prods.slice(0, 3) : prods.slice(0, 4)
  const total = Number(order.totalPrice) || (Number(order.quotedPrice) || 0) + (Number(order.deliveryPrice) || 0)
  const nombreEtapa = excepcion ? null : (pickup && etapa === 'listo' ? 'Listo para recoger' : NOMBRE_ETAPA[etapa])

  return (
    <button onClick={onClick}
      className={`w-full text-left bg-white rounded-2xl shadow-card p-3.5 flex flex-col gap-2.5 cursor-pointer transition-[transform,box-shadow] duration-200 [@media(hover:hover)]:hover:-translate-y-0.5 [@media(hover:hover)]:hover:shadow-soft focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cherry/50 ${unreadCount > 0 || order.excepcion === 'cancelacion_solicitada' ? 'ring-2 ring-cherry/50' : ''}`}
      style={{ transitionTimingFunction: 'var(--ease-out)' }}>
      {/* 1. Número, etapa y demora */}
      <div className="flex items-center gap-2">
        <span className="font-display text-2xl leading-none text-cherry tabular">#{order.orderNumber || '—'}</span>
        <span className="inline-flex items-center gap-1 text-coal/50" title={pickup ? 'Recoge en la sede' : 'Domicilio'}>
          {pickup ? <Store size={14} aria-hidden="true" /> : <Bike size={14} aria-hidden="true" />}
          {!tablero && nombreEtapa && <span className="font-body text-xs font-semibold text-coal/60">{nombreEtapa}</span>}
        </span>
        <span className="ml-auto"><Demora order={order} ahora={ahora} /></span>
      </div>

      {/* 2. Lo que pide atención */}
      {avisos.length > 0 && (
        <div className="flex flex-col gap-1">
          {avisos.map((x) => <Aviso key={x.k} tono={x.tono} icono={x.icono}>{x.texto}</Aviso>)}
        </div>
      )}

      {/* 3. Quién y a dónde */}
      <div className="min-w-0">
        <p className="font-body text-sm font-semibold text-coal truncate">{order.name || order.clientName || 'Cliente'}</p>
        <p className="font-body text-xs text-coal/55 truncate">
          {pickup ? 'Recoge en la sede' : (order.barrio || order.fullAddress || 'Sin dirección')}
          {!tablero && order.phone ? ` · ${order.phone}` : ''}
        </p>
      </div>

      {/* 4. Qué pidió */}
      {prods.length > 0 && (
        <ul className="flex flex-col gap-0.5 border-t border-coal/10 pt-2">
          {visibles.map((l, i) => (
            <li key={i} className={`font-body text-xs leading-snug ${l.startsWith(' ') ? 'pl-3 text-coal/50' : 'text-coal/80'} line-clamp-2`}>{l.trim()}</li>
          ))}
          {prods.length > visibles.length && <li className="font-body text-[11px] text-coal/45">+{prods.length - visibles.length} más</li>}
        </ul>
      )}

      {/* 5. Total, pago, domiciliario y facturado */}
      <div className="flex items-center gap-x-3 gap-y-1.5 flex-wrap border-t border-coal/10 pt-2">
        <span className="font-display text-xl leading-none text-coal tabular">{pesos(total)}</span>
        <Pago order={order} />
        {order.driverName && !pickup && (
          <span className="inline-flex items-center gap-1 font-body text-xs text-mint"><Bike size={12} aria-hidden="true" /> {order.driverName}</span>
        )}
        {(onToggleFacturado || (onAsignar && porAsignar(order))) && (
          <span className="ml-auto inline-flex items-center gap-1.5">
            {onAsignar && porAsignar(order) && <BotonAsignar onAsignar={onAsignar} />}
            {onToggleFacturado && <Facturado facturado={!!order.facturado} onToggle={onToggleFacturado} />}
          </span>
        )}
      </div>
    </button>
  )
}
