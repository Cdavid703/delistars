import { useEffect, useState } from 'react'
import { doc, onSnapshot } from 'firebase/firestore'
import { Play, Pause, Square } from 'lucide-react'
import { db } from '../../services/firebase'
import { llamarApi, ErrorApi } from '../../services/pedidosApi'

// Turno del domiciliario (Fase 5, especificación §11.1): iniciar, pausar y
// terminar son acciones explícitas. Solo en turno y sin pausa le llegan los
// pedidos que la caja confirma, ya asignados (sin tener que aceptarlos).
// Rediseño del 25 oct 2026: tarjeta de color con el estado en grande.
const ESTILO = {
  activo: { fondo: 'bg-mint text-white', titulo: 'En turno', detalle: 'Te llegan los pedidos', borde: 'border-white/60' },
  pausa:  { fondo: 'bg-mustard text-coal', titulo: 'En pausa', detalle: 'No te llegan pedidos nuevos', borde: 'border-coal/50' },
  fuera:  { fondo: 'bg-coal text-cream', titulo: 'Fuera de turno', detalle: 'Inicia el turno para recibir pedidos', borde: 'border-cream/50' },
}

const horaDe = (t) => {
  const ms = t?.toMillis?.() ?? (typeof t === 'number' ? t : null)
  return ms ? new Date(ms).toLocaleTimeString('es-CO', { hour: 'numeric', minute: '2-digit' }) : ''
}

/** `onDatos(turno)`: el documento del turno (p. ej. su `ordenRuta`). */
export default function TurnoDomiciliario({ email, pendientes = 0, onEstado, onDatos }) {
  const [estado, setEstado] = useState(null) // null = cargando
  const [desde, setDesde] = useState(null)
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState('')

  useEffect(() => {
    if (!email) return
    return onSnapshot(doc(db, 'turnos_domiciliario', email.toLowerCase().trim()),
      (snap) => {
        const d = snap.exists() ? snap.data() : {}
        setEstado(d.estado || 'fuera')
        setDesde(d.desde || null)
        onDatos?.(d)
      },
      () => setEstado('fuera'))
  }, [email]) // eslint-disable-line react-hooks/exhaustive-deps
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
  const boton = `min-h-[44px] px-3.5 rounded-2xl border-2 ${e.borde} font-body text-[13px] font-bold inline-flex items-center gap-1.5 disabled:opacity-50`
  const detalle = estado === 'activo' && horaDe(desde) ? `${e.detalle} · desde ${horaDe(desde)}` : e.detalle

  return (
    <section className={`mx-4 rounded-[20px] px-4 py-3.5 ${e.fondo}`}>
      <div className="flex items-center gap-3">
        {estado !== 'fuera' && (
          <span className={`w-3 h-3 rounded-full flex-shrink-0 ${estado === 'activo' ? 'bg-cream animate-pulse' : 'bg-coal'}`} aria-hidden="true" />
        )}
        <div className="flex-1 min-w-0">
          <p className="font-display text-[22px] tracking-wide leading-none normal-case">{e.titulo}</p>
          <p className="font-body text-xs opacity-85 mt-1">{detalle}</p>
        </div>
        <div className="flex gap-1.5 flex-shrink-0">
          {estado === 'fuera' && (
            <button onClick={() => cambiar('iniciar')} disabled={busy} className={`${boton} bg-mint text-white border-mint`}>
              <Play size={15} aria-hidden="true" /> {busy ? '…' : 'Iniciar turno'}
            </button>
          )}
          {estado === 'activo' && (
            <button onClick={() => cambiar('pausar')} disabled={busy} className={boton}>
              <Pause size={15} aria-hidden="true" /> Pausar
            </button>
          )}
          {estado === 'pausa' && (
            <button onClick={() => cambiar('reanudar')} disabled={busy} className={`${boton} bg-coal text-cream border-coal`}>
              <Play size={15} aria-hidden="true" /> Seguir
            </button>
          )}
          {estado !== 'fuera' && (
            <button onClick={() => cambiar('terminar')} disabled={busy} className={boton} aria-label="Terminar turno">
              <Square size={14} aria-hidden="true" /> Terminar
            </button>
          )}
        </div>
      </div>
      {msg && <p className="font-body text-xs mt-2 opacity-90">{msg}</p>}
    </section>
  )
}
