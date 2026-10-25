import { useEffect, useState } from 'react'
import { doc, onSnapshot } from 'firebase/firestore'
import { Printer, Copy } from 'lucide-react'
import { db } from '../../services/firebase'
import { llamarApi, nuevaClave } from '../../services/pedidosApi'
import { estadoComanda, TEXTO_ESTADO_COMANDA, ambiguo } from '../../utils/comanda'
import { RevisarTrabajo } from './ImpresoraCaja'

// Comanda del pedido en el detalle de la caja (Fase 7, §19): estado de
// impresión, imprimir, copia con motivo y revisión si falló. La imprime el
// aparato marcado como impresora (ver ImpresoraCaja), no este navegador.

const COLOR = {
  sin_imprimir: 'text-coal/60', pendiente: 'text-tangelo', enviando: 'text-tangelo', enviada: 'text-mint',
  error: 'text-pepper', pendiente_reintento: 'text-pepper', desactualizada: 'text-pepper',
}

export default function ComandaPedido({ order }) {
  const estado = estadoComanda(order)
  const impresionId = order?.comanda?.impresionId
  const [trabajo, setTrabajo] = useState(null)
  const [copia, setCopia] = useState(null) // null = cerrado; texto del motivo
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  // Una clave por intención de imprimir: un doble toque o un reintento de red no imprime dos veces.
  const [clave, setClave] = useState(nuevaClave)

  useEffect(() => {
    if (!impresionId) return
    return onSnapshot(doc(db, 'impresiones', impresionId), (s) => setTrabajo(s.exists() ? { id: s.id, ...s.data() } : null), () => setTrabajo(null))
  }, [impresionId])

  const pedir = async (cuerpo) => {
    setBusy(true); setError('')
    try {
      await llamarApi('POST', 'impresiones', { orderId: order.id, ...cuerpo }, clave)
      setCopia(null); setClave(nuevaClave())
    } catch (e) { setError(e.message); setClave(nuevaClave()) } finally { setBusy(false) }
  }

  const necesitaRevision = !!trabajo && !!impresionId && trabajo.id === impresionId && (trabajo.estado === 'error' || trabajo.estado === 'pendiente_reintento' || ambiguo(trabajo))
  const puedeImprimir = estado === 'sin_imprimir' || estado === 'desactualizada'

  return (
    <div className="card-quiet flex flex-col gap-2">
      <div className="flex items-center justify-between gap-2">
        <p className="font-body text-sm text-coal flex items-center gap-2">
          <Printer size={16} className="text-coal/60" aria-hidden="true" />
          Comanda: <span className={`font-semibold ${COLOR[estado] || 'text-coal'}`}>{TEXTO_ESTADO_COMANDA[estado] || estado}</span>
          {order?.comanda?.tipo === 'copia' && estado === 'enviada' ? <span className="text-coal/50 text-xs">(copia)</span> : null}
        </p>
        {puedeImprimir && (
          <button onClick={() => pedir({})} disabled={busy} className="btn-primary btn-sm whitespace-nowrap">
            <Printer size={14} aria-hidden="true" /> {busy ? 'Enviando…' : estado === 'desactualizada' ? 'Imprimir la nueva' : 'Imprimir comanda'}
          </button>
        )}
        {estado === 'enviada' && copia === null && (
          <button onClick={() => setCopia('')} disabled={busy} className="btn-secondary btn-sm whitespace-nowrap"><Copy size={14} aria-hidden="true" /> Imprimir copia</button>
        )}
      </div>
      {estado === 'enviada' && (
        <p className="font-body text-[11px] text-coal/50 -mt-1">Enviada a la impresora. Si no salió el papel, imprime una copia con el motivo.</p>
      )}
      {copia !== null && (
        <form onSubmit={(e) => { e.preventDefault(); pedir({ copia: true, motivo: copia }) }} className="flex gap-2">
          <input className="input-field flex-1" placeholder="¿Por qué otra? (ej. no salió, se manchó)" value={copia} onChange={(e) => setCopia(e.target.value)} autoFocus />
          <button type="submit" disabled={busy || copia.trim().length < 3} className="btn-primary btn-sm">Imprimir</button>
          <button type="button" onClick={() => setCopia(null)} className="btn-ghost btn-sm">Cancelar</button>
        </form>
      )}
      {necesitaRevision && <RevisarTrabajo j={trabajo} />}
      {error && <p className="font-body text-xs text-pepper">{error}</p>}
    </div>
  )
}
