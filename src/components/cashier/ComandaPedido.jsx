import { useEffect, useState } from 'react'
import { doc, onSnapshot } from 'firebase/firestore'
import { Printer } from 'lucide-react'
import { db } from '../../services/firebase'
import { llamarApi, nuevaClave } from '../../services/pedidosApi'
import { estadoComanda, TEXTO_ESTADO_COMANDA, ambiguo } from '../../utils/comanda'
import { RevisarTrabajo } from './ImpresoraCaja'

// Comanda del pedido en el detalle de la caja (Fase 7, §19). La imprime el
// aparato marcado como impresora (ver ImpresoraCaja), no este navegador.
// Desde el 30 oct 2026 la impresora va en el encabezado del detalle (como
// antes de la cola) y la copia ya no pide motivo; abajo solo queda el aviso
// cuando hay que revisar un trabajo que falló.

const COLOR = {
  sin_imprimir: 'text-coal/60', pendiente: 'text-tangelo', enviando: 'text-tangelo', enviada: 'text-mint',
  error: 'text-pepper', pendiente_reintento: 'text-pepper', desactualizada: 'text-pepper',
}
const PUNTO = {
  pendiente: 'bg-tangelo', enviando: 'bg-tangelo', enviada: 'bg-mint',
  error: 'bg-pepper', pendiente_reintento: 'bg-pepper', desactualizada: 'bg-pepper',
}

/** Estado de la comanda y la acción de imprimir, compartidos por el botón y el aviso. */
export function useComanda(order) {
  const estado = estadoComanda(order)
  const impresionId = order?.comanda?.impresionId
  const [trabajo, setTrabajo] = useState(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  // Una clave por intención de imprimir: un doble toque o un reintento de red no imprime dos veces.
  const [clave, setClave] = useState(nuevaClave)

  useEffect(() => {
    if (!impresionId) return
    return onSnapshot(doc(db, 'impresiones', impresionId), (s) => setTrabajo(s.exists() ? { id: s.id, ...s.data() } : null), () => setTrabajo(null))
  }, [impresionId])

  const enCola = estado === 'pendiente' || estado === 'enviando'
  const puedeImprimir = estado === 'sin_imprimir' || estado === 'desactualizada'
  const imprimir = async () => {
    if (busy || enCola) return
    setBusy(true); setError('')
    try {
      // Ya impresa esta versión: sale como copia, sin preguntar por qué.
      await llamarApi('POST', 'impresiones', { orderId: order.id, ...(estado === 'enviada' ? { copia: true } : {}) }, clave)
      setClave(nuevaClave())
    } catch (e) { setError(e.message); setClave(nuevaClave()) } finally { setBusy(false) }
  }

  const necesitaRevision = !!trabajo && !!impresionId && trabajo.id === impresionId && (trabajo.estado === 'error' || trabajo.estado === 'pendiente_reintento' || ambiguo(trabajo))
  return { estado, trabajo, busy, error, enCola, puedeImprimir, imprimir, necesitaRevision }
}

/** Impresora del encabezado: imprime la comanda o, si ya salió, una copia. */
export function BotonImprimirComanda({ order, c }) {
  const texto = TEXTO_ESTADO_COMANDA[c.estado] || c.estado
  const accion = c.enCola ? `Comanda: ${texto}` : c.puedeImprimir
    ? (c.estado === 'desactualizada' ? 'Imprimir la comanda nueva' : 'Imprimir comanda')
    : 'Imprimir una copia de la comanda'
  const copia = order?.comanda?.tipo === 'copia' && c.estado === 'enviada'
  return (
    <button onClick={c.imprimir} disabled={c.busy || c.enCola} title={`${accion}${c.estado !== 'sin_imprimir' ? ` · ahora: ${texto}${copia ? ' (copia)' : ''}` : ''}`}
      aria-label={accion} className={`btn-icon relative ${c.busy || c.enCola ? 'opacity-60' : ''} ${COLOR[c.estado] || 'text-coal/60'} hover:text-coal`}>
      <Printer size={19} aria-hidden="true" />
      {PUNTO[c.estado] && <span className={`absolute top-1.5 right-1.5 h-2 w-2 rounded-full ring-2 ring-cream ${PUNTO[c.estado]}`} aria-hidden="true" />}
    </button>
  )
}

/** Aviso en el cuerpo del detalle: solo si falló o hay que revisar el papel. */
export default function ComandaPedido({ c }) {
  if (!c.necesitaRevision && !c.error && c.estado !== 'desactualizada') return null
  return (
    <div className="card-quiet flex flex-col gap-2">
      <p className="font-body text-sm text-coal flex items-center gap-2">
        <Printer size={16} className="text-coal/60" aria-hidden="true" />
        Comanda: <span className={`font-semibold ${COLOR[c.estado] || 'text-coal'}`}>{TEXTO_ESTADO_COMANDA[c.estado] || c.estado}</span>
      </p>
      {c.estado === 'desactualizada' && (
        <p className="font-body text-[11px] text-coal/55 -mt-1">El pedido cambió después de imprimirla. Toca la impresora de arriba para imprimir la nueva.</p>
      )}
      {c.necesitaRevision && <RevisarTrabajo j={c.trabajo} />}
      {c.error && <p className="font-body text-xs text-pepper">{c.error}</p>}
    </div>
  )
}
