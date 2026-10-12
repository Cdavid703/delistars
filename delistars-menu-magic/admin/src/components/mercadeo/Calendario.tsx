import { useEffect, useMemo, useState } from 'react'
import {
  collection, doc, onSnapshot, addDoc, updateDoc, deleteDoc, serverTimestamp, query, where, getDocs, Timestamp,
} from 'firebase/firestore'
import { toast } from 'sonner'
import { ChevronLeft, ChevronRight, Plus, X, Trash2, Save, CalendarDays, List, AlertTriangle, ExternalLink } from 'lucide-react'
import { db } from '@/services/firebase'
import { useAuthStore } from '@/store/authStore'
import { fmtCOP } from '@/lib/orders'
import type { Campana } from '@/lib/mercadeo'
import SubirImagen from '@/components/mercadeo/SubirImagen'
import {
  TIPOS, ESTADOS, SEDES_ACT, tipoDe, fechaTexto, semanasDelMes, actividadesDelDia, pendienteDeCerrar,
  fechasComerciales, periodoComparacion, resumenPeriodo, variacion, deTexto, sumarDias,
  type Actividad, type PedidoResumen,
} from '@/lib/calendario'

const COL = collection(db, 'mercadeo', 'calendario', 'actividades')
const DIAS = ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom']
const MESES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre']

type Borrador = Omit<Actividad, 'id'> & { id?: string }
const nueva = (dia: string): Borrador => ({
  titulo: '', tipo: 'redes', inicio: dia, fin: dia, sede: 'ambas', estado: 'planeada',
  responsable: '', costo: null, notas: '', enlaces: '',
})

