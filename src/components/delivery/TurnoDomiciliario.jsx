import { useEffect, useState } from 'react'
import { doc, onSnapshot } from 'firebase/firestore'
import { Play, Pause, Square } from 'lucide-react'
import { db } from '../../services/firebase'
import { llamarApi, ErrorApi } from '../../services/pedidosApi'

// Turno del domiciliario (Fase 5, especificación §11.1): iniciar, pausar y
// terminar son acciones explícitas. Solo en turno y sin pausa le llegan los
// pedidos que la caja confirma, ya asignados (sin tener que aceptarlos).
const ESTILO = {
  activo: { fondo: 'bg-mint text-cream', texto: 'En turno: te llegan los pedidos' },
  pausa:  { fondo: 'bg-mustard text-coal', texto: 'En pausa: no te llegan pedidos nuevos' },
  fuera:  { fondo: 'bg-coal text-cream', texto: 'Fuera de turno' },
}

export default function TurnoDomiciliario({ email, pendientes = 0, onEstado }) {
  const [estado, setEstado] = useState(null) // null = cargando
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState('')

  useEffect(() => {
    if (!email) return
    return onSnapshot(doc(db, 'turnos_domiciliario', email.toLowerCase().trim()),
      (snap) => setEstado(snap.exists() ? snap.data().estado || 'fuera' : 'fuera'),
      () => setEstado('fuera'))
  }, [email])
  useEffect(() => { if (estado) onEstado?.(estado) }, [estado]) // eslint-disable-line react-hooks/exhaustive-deps

  const cambiar = async (accion) => {
    if (accion === 'terminar' && pendientes > 0 &&
      !window.confirm(`Tienes ${pendientes} pedido(s) sin terminar. Si terminas el turno no te llegan nuevos, pero esos siguen siendo tuyos. ¿Terminar?`)) return
    setBusy(true); setMsg('')
    try {
      const r = await llamarApi('POST', 'equipo/turno', { accion })
      setEstado(r.estado)
      if (r.aviso) setMsg(r.aviso)
    } catch (err) {
      setMsg(err instanceof ErrorApi ? err.message : 'No se pudo cambiar el turno. Revisa tu conexión.')
    } finally { setBusy(false) }
  }

  if (!estado) return null
  const e = ESTILO[estado] || ESTILO.fuera
  const boton = 'inline-flex items-center gap-1.5 px-3 py-2 rounded-xl font-body text-sm font-bold disabled:opacity-50'

  return (
    <div className={`mx-4 mt-3 rounded-2xl px-4 py-3 ${e.fondo}`}>
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <p className="font-display text-base tracking-wide flex items-center gap-2">
          {estado === 'activo' && <span className="w-2.5 h-2.5 rounded-full bg-cream animate-pulse" />}
          {e.texto}
        </p>
        <div className="flex gap-2">
          {estado === 'fuera' && (
            <button onClick={() => cambiar('iniciar')} disabled={busy} className={`${boton} bg-mint text-cream border-2 border-cream/60`}>
              <Play size={15} /> {busy ? '…' : 'Iniciar turno'}
            </button>
          )}
          {estado === 'activo' && (
            <button onClick={() => cambiar('pausar')} disabled={busy} className={`${boton} bg-cream/20 text-cream`}>
              <Pause size={15} /> Pausar
            </button>
          )}
          {estado === 'pausa' && (
            <button onClick={() => cambiar('reanudar')} disabled={busy} className={`${boton} bg-coal text-cream`}>
              <Play size={15} /> Seguir
            </button>
          )}
          {estado !== 'fuera' && (
            <button onClick={() => cambiar('terminar')} disabled={busy}
              className={`${boton} ${estado === 'pausa' ? 'bg-coal/10 text-coal' : 'bg-cream/20 text-cream'}`}>
              <Square size={14} /> Terminar
            </button>
          )}
        </div>
      </div>
      {msg && <p className="font-body text-xs mt-2 opacity-90">{msg}</p>}
    </div>
  )
}
