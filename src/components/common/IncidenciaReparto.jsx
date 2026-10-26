import { useState } from 'react'
import { AlertTriangle, Check, MessageSquare, PackageCheck } from 'lucide-react'
import { llamarPedidos, ErrorApi } from '../../services/pedidosApi'
import { etapaDe, INSTRUCCIONES_CAJA } from '../../utils/etapas'
import { montoDevolucion } from '../../utils/devolucion'

// Incidencias de reparto (lo mismo que hace CarPlay, CP-1 a CP-4 y CP-8).
// Lo del domiciliario vive en delivery/NoEntrega.jsx (rediseño del 25 oct 2026).
//   · la caja: Esperar / Reintentar / Regresar, indicaciones breves y
//     «Recibí el pedido» cuando vuelve.
// Todo va por la API (sin camino directo): el servidor valida quién puede.

const MAX_INDICACIONES = 90

const hora = (t) => {
  const ms = t?.toMillis?.() ?? (typeof t === 'number' ? t : null)
  return ms ? new Date(ms).toLocaleTimeString('es-CO', { hour: 'numeric', minute: '2-digit' }) : ''
}

function useAccion() {
  const [ocupado, setOcupado] = useState(false)
  const [error, setError] = useState('')
  const correr = async (ruta, cuerpo) => {
    setOcupado(true); setError('')
    try { await llamarPedidos(ruta, cuerpo); return true }
    catch (err) { setError(err instanceof ErrorApi ? err.message : 'No se pudo enviar. Revisa tu conexión e intenta de nuevo.'); return false }
    finally { setOcupado(false) }
  }
  return { ocupado, error, correr }
}

/** Indicaciones breves de la caja: lo primero que lee el domiciliario. */
export function IndicacionesBreves({ order }) {
  if (!order?.indicacionesBreves) return null
  return (
    <div className="bg-tangelo/10 border-2 border-tangelo/40 rounded-2xl px-4 py-3 flex items-start gap-2">
      <MessageSquare size={16} className="text-tangelo flex-shrink-0 mt-0.5" aria-hidden="true" />
      <div>
        <p className="font-body text-[11px] font-bold uppercase tracking-wider text-tangelo">Indicaciones de la caja</p>
        <p className="font-body text-sm font-semibold text-coal">{order.indicacionesBreves}</p>
      </div>
    </div>
  )
}

/** Panel de la caja: instrucción al domiciliario y «Recibí el pedido». */
export function IncidenciaCaja({ order }) {
  const { etapa, excepcion } = etapaDe(order)
  const { ocupado, error, correr } = useAccion()
  if (order.deliveryMode === 'pickup' || etapa !== 'llego' || !['no_entregado', 'regreso_declarado'].includes(excepcion)) return null
  const instr = order.instruccionCaja
  const recibido = () => {
    if (!window.confirm('¿Ya tienes el pedido en la sede? Queda como devuelto y se le avisa al cliente.')) return
    correr(`${order.id}/transiciones`, { a: 'excepcion:devuelto', version: order.version ?? 0 })
  }
  return (
    <div className="bg-pepper/5 border-2 border-pepper/30 rounded-2xl p-4 flex flex-col gap-3">
      <p className="font-display text-base tracking-wide text-pepper flex items-center gap-2">
        <AlertTriangle size={17} aria-hidden="true" />
        {excepcion === 'regreso_declarado' ? `${order.driverName || 'El domiciliario'} regresa con el pedido` : 'No se pudo entregar'}
      </p>
      {order.excepcionMotivo && excepcion === 'no_entregado' && (
        <p className="font-body text-sm text-coal/80">{order.driverName ? `${order.driverName}: ` : ''}{order.excepcionMotivo}</p>
      )}
      {order.incidencia?.texto && excepcion === 'regreso_declarado' && (
        <p className="font-body text-sm text-coal/70">Motivo: {order.incidencia.texto}</p>
      )}

      {excepcion === 'no_entregado' && (
        <div className="flex flex-col gap-2">
          <p className="font-body text-xs font-semibold text-coal/60">Dile qué hacer:</p>
          <div className="grid grid-cols-3 gap-2">
            {Object.entries(INSTRUCCIONES_CAJA).map(([tipo, texto]) => (
              <button key={tipo} onClick={() => correr(`${order.id}/instruccion`, { tipo })} disabled={ocupado}
                className={`btn btn-sm w-full justify-center border-2 ${instr?.tipo === tipo ? 'border-cherry bg-cherry/10 text-cherry' : 'border-coal/15 text-coal/70 bg-cream'}`}
                title={texto}>
                {{ esperar: 'Esperar', reintentar: 'Reintentar', regresar: 'Regresar' }[tipo]}
              </button>
            ))}
          </div>
          {instr?.tipo && (
            <p className="font-body text-xs text-coal/60">
              «{instr.texto}» {instr.at ? `a las ${hora(instr.at)}` : ''} ·{' '}
              {instr.entendidoAt ? <span className="text-mint font-semibold">lo leyó {hora(instr.entendidoAt)}</span> : 'todavía no lo lee'}
            </p>
          )}
        </div>
      )}

      <button onClick={recibido} disabled={ocupado} className={excepcion === 'regreso_declarado' ? 'btn-primary w-full' : 'btn-secondary w-full'}>
        <PackageCheck size={18} aria-hidden="true" /> Recibí el pedido en la sede
      </button>
      {error && <p className="font-body text-sm text-pepper">{error}</p>}
    </div>
  )
}