export default function Calendario({ campanas }: { campanas: Campana[] }) {
  const hoy = fechaTexto(new Date())
  const [mes, setMes] = useState(() => { const d = new Date(); return { anio: d.getFullYear(), mes: d.getMonth() } })
  const [vista, setVista] = useState<'mes' | 'lista'>(() => (window.innerWidth < 768 ? 'lista' : 'mes'))
  const [acts, setActs] = useState<Actividad[]>([])
  const [editando, setEditando] = useState<Borrador | null>(null)

  useEffect(() => onSnapshot(COL,
    (s) => setActs(s.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<Actividad, 'id'>) }))),
    () => toast.error('No se pudo leer el calendario'),
  ), [])

  const semanas = useMemo(() => semanasDelMes(mes.anio, mes.mes), [mes])
  const comerciales = useMemo(() => {
    const m = new Map<string, string[]>()
    for (const f of [...fechasComerciales(mes.anio - 1), ...fechasComerciales(mes.anio), ...fechasComerciales(mes.anio + 1)]) {
      m.set(f.fecha, [...(m.get(f.fecha) ?? []), f.nombre])
    }
    return m
  }, [mes.anio])
  // Campañas de correo con fecha prevista: se ven en el calendario (solo lectura).
  const campanasPorDia = useMemo(() => {
    const m = new Map<string, Campana[]>()
    for (const c of campanas) if (c.fechaPrevista) m.set(c.fechaPrevista, [...(m.get(c.fechaPrevista) ?? []), c])
    return m
  }, [campanas])

  const primerDia = fechaTexto(new Date(mes.anio, mes.mes, 1))
  const ultimoDia = fechaTexto(new Date(mes.anio, mes.mes + 1, 0))
  const delMes = acts.filter((a) => a.inicio <= ultimoDia && (a.fin || a.inicio) >= primerDia)
    .sort((a, b) => a.inicio.localeCompare(b.inicio))
  const porCerrar = acts.filter((a) => pendienteDeCerrar(a, hoy))
  const costoMes = delMes.filter((a) => a.estado !== 'cancelada').reduce((t, a) => t + (Number(a.costo) || 0), 0)

  const mover = (n: number) => setMes((m) => { const d = new Date(m.anio, m.mes + n, 1); return { anio: d.getFullYear(), mes: d.getMonth() } })

  return (
    <div className="flex flex-col gap-4">
      {/* Barra superior */}
      <div className="flex flex-wrap items-center gap-2">
        <button onClick={() => mover(-1)} className="p-2 rounded-lg border border-gray-300 hover:bg-gray-50" title="Mes anterior"><ChevronLeft className="w-4 h-4" /></button>
        <p className="font-display text-xl text-coal capitalize min-w-[11rem] text-center">{MESES[mes.mes]} {mes.anio}</p>
        <button onClick={() => mover(1)} className="p-2 rounded-lg border border-gray-300 hover:bg-gray-50" title="Mes siguiente"><ChevronRight className="w-4 h-4" /></button>
        <button onClick={() => { const d = new Date(); setMes({ anio: d.getFullYear(), mes: d.getMonth() }) }}
          className="px-3 py-2 rounded-lg border border-gray-300 text-sm hover:bg-gray-50">Hoy</button>
        <div className="flex rounded-lg border border-gray-300 overflow-hidden ml-1">
          <button onClick={() => setVista('mes')} className={`px-3 py-2 text-sm flex items-center gap-1.5 ${vista === 'mes' ? 'bg-coal text-white' : 'hover:bg-gray-50'}`}><CalendarDays className="w-4 h-4" /> Mes</button>
          <button onClick={() => setVista('lista')} className={`px-3 py-2 text-sm flex items-center gap-1.5 ${vista === 'lista' ? 'bg-coal text-white' : 'hover:bg-gray-50'}`}><List className="w-4 h-4" /> Lista</button>
        </div>
        <button onClick={() => setEditando(nueva(hoy >= primerDia && hoy <= ultimoDia ? hoy : primerDia))}
          className="ml-auto bg-primary text-white font-semibold rounded-lg px-4 py-2 text-sm inline-flex items-center gap-2 hover:opacity-90">
          <Plus className="w-4 h-4" /> Nueva actividad
        </button>
      </div>

      {/* Resumen del mes */}
      <div className="flex flex-wrap gap-x-5 gap-y-1 text-sm text-coal">
        <span><strong>{delMes.length}</strong> actividades</span>
        <span>✅ <strong>{delMes.filter((a) => a.estado === 'hecha').length}</strong> hechas</span>
        <span>🗓️ <strong>{delMes.filter((a) => a.estado === 'planeada' || a.estado === 'en_curso').length}</strong> por hacer</span>
        {costoMes > 0 && <span>💰 <strong>{fmtCOP(costoMes)}</strong> invertido</span>}
      </div>

      {porCerrar.length > 0 && (
        <div className="bg-amber-50 border border-amber-200 rounded-lg px-4 py-2.5 text-sm text-amber-900 flex items-start gap-2">
          <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" />
          <span>
            {porCerrar.length} actividad{porCerrar.length > 1 ? 'es ya pasaron' : ' ya pasó'} sin marcarse como hecha o cancelada:{' '}
            {porCerrar.slice(0, 3).map((a, i) => (
              <button key={a.id} onClick={() => setEditando(a)} className="underline font-semibold">{i ? ', ' : ''}{a.titulo}</button>
            ))}{porCerrar.length > 3 ? '…' : ''}
          </span>
        </div>
      )}

      {vista === 'mes' ? (
        <div className="bg-white border border-gray-200 rounded-lg overflow-x-auto">
          <div className="grid grid-cols-7 min-w-[720px]">
            {DIAS.map((d) => <div key={d} className="px-2 py-1.5 text-xs font-semibold text-muted-fg border-b border-gray-200">{d}</div>)}
            {semanas.flat().map((dia) => {
              const enMes = dia >= primerDia && dia <= ultimoDia
              const delDia = actividadesDelDia(acts, dia)
              const camps = campanasPorDia.get(dia) ?? []
              const items = delDia.length + camps.length
              return (
                <div key={dia} onDoubleClick={() => setEditando(nueva(dia))}
                  className={`min-h-[104px] border-b border-r border-gray-100 p-1.5 flex flex-col gap-1 ${enMes ? '' : 'bg-gray-50/70'}`}>
                  <div className="flex items-start justify-between gap-1">
                    <span className={`text-xs font-semibold w-6 h-6 flex items-center justify-center rounded-full ${
                      dia === hoy ? 'bg-primary text-white' : enMes ? 'text-coal' : 'text-gray-400'}`}>
                      {deTexto(dia).getDate()}
                    </span>
                    {enMes && (
                      <button onClick={() => setEditando(nueva(dia))} className="text-gray-300 hover:text-primary" title="Agregar actividad">
                        <Plus className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>
                  {(comerciales.get(dia) ?? []).map((n) => (
                    <span key={n} className="text-[10px] text-gray-500 leading-tight">⭐ {n}</span>
                  ))}
                  {delDia.slice(0, 3).map((a) => <Chip key={a.id} a={a} hoy={hoy} onClick={() => setEditando(a)} />)}
                  {camps.slice(0, Math.max(0, 3 - delDia.length)).map((c) => (
                    <span key={c.id} className="text-[11px] truncate rounded border px-1.5 py-0.5 bg-sky-50 text-sky-800 border-sky-200" title={c.asunto}>
                      ✉️ {c.nombre}
                    </span>
                  ))}
                  {items > 3 && <span className="text-[10px] text-muted-fg">+{items - 3} más</span>}
                </div>
              )
            })}
          </div>
        </div>
      ) : (
        <ListaMes acts={delMes} campanas={campanas.filter((c) => c.fechaPrevista && c.fechaPrevista >= primerDia && c.fechaPrevista <= ultimoDia)}
          comerciales={comerciales} primerDia={primerDia} ultimoDia={ultimoDia} hoy={hoy} onAbrir={setEditando} />
      )}

      <p className="text-xs text-muted-fg">
        ⭐ Fechas comerciales sugeridas (quincenas, Día de la Madre, Amor y Amistad…). ✉️ Campañas de correo con fecha prevista.
        En la vista de mes, doble clic sobre un día agrega una actividad.
      </p>

      {editando && <EditorActividad a={editando} hoy={hoy} onCerrar={() => setEditando(null)} />}
    </div>
  )
}

function Chip({ a, hoy, onClick }: { a: Actividad; hoy: string; onClick: () => void }) {
  const t = tipoDe(a.tipo)
  const marca = a.estado === 'hecha' ? '✓ ' : a.estado === 'cancelada' ? '✕ ' : pendienteDeCerrar(a, hoy) ? '⚠ ' : ''
  return (
    <button onClick={onClick} title={`${t.nombre} · ${a.titulo}`}
      className={`text-left text-[11px] truncate rounded border px-1.5 py-0.5 ${t.color} ${a.estado === 'cancelada' ? 'line-through opacity-60' : ''}`}>
      {marca}{a.titulo}
    </button>
  )
}

function ListaMes({ acts, campanas, comerciales, primerDia, ultimoDia, hoy, onAbrir }: {
  acts: Actividad[]; campanas: Campana[]; comerciales: Map<string, string[]>
  primerDia: string; ultimoDia: string; hoy: string; onAbrir: (a: Actividad) => void
}) {
  const fmt = (d: string) => deTexto(d).toLocaleDateString('es-CO', { weekday: 'short', day: 'numeric', month: 'short' })
  const sugeridas = [...comerciales.entries()].filter(([f, ns]) => f >= primerDia && f <= ultimoDia && ns.some((n) => n !== 'Quincena'))
  if (!acts.length && !campanas.length) {
    return (
      <div className="bg-white border border-dashed border-gray-300 rounded-lg p-6 text-sm text-muted-fg">
        No hay actividades este mes.
        {sugeridas.length > 0 && <> Fechas para aprovechar: {sugeridas.map(([f, ns]) => `${ns.filter((n) => n !== 'Quincena').join(', ')} (${fmt(f)})`).join(' · ')}.</>}
      </div>
    )
  }
  return (
    <div className="bg-white border border-gray-200 rounded-lg divide-y divide-gray-100">
      {acts.map((a) => {
        const t = tipoDe(a.tipo)
        return (
          <button key={a.id} onClick={() => onAbrir(a)} className="w-full text-left p-3 flex items-center gap-3 hover:bg-gray-50">
            <span className={`text-[10px] font-semibold rounded border px-1.5 py-0.5 shrink-0 ${t.color}`}>{t.nombre}</span>
            <div className="flex-1 min-w-0">
              <p className={`text-sm font-semibold text-coal truncate ${a.estado === 'cancelada' ? 'line-through opacity-60' : ''}`}>{a.titulo}</p>
              <p className="text-xs text-muted-fg">
                {fmt(a.inicio)}{a.fin && a.fin !== a.inicio ? ` → ${fmt(a.fin)}` : ''} · {SEDES_ACT.find((s) => s.id === a.sede)?.nombre}
                {a.responsable ? ` · ${a.responsable}` : ''}
              </p>
            </div>
            <span className={`text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full shrink-0 ${
              a.estado === 'hecha' ? 'bg-emerald-100 text-emerald-700'
                : a.estado === 'cancelada' ? 'bg-gray-100 text-gray-500'
                : pendienteDeCerrar(a, hoy) ? 'bg-amber-100 text-amber-800' : 'bg-sky-100 text-sky-700'}`}>
              {pendienteDeCerrar(a, hoy) ? 'Por cerrar' : ESTADOS.find((e) => e.id === a.estado)?.nombre}
            </span>
          </button>
        )
      })}
      {campanas.map((c) => (
        <div key={c.id} className="p-3 flex items-center gap-3">
          <span className="text-[10px] font-semibold rounded border px-1.5 py-0.5 bg-sky-50 text-sky-800 border-sky-200 shrink-0">✉️ Correo</span>
          <p className="text-sm text-coal truncate flex-1">{c.nombre} <span className="text-xs text-muted-fg">· {fmt(c.fechaPrevista!)}</span></p>
        </div>
      ))}
    </div>
  )
}

function EditorActividad({ a: inicial, hoy, onCerrar }: { a: Borrador; hoy: string; onCerrar: () => void }) {
  const { user } = useAuthStore()
  const [a, setA] = useState<Borrador>(inicial)
  const [guardando, setGuardando] = useState(false)
  const set = <K extends keyof Borrador>(k: K, v: Borrador[K]) => setA((x) => ({ ...x, [k]: v }))
  const campo = 'w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-primary'
  const terminada = !!a.id && (a.estado === 'hecha' || (a.fin || a.inicio) < hoy)

  const guardar = async () => {
    if (!a.titulo.trim()) { toast.error('Ponle un título a la actividad'); return }
    if (!a.inicio) { toast.error('Falta la fecha'); return }
    const fin = a.fin && a.fin >= a.inicio ? a.fin : a.inicio
    setGuardando(true)
    try {
      const datos = {
        titulo: a.titulo.trim(), tipo: a.tipo, inicio: a.inicio, fin, sede: a.sede, estado: a.estado,
        responsable: a.responsable?.trim() || '', costo: a.costo ? Number(a.costo) : null,
        notas: a.notas?.trim() || '', enlaces: a.enlaces?.trim() || '', actualizadoAt: serverTimestamp(),
      }
      if (a.id) await updateDoc(doc(COL, a.id), datos)
      else await addDoc(COL, { ...datos, creadoPor: user?.email || '', creadoAt: serverTimestamp() })
      toast.success('Actividad guardada')
      onCerrar()
    } catch {
      toast.error('No se pudo guardar la actividad')
      setGuardando(false)
    }
  }

  const borrar = async () => {
    if (!a.id || !confirm(`¿Borrar "${a.titulo}"?`)) return
    try { await deleteDoc(doc(COL, a.id)); toast.success('Actividad borrada'); onCerrar() }
    catch { toast.error('No se pudo borrar') }
  }

  const enlaces = (a.enlaces || '').split('\n').map((l) => l.trim()).filter((l) => /^https?:\/\//.test(l))

  return (
    <div className="fixed inset-0 z-50 bg-black/40 flex items-end sm:items-center justify-center p-0 sm:p-4" onClick={(e) => { if (e.target === e.currentTarget) onCerrar() }}>
      <div className="bg-white w-full max-w-lg rounded-t-2xl sm:rounded-2xl max-h-[92vh] overflow-y-auto">
        <div className="sticky top-0 bg-white border-b border-gray-200 px-5 py-3 flex items-center justify-between">
          <p className="font-display font-semibold text-coal">{a.id ? 'Actividad' : 'Nueva actividad'}</p>
          <button onClick={onCerrar} className="text-muted-fg hover:text-coal"><X className="w-5 h-5" /></button>
        </div>
        <div className="p-5 flex flex-col gap-3">
          {terminada && a.estado !== 'cancelada' && <Resultado a={a as Actividad} />}

          <label className="text-xs font-medium text-coal">Título
            <input className={campo} value={a.titulo} onChange={(e) => set('titulo', e.target.value)} placeholder="Ej: Promo martes de perros 2x1" autoFocus={!a.id} />
          </label>
          <div className="grid grid-cols-2 gap-3">
            <label className="text-xs font-medium text-coal">Tipo
              <select className={campo} value={a.tipo} onChange={(e) => set('tipo', e.target.value as Borrador['tipo'])}>
                {TIPOS.map((t) => <option key={t.id} value={t.id}>{t.nombre}</option>)}
              </select>
            </label>
            <label className="text-xs font-medium text-coal">Estado
              <select className={campo} value={a.estado} onChange={(e) => set('estado', e.target.value as Borrador['estado'])}>
                {ESTADOS.map((s) => <option key={s.id} value={s.id}>{s.nombre}</option>)}
              </select>
            </label>
            <label className="text-xs font-medium text-coal">Desde
              <input type="date" className={campo} value={a.inicio}
                onChange={(e) => setA((x) => ({ ...x, inicio: e.target.value, fin: !x.fin || x.fin < e.target.value ? e.target.value : x.fin }))} />
            </label>
            <label className="text-xs font-medium text-coal">Hasta
              <input type="date" className={campo} value={a.fin} min={a.inicio} onChange={(e) => set('fin', e.target.value)} />
            </label>
            <label className="text-xs font-medium text-coal">Sede
              <select className={campo} value={a.sede} onChange={(e) => set('sede', e.target.value)}>
                {SEDES_ACT.map((s) => <option key={s.id} value={s.id}>{s.nombre}</option>)}
              </select>
            </label>
            <label className="text-xs font-medium text-coal">Costo (opcional)
              <input className={campo} inputMode="numeric" value={a.costo ?? ''} placeholder="$0"
                onChange={(e) => set('costo', e.target.value.replace(/\D/g, '') ? Number(e.target.value.replace(/\D/g, '')) : null)} />
            </label>
          </div>
          <label className="text-xs font-medium text-coal">Responsable
            <input className={campo} value={a.responsable || ''} onChange={(e) => set('responsable', e.target.value)} placeholder="Ej: Valentina" />
          </label>
          <label className="text-xs font-medium text-coal">Notas
            <textarea className={`${campo} h-20`} value={a.notas || ''} onChange={(e) => set('notas', e.target.value)} placeholder="Qué se va a hacer, código de descuento, guion del post…" />
          </label>
          <label className="text-xs font-medium text-coal">Enlaces (uno por línea: el post, la pieza gráfica…)
            <textarea className={`${campo} h-16`} value={a.enlaces || ''} onChange={(e) => set('enlaces', e.target.value)} placeholder="https://instagram.com/p/…" />
          </label>
          <div className="text-xs font-medium text-coal flex flex-col gap-1">Pieza gráfica (opcional)
            <SubirImagen carpeta="calendario" texto="Subir la pieza gráfica"
              onCambio={(url) => { if (url) set('enlaces', [a.enlaces?.trim(), url].filter(Boolean).join('\n')) }} />
          </div>
          {enlaces.length > 0 && (
            <div className="flex flex-col gap-1">
              {enlaces.map((l) => /firebasestorage\.googleapis\.com/.test(l) ? (
                <a key={l} href={l} target="_blank" rel="noopener noreferrer" title="Ver imagen">
                  <img src={l} alt="" className="h-20 rounded-md border border-gray-200 object-cover" />
                </a>
              ) : (
                <a key={l} href={l} target="_blank" rel="noopener noreferrer" className="text-xs text-primary hover:underline inline-flex items-center gap-1 truncate">
                  <ExternalLink className="w-3 h-3 shrink-0" /> {l}
                </a>
              ))}
            </div>
          )}

          <div className="flex gap-2 pt-2">
            <button onClick={guardar} disabled={guardando}
              className="bg-primary text-white font-semibold rounded-lg px-4 py-2.5 text-sm inline-flex items-center gap-2 hover:opacity-90 disabled:opacity-50">
              <Save className="w-4 h-4" /> {guardando ? 'Guardando…' : 'Guardar'}
            </button>
            <button onClick={onCerrar} className="border border-gray-300 rounded-lg px-4 py-2.5 text-sm hover:bg-gray-50">Cancelar</button>
            {a.id && (
              <button onClick={borrar} className="ml-auto text-red-600 rounded-lg px-3 py-2.5 text-sm hover:bg-red-50 inline-flex items-center gap-1.5">
                <Trash2 className="w-4 h-4" /> Borrar
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

/** Pedidos y ventas durante la actividad vs el mismo periodo antes. */
function Resultado({ a }: { a: Actividad }) {
  const [r, setR] = useState<{ ahora: ReturnType<typeof resumenPeriodo>; antes: ReturnType<typeof resumenPeriodo>; comp: { inicio: string; fin: string } } | null | 'error'>(null)
  useEffect(() => {
    const fin = a.fin || a.inicio
    const comp = periodoComparacion(a.inicio, fin)
    const desde = Timestamp.fromDate(deTexto(comp.inicio))
    const hasta = Timestamp.fromDate(deTexto(sumarDias(fin, 1)))
    getDocs(query(collection(db, 'orders'), where('createdAt', '>=', desde), where('createdAt', '<', hasta)))
      .then((s) => {
        const peds: PedidoResumen[] = s.docs.map((d) => {
          const o = d.data()
          return { createdAtMs: o.createdAt?.toMillis?.() ?? 0, status: o.status, sedeId: o.sedeId, totalPrice: o.totalPrice }
        })
        setR({ ahora: resumenPeriodo(peds, a.inicio, fin, a.sede), antes: resumenPeriodo(peds, comp.inicio, comp.fin, a.sede), comp })
      })
      .catch(() => setR('error'))
  }, [a.inicio, a.fin, a.sede])

  if (r === null) return <p className="text-xs text-muted-fg">Calculando resultado…</p>
  if (r === 'error') return <p className="text-xs text-muted-fg">No se pudo calcular el resultado.</p>
  const vp = variacion(r.ahora.pedidos, r.antes.pedidos)
  const vv = variacion(r.ahora.ventas, r.antes.ventas)
  const signo = (v: number | null) => (v === null ? '' : v >= 0 ? `+${v}%` : `${v}%`)
  const fmtD = (d: string) => deTexto(d).toLocaleDateString('es-CO', { day: 'numeric', month: 'short' })
  return (
    <div className="bg-emerald-50 border border-emerald-200 rounded-lg p-3">
      <p className="text-xs font-semibold text-emerald-900 mb-1.5">📊 Resultado en esas fechas</p>
      <div className="grid grid-cols-2 gap-3 text-sm">
        <div>
          <p className="text-2xl font-display font-bold text-coal">{r.ahora.pedidos}</p>
          <p className="text-xs text-muted-fg">pedidos entregados {vp !== null && <span className={vp >= 0 ? 'text-emerald-700 font-semibold' : 'text-red-600 font-semibold'}>{signo(vp)}</span>}</p>
        </div>
        <div>
          <p className="text-2xl font-display font-bold text-coal">{fmtCOP(r.ahora.ventas)}</p>
          <p className="text-xs text-muted-fg">en ventas {vv !== null && <span className={vv >= 0 ? 'text-emerald-700 font-semibold' : 'text-red-600 font-semibold'}>{signo(vv)}</span>}</p>
        </div>
      </div>
      <p className="text-[11px] text-muted-fg mt-1.5">
        Comparado con {fmtD(r.comp.inicio)}{r.comp.fin !== r.comp.inicio ? ` – ${fmtD(r.comp.fin)}` : ''}: {r.antes.pedidos} pedidos y {fmtCOP(r.antes.ventas)}.
        {a.costo ? ` Costó ${fmtCOP(a.costo)}.` : ''}
      </p>
    </div>
  )
}
