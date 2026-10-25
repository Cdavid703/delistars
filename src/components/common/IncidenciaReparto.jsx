import { useState } from 'react'
import { AlertTriangle, Check, Clock, MessageSquare, Undo2, PackageCheck } from 'lucide-react'
import { llamarPedidos, ErrorApi } from '../../services/pedidosApi'
import { etapaDe, MOTIVOS_NO_ENTREGA, INSTRUCCIONES_CAJA } from '../../utils/etapas'

// Incidencias de reparto (lo mismo que hace CarPlay, CP-1 a CP-4 y CP-8):
//   · el domiciliario: «No puedo entregar» con un motivo, «Entendido» a la
//     instrucción de la caja y «Regresé con el pedido»;
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

/** Panel del domiciliario: «No puedo entregar», instrucción de la caja y regreso. */
export function IncidenciaDomiciliario({ order }) {
  const { etapa, excepcion } = etapaDe(order)
  const [eligiendo, setEligiendo] = useState(false)
  const { ocupado, error, correr } = useAccion()
  if (order.deliveryMode === 'pickup' || etapa !== 'llego') return null
  if (excepcion && !['no_entregado', 'regreso_declarado'].includes(excepcion)) return null
  const instr = order.instruccionCaja

  const noPuedo = (motivo) => correr(`${order.id}/transiciones`, { a: 'excepcion:no_entregado', motivo, version: order.version ?? 0 })
    .then((ok) => ok && setEligiendo(false))
  const regrese = () => {
    if (!window.confirm('¿Ya estás en la sede con el pedido? La caja va a confirmar que lo recibió.')) return
    correr(`${order.id}/transiciones`, { a: 'excepcion:regreso_declarado', version: order.version ?? 0 })
  }

  if (excepcion === 'regreso_declarado') {
    return (
      <div className="bg-mustard/10 border-2 border-mustard/40 rounded-2xl p-4 flex items-start gap-2">
        <Clock size={18} className="text-mustard flex-shrink-0 mt-0.5" aria-hidden="true" />
        <p className="font-body text-sm text-coal">
          <strong>Esperando que la caja reciba el pedido.</strong> Entrégalo en la caja; ella confirma que lo recibió.
        </p>
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-3">
      {excepcion === 'no_entregado' && (
        <div className="bg-pepper/10 border-2 border-pepper/30 rounded-2xl p-4 flex flex-col gap-3">
          <p className="font-display text-base tracking-wide text-pepper flex items-center gap-2">
            <AlertTriangle size={17} aria-hidden="true" /> No pudiste entregar
          </p>
          <p className="font-body text-sm text-coal/80">{order.excepcionMotivo}</p>
          {instr?.tipo ? (
            <div className="bg-cream rounded-xl p-3 flex flex-col gap-2">
              <p className="font-body text-[11px] font-bold uppercase tracking-wider text-coal/45">La caja dice {instr.at ? `· ${hora(instr.at)}` : ''}</p>
              <p className="font-display text-lg tracking-wide text-coal">{instr.texto || INSTRUCCIONES_CAJA[instr.tipo]}</p>
              {instr.entendidoAt ? (
                <p className="font-body text-xs text-mint font-semibold flex items-center gap-1"><Check size={14} aria-hidden="true" /> Entendido</p>
              ) : (
                <button onClick={() => correr(`${order.id}/instruccion/entendido`, {})} disabled={ocupado} className="btn-mint w-full">
                  <Check size={18} aria-hidden="true" /> Entendido
                </button>
              )}
            </div>
          ) : (
            <p className="font-body text-xs text-coal/60 flex items-center gap-1.5"><Clock size={14} aria-hidden="true" /> Esperando la instrucción de la caja…</p>
          )}
          <button onClick={regrese} disabled={ocupado} className="btn-secondary w-full">
            <Undo2 size={17} aria-hidden="true" /> Regresé con el pedido
          </button>
        </div>
      )}

      {!excepcion && (eligiendo ? (
        <div className="border-2 border-pepper/30 rounded-2xl p-4 flex flex-col gap-2">
          <p className="font-display text-base tracking-wide text-coal">¿Por qué no puedes entregar?</p>
          {Object.entries(MOTIVOS_NO_ENTREGA).map(([codigo, texto]) => (
            <button key={codigo} onClick={() => noPuedo(codigo)} disabled={ocupado} className="btn-secondary w-full justify-start">{texto}</button>
          ))}
          <button onClick={() => setEligiendo(false)} className="btn-ghost w-full">Volver</button>
        </div>
      ) : (
        <button onClick={() => setEligiendo(true)} className="btn-secondary w-full text-pepper border-pepper/30">
          <AlertTriangle size={18} aria-hidden="true" /> No puedo entregar
        </button>
      ))}
      {error && <p className="font-body text-sm text-pepper">{error}</p>}
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
