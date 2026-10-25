import { useEffect, useState } from 'react'
import { collection, query, where, onSnapshot } from 'firebase/firestore'
import { db } from '../../services/firebase'
import { llamarApi, ErrorApi } from '../../services/pedidosApi'
import { Banknote } from 'lucide-react'

// Transferencias que debe hacer la caja de la sede: el saldo a favor de quien
// pidió eliminar su cuenta (Fase 4, P-25) y los reembolsos de reclamos que el
// cliente eligió por transferencia (Fase 7, §14.2). Marcarla hecha cierra el caso.
export default function DevolucionesSaldo({ sedeId }) {
  const [lista, setLista] = useState([])
  const [abierta, setAbierta] = useState(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    if (!sedeId) return
    const q = query(collection(db, 'devoluciones_saldo'), where('sedeId', '==', sedeId), where('estado', '==', 'por_transferir'))
    return onSnapshot(q, snap => setLista(snap.docs.map(d => ({ id: d.id, ...d.data() }))), () => setLista([]))
  }, [sedeId])

  if (!lista.length) return null

  const marcar = async (id) => {
    if (!window.confirm('¿Ya le transferiste este saldo al cliente?')) return
    setBusy(true); setError('')
    try { await llamarApi('POST', `cuenta/devoluciones-saldo/${id}/transferida`); setAbierta(null) }
    catch (err) { setError(err instanceof ErrorApi ? err.message : 'No se pudo guardar. Revisa la conexión.') }
    finally { setBusy(false) }
  }

  return (
    <div className="mx-4 mt-2 flex flex-col gap-1.5">
      {lista.map(d => (
        <div key={d.id} className="w-full bg-cherry text-cream rounded-2xl px-4 py-3 shadow-soft">
          <button onClick={() => setAbierta(abierta === d.id ? null : d.id)} className="w-full flex items-center gap-3 text-left">
            <Banknote size={20} className="text-mustard flex-shrink-0" aria-hidden="true" />
            <div className="flex-1 min-w-0">
              <p className="font-body text-sm font-bold">
                {d.origen === 'reclamo' ? 'Devolución de un reclamo' : 'Transferir saldo a favor'} · ${Number(d.monto).toLocaleString('es-CO')}
              </p>
              <p className="font-body text-xs text-cream/85 truncate">
                {d.origen === 'reclamo'
                  ? `${d.nombre || 'Cliente'}${d.orderNumber ? ` · pedido #${d.orderNumber}` : ''}: administración autorizó devolverle esta plata`
                  : `${d.nombre || 'Cliente'} eliminó su cuenta: hay que devolverle su saldo`}
              </p>
            </div>
            <span className="font-body text-xs font-bold">{abierta === d.id ? 'Cerrar' : 'Ver →'}</span>
          </button>
          {abierta === d.id && (
            <div className="mt-3 bg-cream text-coal rounded-xl p-3 flex flex-col gap-1.5 font-body text-sm">
              <p><strong>Medio:</strong> {d.datos?.medio}</p>
              <p><strong>Número:</strong> <span className="select-all">{d.datos?.numero}</span></p>
              <p><strong>Titular:</strong> {d.datos?.titular}</p>
              {d.datos?.documento && <p><strong>Cédula:</strong> {d.datos.documento}</p>}
              <p><strong>Monto:</strong> ${Number(d.monto).toLocaleString('es-CO')}</p>
              <button onClick={() => marcar(d.id)} disabled={busy} className="btn-primary w-full mt-1">
                {busy ? 'Guardando…' : 'Ya la transferí'}
              </button>
              {error && <p className="text-xs text-pepper">{error}</p>}
            </div>
          )}
        </div>
      ))}
    </div>
  )
}
