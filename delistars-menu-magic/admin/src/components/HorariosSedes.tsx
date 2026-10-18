import { useEffect, useRef, useState } from 'react'
import { doc, onSnapshot, setDoc, serverTimestamp } from 'firebase/firestore'
import { toast } from 'sonner'
import { Clock, Plus, Trash2, Save, Power } from 'lucide-react'
import { db } from '@/services/firebase'
import { useAuthStore } from '@/store/authStore'
import {
  DIAS, NOMBRE_DIA, SEDES_HORARIO, HORARIO_POR_DEFECTO, estadoSede, textoEstado,
  type Horario, type Turno,
} from '@/lib/horarios'

// Horarios de atención por sede (especificación §16.2, decisión C7 del 18 oct
// 2026). Solo administración: la caja ya no abre ni cierra. Se guarda en
// config/horarios y la web (y la app) calculan solas si la sede recibe pedidos.
const NOMBRE_SEDE: Record<string, string> = { santa_lucia: 'Santa Lucía', santa_teresita: 'Santa Teresita' }
const ORDEN = ['lun', 'mar', 'mie', 'jue', 'vie', 'sab', 'dom']
const DURACIONES = [
  { id: '1h', nombre: 'Por 1 hora', ms: 60 * 60 * 1000 },
  { id: '2h', nombre: 'Por 2 horas', ms: 2 * 60 * 60 * 1000 },
  { id: '4h', nombre: 'Por 4 horas', ms: 4 * 60 * 60 * 1000 },
  { id: 'dia', nombre: 'Hasta el final del día', ms: null },
  { id: 'siempre', nombre: 'Hasta que lo cambie', ms: null },
] as const

const copia = (h: Horario): Horario => JSON.parse(JSON.stringify(h))
const conDefecto = (h?: Partial<Horario> | null): Horario => ({
  semana: h?.semana ?? copia(HORARIO_POR_DEFECTO).semana,
  excepciones: h?.excepciones ?? {},
  manual: h?.manual ?? null,
})

/** Fin del día de hoy en Colombia (medianoche siguiente). */
function finDelDia(): string {
  const d = new Date(Date.now() - 5 * 3600 * 1000)
  const manana = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() + 1, 5, 0, 0))
  return manana.toISOString()
}

