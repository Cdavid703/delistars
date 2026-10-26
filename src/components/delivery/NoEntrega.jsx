import { useState } from 'react'
import { createPortal } from 'react-dom'
import { Check, MessageSquare } from 'lucide-react'
import { llamarPedidos, ErrorApi } from '../../services/pedidosApi'
import { etapaDe, MOTIVOS_NO_ENTREGA, INSTRUCCIONES_CAJA } from '../../utils/etapas'
import { SEDES } from '../../services/roles'
import { LogoGoogleMaps, LogoWaze } from '../common/LogosApps'

// «No puedo entregar», la instrucción de la caja y el regreso (CP-1 a CP-3),
// con el rediseño del domiciliario del 25 oct 2026: hoja desde abajo con el
// motivo, «La caja ya sabe» mientras decide y la instrucción en grande.
// Todo va por la API (sin camino directo): el servidor valida quién puede.

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

const BOTON = 'w-full min-h-[56px] rounded-2xl font-body text-base font-bold flex items-center justify-center gap-2 disabled:opacity-50'

/** Hoja con los motivos. `alAvisar` después de que la caja quedó avisada. */
export function HojaNoEntrega({ order, onCerrar, alAvisar }) {
  const [motivo, setMotivo] = useState('no_responde')
  const { ocupado, error, correr } = useAccion()
  const avisar = async () => {
    const ok = await correr(`${order.id}/transiciones`, { a: 'excepcion:no_entregado', motivo, version: order.version ?? 0 })
    if (ok) { alAvisar?.(); onCerrar() }
  }
  const quien = order.destinatario?.nombre || order.name || order.clientName || ''
  return createPortal(
    <div className="fixed inset-0 z-[130] bg-coal/55 flex items-end sm:items-center justify-center animate-fade-in"
      onClick={(e) => { if (e.target === e.currentTarget) onCerrar() }}>
      <div role="dialog" aria-modal="true" aria-label="No puedo entregar"
        className="bg-cream w-full max-w-lg rounded-t-[28px] sm:rounded-[28px] px-4 pt-2.5 pb-6 flex flex-col gap-3 animate-sheet-up"
        style={{ paddingBottom: 'max(env(safe-area-inset-bottom), 24px)' }}>
        <span className="self-center w-11 h-1.5 rounded-full bg-coal/20" aria-hidden="true" />
        <div>
          <p className="font-display text-3xl tracking-wide text-coal leading-none normal-case">No puedo entregar</p>
          <p className="font-body text-sm text-coal/60 mt-1.5">
            {order.orderNumber ? `#${order.orderNumber} · ` : ''}{quien}. La caja te dice qué hacer.
          </p>
        </div>
        <div className="flex flex-col gap-2" role="radiogroup" aria-label="Motivo">
          {Object.entries(MOTIVOS_NO_ENTREGA).map(([codigo, texto]) => {
            const sel = codigo === motivo
            return (
              <button key={codigo} role="radio" aria-checked={sel} onClick={() => setMotivo(codigo)}
                className={`min-h-[60px] rounded-2xl px-4 flex items-center gap-3 text-left font-body text-[15px] font-bold text-coal border-2 ${
                  sel ? 'bg-cherry/[0.08] border-[#C8261D]' : 'bg-white border-coal/15'}`}>
                <span className={`w-[22px] h-[22px] rounded-full border-2 flex-shrink-0 ${sel ? 'border-[#C8261D] bg-[#C8261D]' : 'border-coal/25'}`} aria-hidden="true" />
                {texto}
              </button>
            )
          })}
        </div>
        {error && <p className="font-body text-sm text-pepper">{error}</p>}
        <button onClick={avisar} disabled={ocupado} className={`${BOTON} bg-[#C8261D] text-white`}>
          {ocupado ? 'Avisando…' : 'Avisarle a la caja'}
        </button>
        <button onClick={onCerrar} className="min-h-[44px] font-body text-sm font-bold text-coal">Cancelar</button>
      </div>
    </div>,
    document.body,
  )
}

/**
 * Lo que ve el domiciliario después de reportar: «La caja ya sabe» mientras
 * decide, la instrucción en grande con «Entendido» y, si toca, el regreso.
 * `entregar`: el botón de entregar, para cuando la caja dice esperar o reintentar.
 */