/**
 * Pedido devuelto a la sede: la caja decide si le devuelve la plata (decisión
 * del 25 oct 2026). Lo pagado por transferencia queda para que el cliente
 * elija transferencia o saldo; el saldo a favor que usó vuelve a su cuenta.
 */
export function DevolverPlataCaja({ order }) {
  const { excepcion } = etapaDe(order)
  const { ocupado, error, correr } = useAccion()
  if (excepcion !== 'devuelto') return null
  const transferido = montoDevolucion(order)
  const saldo = order.saldoAplicado?.ids?.length && !order.saldoAplicado?.devuelto
    ? Number(order.saldoAplicado.usado ?? order.saldoAplicado.monto) || 0 : 0
  const fmt = (n) => `$${n.toLocaleString('es-CO')}`
  if (order.devolucion || order.saldoAplicado?.devuelto) {
    return <p className="font-body text-xs text-mint font-semibold flex items-center gap-1.5"><Check size={14} aria-hidden="true" /> Ya se le devolvió la plata al cliente.</p>
  }
  if (!transferido && !saldo) return null
  const devolver = () => {
    const partes = [transferido ? `${fmt(transferido)} pagados por transferencia (el cliente elige transferencia o saldo)` : '', saldo ? `${fmt(saldo)} de saldo a favor que vuelven a su cuenta` : ''].filter(Boolean)
    if (!window.confirm(`¿Devolverle la plata al cliente?\n\n${partes.join('\n')}\n\nSe le avisa por el chat del pedido.`)) return
    correr(`${order.id}/devolver-plata`, {})
  }
  return (
    <div className="bg-cream border-2 border-coal/15 rounded-2xl p-4 flex flex-col gap-2">
      <p className="font-body text-sm text-coal">
        El pedido volvió a la sede. El cliente pagó {[transferido ? `${fmt(transferido)} por transferencia` : '', saldo ? `${fmt(saldo)} con saldo a favor` : ''].filter(Boolean).join(' y ')}.
        Si corresponde, devuélvele la plata.
      </p>
      <button onClick={devolver} disabled={ocupado} className="btn-secondary w-full">Devolverle la plata</button>
      {error && <p className="font-body text-sm text-pepper">{error}</p>}
    </div>
  )
}

/** Caja: escribir las indicaciones breves para el domiciliario (≤ 90 caracteres). */
export function EditorIndicaciones({ order }) {
  const [texto, setTexto] = useState(order.indicacionesBreves || '')
  const [guardado, setGuardado] = useState(false)
  const { ocupado, error, correr } = useAccion()
  const cambio = texto.trim() !== (order.indicacionesBreves || '')
  const guardar = async () => {
    if (await correr(`${order.id}/indicaciones`, { texto: texto.trim() })) { setGuardado(true); setTimeout(() => setGuardado(false), 2000) }
  }
  return (
    <div className="flex flex-col gap-1.5">
      <label className="label-field" htmlFor={`ind-${order.id}`}>Indicaciones para el domiciliario</label>
      <div className="flex gap-2">
        <input id={`ind-${order.id}`} className="input-field flex-1" maxLength={MAX_INDICACIONES} value={texto}
          onChange={(e) => setTexto(e.target.value)} placeholder="Ej: Portería norte, timbre 3" />
        <button onClick={guardar} disabled={ocupado || !cambio} className="btn-secondary btn-sm px-3">
          {guardado ? <Check size={16} aria-hidden="true" /> : 'Guardar'}
        </button>
      </div>
      <p className="font-body text-[11px] text-coal/50">{texto.length}/{MAX_INDICACIONES} · Cortas: el domiciliario las lee manejando.</p>
      {error && <p className="font-body text-xs text-pepper">{error}</p>}
    </div>
  )
}
