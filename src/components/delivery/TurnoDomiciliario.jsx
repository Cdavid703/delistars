import { useEffect, useState } from 'react'
import { doc, onSnapshot } from 'firebase/firestore'
import { Play, Pause, MoreHorizontal, Navigation, NavigationOff, Bike } from 'lucide-react'
import { MAX_EN_REPARTO } from '../../utils/reparto'
import { db } from '../../services/firebase'
import { llamarApi, ErrorApi } from '../../services/pedidosApi'

// Turno del domiciliario (Fase 5, especificación §11.1): iniciar, pausar y
// terminar son acciones explícitas. Solo en turno y sin pausa le llegan los
// pedidos que la caja confirma, ya asignados (sin tener que aceptarlos).
// Diseño elegido en la app (26 oct 2026): franja de una línea en turno;
// tarjeta corta con el botón grande en pausa o fuera de turno.

/**
 * `enReparto`: cuántos lleva en la calle (cupo de 5). `compartiendo` y
 * `onUbicacion`: la ubicación con la caja. `sinUbicacion`: el aparato no la da.
 */
export default function TurnoDomiciliario({ email, pendientes = 0, onEstado, onDatos, enReparto = 0, compartiendo = false, onUbicacion, sinUbicacion = false }) {
  const [estado, setEstado] = useState(null) // null = cargando
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState('')

  useEffect(() => {
    if (!email) return
    return onSnapshot(doc(db, 'turnos_domiciliario', email.toLowerCase().trim()),
      (snap) => {
        const d = snap.exists() ? snap.data() : {}
        setEstado(d.estado || 'fuera')
        onDatos?.(d)
      },
      () => setEstado('fuera'))
  }, [email]) // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { if (estado) onEstado?.(estado) }, [estado]) // eslint-disable-line react-hooks/exhaustive-deps

  const cambiar = async (accion) => {
    if (accion === 'terminar' && !window.confirm(pendientes > 0
      ? `Tienes ${pendientes} pedido(s) sin terminar. Si terminas el turno no te llegan nuevos, pero esos siguen siendo tuyos. ¿Terminar?`
      : 'Terminar turno: dejan de llegarte domicilios nuevos. ¿Terminar?')) return
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
  const terminar = () => cambiar('terminar')

  // En turno: una franja de una línea (diseño elegido en la app, 26 oct 2026):
  // estado, ubicación, cupo, «Pausar» y «Terminar» en «⋯».
  if (estado === 'activo') {
    return (
      <div className="mx-4 flex flex-col gap-2">
        <div className="rounded-2xl bg-[var(--d-tarjeta)] shadow-[var(--d-sombra)] pl-3.5 pr-2 py-2 flex items-center gap-2.5 text-[var(--d-texto)]">
          <span className="relative w-3.5 h-3.5 flex items-center justify-center flex-shrink-0" aria-hidden="true">
            <span className="absolute inset-0 rounded-full bg-mint/50 animate-ping" />
            <span className="w-2.5 h-2.5 rounded-full bg-mint" />
          </span>
          <span className="font-bold text-[15px]">En turno</span>
          <button onClick={onUbicacion} aria-pressed={compartiendo}
            title={compartiendo ? 'La caja ve dónde estás. Toca para dejar de compartir' : 'Compartir mi ubicación con la caja'}
            className={`w-8 h-8 -mx-1 rounded-full flex items-center justify-center ${compartiendo ? 'text-[var(--d-ok)]' : 'text-[var(--d-sec)] opacity-60'}`}>
            {compartiendo ? <Navigation size={15} aria-hidden="true" /> : <NavigationOff size={15} aria-hidden="true" />}
            <span className="sr-only">{compartiendo ? 'Compartiendo ubicación' : 'Ubicación apagada'}</span>
          </button>
          <span className="flex items-center gap-1" aria-label={`En reparto ${enReparto} de ${MAX_EN_REPARTO}`}>
            {Array.from({ length: MAX_EN_REPARTO }, (_, i) => (
              <span key={i} className={`w-1.5 h-3.5 rounded-sm ${i < enReparto ? 'bg-[var(--d-cta)]' : 'bg-[var(--d-borde)]'}`} aria-hidden="true" />
            ))}
            <span className="ml-1 text-xs text-[var(--d-sec)] tabular-nums">{enReparto}/{MAX_EN_REPARTO}</span>
          </span>
          <span className="flex-1" />
          <button onClick={() => cambiar('pausar')} disabled={busy}
            className="h-9 px-3 rounded-full bg-[var(--d-fondo)] text-sm font-bold flex items-center gap-1 disabled:opacity-50">
            <Pause size={14} aria-hidden="true" /> Pausar
          </button>
          <button onClick={terminar} disabled={busy} aria-label="Terminar turno"
            className="w-9 h-9 rounded-full bg-[var(--d-fondo)] flex items-center justify-center disabled:opacity-50">
            <MoreHorizontal size={18} aria-hidden="true" />
          </button>
        </div>
        {!compartiendo && sinUbicacion && (
          <p className="rounded-xl bg-cherry/10 px-3 py-2 text-xs font-semibold text-[var(--d-texto)]">
            Este celular no deja compartir la ubicación: tus clientes no te ven en el mapa.
          </p>
        )}
        {msg && <p className="text-xs text-[var(--d-sec)] px-1">{msg}</p>}
      </div>
    )
  }

  // En pausa o fuera de turno: tarjeta corta con el botón grande para reanudar o iniciar.
  const pausa = estado === 'pausa'
  return (
    <section className="mx-4 rounded-2xl bg-[var(--d-tarjeta)] shadow-[var(--d-sombra)] p-4 flex flex-col gap-3 text-[var(--d-texto)]">
      <div className="flex items-center gap-3">
        <span className={`w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0 text-white ${pausa ? 'bg-mustard' : 'bg-[var(--d-sec)]'}`}>
          <Bike size={20} aria-hidden="true" />
        </span>
        <div className="min-w-0">
          <p className="font-bold text-[15px]">{pausa ? 'En pausa' : 'Fuera de turno'}</p>
          <p className="text-sm text-[var(--d-sec)]">
            {pausa ? 'No te llegan pedidos nuevos.' : 'Inicia el turno para recibir pedidos.'}
            {enReparto > 0 ? ` Llevas ${enReparto} en reparto.` : ''}
          </p>
        </div>
      </div>
      <button onClick={() => cambiar(pausa ? 'reanudar' : 'iniciar')} disabled={busy}
        className="h-14 rounded-2xl bg-[var(--d-cta)] text-[var(--d-cta-texto)] text-lg font-black flex items-center justify-center gap-2 disabled:opacity-50">
        <Play size={18} aria-hidden="true" /> {busy ? 'Un momento…' : pausa ? 'Reanudar' : 'Iniciar turno'}
      </button>
      {pausa && (
        <button onClick={terminar} disabled={busy} className="self-center min-h-[40px] text-sm font-bold underline text-[var(--d-sec)]">
          Terminar turno
        </button>
      )}
      {msg && <p className="text-xs text-[var(--d-sec)]">{msg}</p>}
    </section>
  )
}