export default function HorariosSedes() {
  const { user } = useAuthStore()
  const [guardado, setGuardado] = useState<Record<string, Horario> | null | undefined>(undefined)
  const [borrador, setBorrador] = useState<Record<string, Horario>>({})
  const [sucio, setSucio] = useState(false)
  const [guardando, setGuardando] = useState(false)
  const [ahora, setAhora] = useState(() => Date.now())
  const [duracion, setDuracion] = useState<string>('2h')
  const [ambas, setAmbas] = useState(false)
  // El snapshot no debe pisar lo que se está editando (se lee desde el callback).
  const sucioRef = useRef(false)
  useEffect(() => { sucioRef.current = sucio }, [sucio])

  useEffect(() => onSnapshot(doc(db, 'config', 'horarios'), (snap) => {
    const datos = snap.exists() ? (snap.data() as Record<string, Horario>) : null
    setGuardado(datos)
    // No pisar lo que el admin está editando; sí refrescar el modo manual.
    setBorrador((prev) => {
      const nuevo: Record<string, Horario> = {}
      for (const s of SEDES_HORARIO) {
        const base = conDefecto(datos?.[s])
        nuevo[s] = sucioRef.current && prev[s] ? { ...prev[s], manual: base.manual } : base
      }
      return nuevo
    })
  }, () => toast.error('No se pudieron leer los horarios')), [])

  useEffect(() => {
    const id = setInterval(() => setAhora(Date.now()), 30_000)
    return () => clearInterval(id)
  }, [])

  const cambiar = (sede: string, f: (h: Horario) => void) => {
    setBorrador((prev) => { const h = copia(prev[sede]); f(h); return { ...prev, [sede]: h } })
    setSucio(true)
  }

  const guardarHorario = async () => {
    setGuardando(true)
    try {
      const datos: Record<string, unknown> = { actualizadoPor: user?.email || '', actualizadoAt: serverTimestamp() }
      for (const s of SEDES_HORARIO) {
        const h = borrador[s]
        // El modo manual se guarda aparte (botones de abrir/cerrar): se respeta el vigente.
        datos[s] = { semana: h.semana, excepciones: h.excepciones, manual: conDefecto(guardado?.[s]).manual }
      }
      await setDoc(doc(db, 'config', 'horarios'), datos, { merge: true })
      setSucio(false)
      toast.success('Horario guardado')
    } catch {
      toast.error('No se pudo guardar el horario')
    } finally {
      setGuardando(false)
    }
  }

  const manual = async (sede: string, modo: 'abierta' | 'cerrada' | null) => {
    const dur = DURACIONES.find((d) => d.id === duracion)!
    const hasta = modo === null ? null
      : dur.id === 'siempre' ? null
      : dur.id === 'dia' ? finDelDia()
      : new Date(Date.now() + (dur.ms as number)).toISOString()
    const valor = modo === null ? null : { modo, hasta, por: user?.email || '' }
    const sedes = ambas ? SEDES_HORARIO : [sede]
    try {
      const datos: Record<string, unknown> = { actualizadoPor: user?.email || '', actualizadoAt: serverTimestamp() }
      for (const s of sedes) datos[s] = { ...conDefecto(guardado?.[s]), manual: valor }
      await setDoc(doc(db, 'config', 'horarios'), datos, { merge: true })
      toast.success(modo === null ? 'Vuelve a su horario' : `${sedes.length > 1 ? 'Ambas sedes' : NOMBRE_SEDE[sede]}: ${modo === 'abierta' ? 'abierta' : 'cerrada'} ${dur.nombre.toLowerCase()}`)
    } catch {
      toast.error('No se pudo cambiar el estado')
    }
  }

  if (guardado === undefined) return <div className="bg-white border border-gray-200 rounded-lg p-4 mb-6 text-sm text-muted-fg">Cargando horarios…</div>

  const campo = 'border border-gray-300 rounded-md px-2 py-1 text-sm'

  return (
    <div className="bg-white border border-gray-200 rounded-lg p-4 sm:p-5 mb-6">
      <div className="flex items-center gap-2 mb-1">
        <Clock className="w-5 h-5 text-primary" />
        <h2 className="text-lg font-display font-semibold text-coal">Horarios de domicilios</h2>
      </div>
      <p className="text-xs text-muted-fg mb-4">
        Cada sede abre y cierra sola según su horario (hora de Colombia). La caja ve el estado pero no puede cambiarlo.
        Cerrar no cancela los pedidos que ya entraron.
      </p>

      {/* Estado y apertura/cierre manual */}
      <div className="flex flex-wrap items-center gap-2 mb-3 text-sm">
        <span className="text-muted-fg">Abrir o cerrar a mano:</span>
        <select className={campo} value={duracion} onChange={(e) => setDuracion(e.target.value)}>
          {DURACIONES.map((d) => <option key={d.id} value={d.id}>{d.nombre}</option>)}
        </select>
        <label className="inline-flex items-center gap-1.5 text-coal">
          <input type="checkbox" checked={ambas} onChange={(e) => setAmbas(e.target.checked)} /> Aplicar a ambas sedes
        </label>
      </div>
      <div className="grid md:grid-cols-2 gap-3 mb-6">
        {SEDES_HORARIO.map((s) => {
          const e = estadoSede(guardado?.[s], ahora)
          const m = conDefecto(guardado?.[s]).manual
          return (
            <div key={s} className={`rounded-lg border p-3 ${e.abierta ? 'border-emerald-300 bg-emerald-50' : 'border-gray-200 bg-gray-50'}`}>
              <p className="font-semibold text-coal flex items-center gap-2">
                <Power className={`w-4 h-4 ${e.abierta ? 'text-emerald-600' : 'text-gray-400'}`} /> {NOMBRE_SEDE[s]}
              </p>
              <p className="text-sm text-coal mt-0.5">{textoEstado(e, ahora)}</p>
              <p className="text-[11px] text-muted-fg">
                {e.motivo === 'manual' ? `Modo manual${m?.por ? ` · ${m.por}` : ''}` : e.motivo === 'excepcion' ? 'Excepción de hoy' : 'Según horario'}
              </p>
              <div className="flex flex-wrap gap-2 mt-2">
                <button onClick={() => manual(s, 'abierta')} className="px-3 py-1.5 rounded-md text-xs font-semibold bg-emerald-600 text-white hover:opacity-90">Abrir</button>
                <button onClick={() => manual(s, 'cerrada')} className="px-3 py-1.5 rounded-md text-xs font-semibold bg-coal text-white hover:opacity-90">Cerrar</button>
                {e.motivo === 'manual' && (
                  <button onClick={() => manual(s, null)} className="px-3 py-1.5 rounded-md text-xs font-semibold border border-gray-300 hover:bg-white">Volver al horario</button>
                )}
              </div>
            </div>
          )
        })}
      </div>

      {/* Horario semanal y excepciones */}
      <div className="grid lg:grid-cols-2 gap-5">
        {SEDES_HORARIO.map((s) => {
          const h = borrador[s]
          if (!h) return null
          const excepciones = Object.entries(h.excepciones).sort(([a], [b]) => a.localeCompare(b))
          return (
            <div key={s}>
              <div className="flex items-center justify-between mb-2">
                <p className="font-semibold text-coal">{NOMBRE_SEDE[s]} · horario semanal</p>
                <button onClick={() => cambiar(s, (x) => { for (const d of DIAS) x.semana[d] = copia(x).semana.lun ?? [] })}
                  className="text-[11px] text-primary hover:underline">Copiar el lunes a todos los días</button>
              </div>
              <div className="flex flex-col gap-1.5">
                {ORDEN.map((d) => {
                  const turnos: Turno[] = h.semana[d] ?? []
                  return (
                    <div key={d} className="flex flex-wrap items-center gap-2 text-sm">
                      <span className="w-20 text-muted-fg">{NOMBRE_DIA[d]}</span>
                      {turnos.length === 0 && <span className="text-xs text-gray-400">Cerrado</span>}
                      {turnos.map((t, i) => (
                        <span key={i} className="inline-flex items-center gap-1">
                          <input type="time" className={campo} value={t.desde}
                            onChange={(e) => cambiar(s, (x) => { x.semana[d][i].desde = e.target.value })} />
                          –
                          <input type="time" className={campo} value={t.hasta}
                            onChange={(e) => cambiar(s, (x) => { x.semana[d][i].hasta = e.target.value })} />
                          <button onClick={() => cambiar(s, (x) => { x.semana[d].splice(i, 1) })} className="text-gray-400 hover:text-red-600" title="Quitar turno">
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </span>
                      ))}
                      <button onClick={() => cambiar(s, (x) => { (x.semana[d] ??= []).push({ desde: '17:30', hasta: '23:30' }) })}
                        className="text-gray-400 hover:text-primary" title="Agregar turno"><Plus className="w-4 h-4" /></button>
                    </div>
                  )
                })}
              </div>

              <p className="font-semibold text-coal mt-4 mb-1">Excepciones por fecha</p>
              <p className="text-[11px] text-muted-fg mb-2">Un día distinto: cerrada todo el día o con otro horario (festivos, 24 y 31 de diciembre…).</p>
              <div className="flex flex-col gap-1.5">
                {excepciones.map(([fecha, turnos]) => (
                  <div key={fecha} className="flex flex-wrap items-center gap-2 text-sm">
                    <span className="w-24">{fecha}</span>
                    {turnos.length === 0
                      ? <span className="text-xs text-gray-500">Cerrada todo el día</span>
                      : turnos.map((t, i) => (
                        <span key={i} className="inline-flex items-center gap-1">
                          <input type="time" className={campo} value={t.desde}
                            onChange={(e) => cambiar(s, (x) => { x.excepciones[fecha][i].desde = e.target.value })} />
                          –
                          <input type="time" className={campo} value={t.hasta}
                            onChange={(e) => cambiar(s, (x) => { x.excepciones[fecha][i].hasta = e.target.value })} />
                        </span>
                      ))}
                    <button onClick={() => cambiar(s, (x) => {
                      x.excepciones[fecha] = x.excepciones[fecha].length ? [] : [{ desde: '17:30', hasta: '23:30' }]
                    })} className="text-[11px] text-primary hover:underline">
                      {turnos.length ? 'Marcar cerrada' : 'Poner horario'}
                    </button>
                    <button onClick={() => cambiar(s, (x) => { delete x.excepciones[fecha] })} className="text-gray-400 hover:text-red-600" title="Quitar excepción">
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                ))}
                <label className="inline-flex items-center gap-2 text-sm text-muted-fg">
                  <Plus className="w-4 h-4" /> Agregar fecha:
                  <input type="date" className={campo} value=""
                    onChange={(e) => { const f = e.target.value; if (f) cambiar(s, (x) => { x.excepciones[f] = [] }) }} />
                </label>
              </div>
            </div>
          )
        })}
      </div>

      <div className="flex items-center gap-3 mt-5">
        <button onClick={guardarHorario} disabled={!sucio || guardando}
          className="bg-primary text-white font-semibold rounded-lg px-4 py-2.5 text-sm inline-flex items-center gap-2 hover:opacity-90 disabled:opacity-50">
          <Save className="w-4 h-4" /> {guardando ? 'Guardando…' : 'Guardar horario'}
        </button>
        {sucio && <span className="text-xs text-amber-700">Hay cambios sin guardar.</span>}
        {guardado === null && !sucio && <span className="text-xs text-muted-fg">Hoy rige el horario por defecto (todos los días 5:30 p. m. – 11:30 p. m.).</span>}
      </div>
    </div>
  )
}