export function EstadoNoEntrega({ order, entregar = null, onHablarCaja }) {
  const { excepcion } = etapaDe(order)
  const { ocupado, error, correr } = useAccion()
  if (!['no_entregado', 'regreso_declarado'].includes(excepcion)) return null
  const instr = order.instruccionCaja
  const sede = SEDES[order.sedeId]

  const regrese = () => {
    if (!window.confirm('¿Ya estás en la sede con el pedido? La caja va a confirmar que lo recibió.')) return
    correr(`${order.id}/transiciones`, { a: 'excepcion:regreso_declarado', version: order.version ?? 0 })
  }
  const irASede = (app) => {
    if (!sede) return
    window.open(app === 'waze'
      ? `https://waze.com/ul?ll=${sede.coords.lat},${sede.coords.lng}&navigate=yes`
      : `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(sede.mapsAddress || sede.address)}`, '_blank')
  }

  if (excepcion === 'regreso_declarado') {
    return (
      <div className="rounded-2xl bg-mustard/15 border-2 border-mustard/40 px-4 py-3">
        <p className="font-body text-sm text-coal"><strong>Entrégalo en la caja.</strong> Ella confirma que recibió el pedido y ahí queda cerrado.</p>
      </div>
    )
  }

  const motivo = order.incidencia?.texto || order.excepcionMotivo || ''
  return (
    <div className="flex flex-col gap-2.5">
      {!instr?.tipo ? (
        <div className="flex flex-col items-center text-center gap-2 pt-1">
          <span className="w-14 h-14 rounded-full bg-mustard/20 flex items-center justify-center" aria-hidden="true">
            <span className="w-4 h-4 rounded-full bg-mustard animate-pulse" />
          </span>
          <p className="font-display text-[28px] tracking-wide text-coal leading-none normal-case">La caja ya sabe</p>
          <p className="font-body text-sm text-coal/60 max-w-xs">
            {motivo ? <>Le contaste: «{motivo}». </> : null}Quédate en el lugar mientras la caja llama al cliente y te dice qué hacer.
          </p>
          {onHablarCaja && (
            <button onClick={onHablarCaja} className="mt-1 w-full min-h-[52px] rounded-2xl bg-white border border-coal/10 px-4 flex items-center gap-2.5 font-body text-sm font-semibold text-coal">
              <MessageSquare size={19} aria-hidden="true" /> Escribirle a la caja
            </button>
          )}
        </div>
      ) : (
        <>
          <p className="font-body text-[11px] font-bold tracking-wider text-coal/55 uppercase">
            Instrucción de la caja{instr.at ? ` · ${hora(instr.at)}` : ''}
          </p>
          <div className="rounded-[22px] bg-coal text-cream px-4 py-4">
            <p className="font-display text-[30px] tracking-wide leading-none text-white normal-case">{instr.texto || INSTRUCCIONES_CAJA[instr.tipo]}</p>
            {motivo && <p className="font-body text-xs text-cream/70 mt-2">Tú le dijiste: {motivo}</p>}
          </div>
          {!instr.entendidoAt ? (
            <button onClick={() => correr(`${order.id}/instruccion/entendido`, {})} disabled={ocupado}
              className={`${BOTON} bg-[#C8261D] text-white`}>Entendido</button>
          ) : (
            <p className="font-body text-sm font-bold text-[#12766B] flex items-center gap-1.5">
              <Check size={18} aria-hidden="true" /> La caja vio que entendiste
            </p>
          )}
          {instr.entendidoAt && instr.tipo !== 'regresar' && entregar}
          {instr.entendidoAt && instr.tipo === 'regresar' && sede && (
            <p className="font-body text-xs font-bold text-coal/60 -mb-1">Ruta a {sede.name}</p>
          )}
          {instr.entendidoAt && instr.tipo === 'regresar' && sede && (
            <div className="grid grid-cols-2 gap-2">
              <button onClick={() => irASede('maps')} className="min-h-[52px] rounded-2xl bg-white border border-coal/15 font-body text-sm font-bold text-coal flex items-center justify-center gap-2">
                <LogoGoogleMaps size={20} /> Maps
              </button>
              <button onClick={() => irASede('waze')} className="min-h-[52px] rounded-2xl bg-white border border-coal/15 font-body text-sm font-bold text-coal flex items-center justify-center gap-2">
                <LogoWaze size={20} /> Waze
              </button>
            </div>
          )}
        </>
      )}
      <button onClick={regrese} disabled={ocupado}
        className={`${BOTON} ${instr?.tipo === 'regresar' && instr.entendidoAt ? 'bg-mint text-white' : 'border-2 border-coal text-coal bg-transparent min-h-[52px] text-sm'}`}>
        Ya regresé a la sede
      </button>
      {error && <p className="font-body text-sm text-pepper">{error}</p>}
    </div>
  )
}
