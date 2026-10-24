import { useEffect, useMemo, useState } from 'react'
import {
  collection, doc, onSnapshot, orderBy, query, addDoc, updateDoc, deleteDoc, serverTimestamp,
} from 'firebase/firestore'
import { toast } from 'sonner'
import { Users, Megaphone, Plus, Save, Trash2, Send, Eye, Pencil, Info, CalendarDays, Bell, Pause, Play, BarChart3 } from 'lucide-react'
import { apiService, type Producto, type Categoria } from '@/services/api'
import Calendario from '@/components/mercadeo/Calendario'
import SubirImagen from '@/components/mercadeo/SubirImagen'
import { db } from '@/services/firebase'
import { useAuthStore } from '@/store/authStore'
import logo from '@/assets/logo.svg'
import {
  SEGMENTOS, nombreSegmento, CAMPANA_VACIA, faltantes, faltantesProgramar, estadoProgramacion, conCorreo, type Audiencia, type Campana,
} from '@/lib/mercadeo'

const SEDES_CAMPANA: Record<string, string> = { '': 'Las dos sedes', santa_lucia: 'Santa Lucía', santa_teresita: 'Santa Teresita' }
const aLocal = (ms?: number | null) => (ms ? new Date(ms - new Date(ms).getTimezoneOffset() * 60000).toISOString().slice(0, 16) : '')
const deLocal = (v: string) => (v ? new Date(v).getTime() : null)
const ESTADO_PROG: Record<string, { texto: string; cls: string }> = {
  programada: { texto: 'Programada', cls: 'bg-sky-100 text-sky-700' },
  activa: { texto: 'Activa', cls: 'bg-emerald-100 text-emerald-700' },
  pausada: { texto: 'Pausada', cls: 'bg-amber-100 text-amber-700' },
  terminada: { texto: 'Terminó', cls: 'bg-gray-100 text-gray-600' },
}

const n = (v?: number) => (v ?? 0).toLocaleString('es-CO')

export default function Mercadeo() {
  const [tab, setTab] = useState<'calendario' | 'campanas' | 'audiencia'>('calendario')
  const [aud, setAud] = useState<Audiencia | null>(null)
  const [audError, setAudError] = useState(false)

  useEffect(() => onSnapshot(
    doc(db, 'config', 'mercadeo_audiencia'),
    (s) => setAud(s.exists() ? (s.data() as Audiencia) : null),
    () => setAudError(true),
  ), [])

  // Campañas: las usan la pestaña Campañas y el calendario (fecha prevista).
  const [campanas, setCampanas] = useState<Campana[]>([])
  useEffect(() => onSnapshot(
    query(collection(db, 'campanas'), orderBy('creadoAt', 'desc')),
    (s) => setCampanas(s.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<Campana, 'id'>) }))),
    () => toast.error('No se pudieron leer las campañas'),
  ), [])

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-3xl sm:text-4xl font-display font-bold text-coal">Mercadeo</h1>
        <p className="text-muted-fg mt-1">Audiencia y campañas de correo para los clientes de DeliStars</p>
      </div>

      <div className="flex gap-2 mb-6 border-b border-gray-200">
        {([['calendario', 'Calendario', CalendarDays], ['campanas', 'Campañas', Megaphone], ['audiencia', 'Audiencia', Users]] as const).map(([id, label, Icon]) => (
          <button key={id} onClick={() => setTab(id)}
            className={`px-4 py-2.5 text-sm font-semibold flex items-center gap-2 border-b-2 -mb-px transition-colors ${
              tab === id ? 'border-primary text-primary' : 'border-transparent text-muted-fg hover:text-coal'}`}>
            <Icon className="w-4 h-4" /> {label}
          </button>
        ))}
      </div>

      {tab === 'calendario' && <Calendario campanas={campanas} />}
      {tab === 'campanas' && <CampanasTab aud={aud} lista={campanas} />}
      {tab === 'audiencia' && <AudienciaTab aud={aud} error={audError} />}
    </div>
  )
}

// ─── Audiencia ──────────────────────────────────────────────────────────────
function AudienciaTab({ aud, error }: { aud: Audiencia | null; error: boolean }) {
  if (error || !aud) {
    return (
      <div className="bg-white border border-gray-200 rounded-lg p-6 text-sm text-muted-fg">
        {error
          ? 'No se pudo leer la audiencia. Intenta de nuevo en un momento.'
          : 'La audiencia todavía se está calculando: se actualiza cada hora con los clientes y sus pedidos.'}
      </div>
    )
  }
  return (
    <div className="flex flex-col gap-6">
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <Tarjeta titulo="Clientes registrados" valor={n(aud.clientes)} />
        <Tarjeta titulo="Con correo" valor={n(aud.conCorreo)} />
        <Tarjeta titulo="Aceptan promociones" valor={n(aud.aceptan)} destacado
          nota="Solo a ellos se les puede enviar publicidad (Ley 1581)" />
      </div>

      <div className="bg-white border border-gray-200 rounded-lg overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-xs text-muted-fg border-b border-gray-200">
              <th className="py-2.5 px-4 font-medium">Segmento</th>
              <th className="py-2.5 px-4 font-medium text-right">Clientes con correo</th>
              <th className="py-2.5 px-4 font-medium text-right">Aceptan promociones</th>
            </tr>
          </thead>
          <tbody>
            {SEGMENTOS.map((s) => {
              const seg = aud.segmentos?.[s.id]
              return (
                <tr key={s.id} className="border-b border-gray-100 last:border-0">
                  <td className="py-2.5 px-4">
                    <p className="font-medium text-coal">{s.nombre}</p>
                    <p className="text-xs text-muted-fg">{s.detalle}</p>
                  </td>
                  <td className="py-2.5 px-4 text-right">{n(seg?.clientes)}</td>
                  <td className="py-2.5 px-4 text-right font-semibold text-primary">{n(seg?.aceptan)}</td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      <p className="text-xs text-muted-fg flex items-start gap-1.5">
        <Info className="w-3.5 h-3.5 mt-0.5 shrink-0" />
        Los clientes aceptan recibir promociones con una casilla al hacer su pedido. Los correos nunca se muestran aquí:
        el envío se hará desde el servidor, solo a quienes aceptaron, y cada correo llevará un enlace para darse de baja.
        {aud.actualizado?.toDate && <> Actualizado: {aud.actualizado.toDate().toLocaleString('es-CO')}.</>}
      </p>
    </div>
  )
}

function Tarjeta({ titulo, valor, nota, destacado }: { titulo: string; valor: string; nota?: string; destacado?: boolean }) {
  return (
    <div className={`rounded-lg p-4 border ${destacado ? 'border-primary bg-primary/5' : 'border-gray-200 bg-white'}`}>
      <p className="text-xs text-muted-fg">{titulo}</p>
      <p className={`text-3xl font-display font-bold mt-1 ${destacado ? 'text-primary' : 'text-coal'}`}>{valor}</p>
      {nota && <p className="text-[11px] text-muted-fg mt-1">{nota}</p>}
    </div>
  )
}

// ─── Campañas ───────────────────────────────────────────────────────────────
function CampanasTab({ aud, lista }: { aud: Audiencia | null; lista: Campana[] }) {
  const { user } = useAuthStore()
  const [editando, setEditando] = useState<Campana | Omit<Campana, 'id'> | null>(null)
  const [guardando, setGuardando] = useState(false)

  const guardar = async () => {
    if (!editando) return
    const falta = faltantes(editando)
    if (falta.length) { toast.error(`Falta ${falta.join(', ')}`); return }
    setGuardando(true)
    try {
      const { id, ...datos } = editando as Campana
      const limpio = {
        nombre: datos.nombre.trim(), asunto: datos.asunto.trim(), segmento: datos.segmento,
        mensaje: datos.mensaje.trim(), imagenUrl: datos.imagenUrl?.trim() || '',
        botonTexto: datos.botonTexto?.trim() || '', botonUrl: datos.botonUrl?.trim() || '',
        fechaPrevista: datos.fechaPrevista || '',
        estado: datos.estado || 'borrador', actualizadoAt: serverTimestamp(),
        // Notificación y franja (§17): las métricas y la cola las escribe el servidor.
        canales: { correo: conCorreo(datos), push: !!datos.canales?.push, franja: !!datos.canales?.franja },
        sedeId: datos.sedeId || '',
        vigencia: { inicio: datos.vigencia?.inicio ?? null, fin: datos.vigencia?.fin ?? null },
        push: { titulo: datos.push?.titulo?.trim() || '', texto: datos.push?.texto?.trim() || '' },
        franja: { titulo: datos.franja?.titulo?.trim() || '', texto: datos.franja?.texto?.trim() || '' },
        destino: { tipo: datos.destino?.tipo || 'menu', id: datos.destino?.id ?? null },
      }
      if (id) await updateDoc(doc(db, 'campanas', id), limpio)
      else await addDoc(collection(db, 'campanas'), { ...limpio, creadoPor: user?.email || '', creadoAt: serverTimestamp() })
      toast.success('Campaña guardada')
      setEditando(null)
    } catch {
      toast.error('No se pudo guardar la campaña')
    } finally {
      setGuardando(false)
    }
  }

  const borrar = async (c: Campana) => {
    if (!confirm(`¿Borrar la campaña "${c.nombre}"?`)) return
    try { await deleteDoc(doc(db, 'campanas', c.id)); toast.success('Campaña borrada') }
    catch { toast.error('No se pudo borrar') }
  }

  if (editando) {
    const vivo = 'id' in editando ? lista.find((x) => x.id === editando.id) : undefined
    return <EditorCampana c={editando} vivo={vivo} setC={setEditando} aud={aud} onGuardar={guardar}
      onCancelar={() => setEditando(null)} guardando={guardando} />
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <p className="text-sm text-muted-fg">{lista.length} campaña{lista.length !== 1 ? 's' : ''}</p>
        <button onClick={() => setEditando({ ...CAMPANA_VACIA })}
          className="bg-primary text-white font-semibold rounded-lg px-4 py-2.5 text-sm inline-flex items-center gap-2 hover:opacity-90">
          <Plus className="w-4 h-4" /> Nueva campaña
        </button>
      </div>

      {lista.length === 0 ? (
        <div className="bg-white border border-dashed border-gray-300 rounded-lg p-8 text-center text-sm text-muted-fg">
          Aún no hay campañas. Crea la primera: queda como borrador hasta que se active el envío.
        </div>
      ) : (
        <div className="bg-white border border-gray-200 rounded-lg divide-y divide-gray-100">
          {lista.map((c) => (
            <div key={c.id} className="p-4 flex items-center gap-3 flex-wrap">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <p className="font-semibold text-coal truncate">{c.nombre}</p>
                  {conCorreo(c) && (
                    <span className={`text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full ${
                      c.estado === 'enviada' ? 'bg-emerald-100 text-emerald-700' : 'bg-gray-100 text-gray-600'}`}>
                      {c.estado === 'enviada' ? 'Correo enviado' : 'Borrador'}
                    </span>
                  )}
                  {ESTADO_PROG[estadoProgramacion(c)] && (
                    <span className={`text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full ${ESTADO_PROG[estadoProgramacion(c)].cls}`}>
                      {ESTADO_PROG[estadoProgramacion(c)].texto}
                    </span>
                  )}
                </div>
                <p className="text-xs text-muted-fg truncate">
                  {[conCorreo(c) && 'Correo', c.canales?.push && 'Notificación', c.canales?.franja && 'Franja'].filter(Boolean).join(' + ')}
                  {' '}· {nombreSegmento(c.segmento)}{c.sedeId ? ` · ${SEDES_CAMPANA[c.sedeId]}` : ''}
                  {c.metricas?.enviados ? ` · ${n(c.metricas.enviados)} notificaciones` : ''}{c.metricas?.pedidos ? ` · ${n(c.metricas.pedidos)} pedidos` : ''}
                </p>
              </div>
              <button onClick={() => setEditando(c)} className="p-2 rounded-lg text-muted-fg hover:text-primary hover:bg-primary/10" title="Editar">
                <Pencil className="w-4 h-4" />
              </button>
              <button onClick={() => borrar(c)} className="p-2 rounded-lg text-muted-fg hover:text-red-600 hover:bg-red-50" title="Borrar">
                <Trash2 className="w-4 h-4" />
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

function EditorCampana({ c, vivo, setC, aud, onGuardar, onCancelar, guardando }: {
  c: Campana | Omit<Campana, 'id'>
  vivo?: Campana
  setC: (c: Campana | Omit<Campana, 'id'>) => void
  aud: Audiencia | null
  onGuardar: () => void
  onCancelar: () => void
  guardando: boolean
}) {
  const set = (k: keyof Campana, v: string) => setC({ ...c, [k]: v })
  const setObj = <K extends 'canales' | 'vigencia' | 'push' | 'franja' | 'destino'>(k: K, v: Partial<NonNullable<Campana[K]>>) =>
    setC({ ...c, [k]: { ...(c[k] as object || {}), ...v } } as Campana)
  const destinatarios = aud?.segmentos?.[c.segmento]?.aceptan ?? 0
  const notificables = aud?.segmentos?.[c.segmento]?.notificables ?? 0
  const campo = 'w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-primary'
  const [productos, setProductos] = useState<Producto[]>([])
  const [categorias, setCategorias] = useState<Categoria[]>([])
  useEffect(() => {
    apiService.getProductos().then(setProductos).catch(() => {})
    apiService.getCategories().then(setCategorias).catch(() => {})
  }, [])
  const correo = conCorreo(c)

  return (
    <div className="grid lg:grid-cols-2 gap-6">
      <div className="bg-white border border-gray-200 rounded-lg p-5 flex flex-col gap-4">
        <p className="font-display font-semibold text-coal">{'id' in c ? 'Editar campaña' : 'Nueva campaña'}</p>
        <label className="text-xs font-medium text-coal">Nombre interno
          <input className={campo} value={c.nombre} onChange={(e) => set('nombre', e.target.value)} placeholder="Ej: Promo martes de perros" />
        </label>
        <label className="text-xs font-medium text-coal">Para quién
          <select className={campo} value={c.segmento} onChange={(e) => set('segmento', e.target.value)}>
            {SEGMENTOS.map((s) => <option key={s.id} value={s.id}>{s.nombre}</option>)}
          </select>
          <span className="text-[11px] text-muted-fg">
            {n(destinatarios)} con correo aceptan promociones · {n(notificables)} pueden recibir notificaciones
          </span>
        </label>
        <div className="text-xs font-medium text-coal flex flex-col gap-1.5">Canales
          <div className="flex flex-wrap gap-4 font-normal">
            <label className="inline-flex items-center gap-1.5"><input type="checkbox" checked={correo} onChange={(e) => setObj('canales', { correo: e.target.checked })} /> Correo</label>
            <label className="inline-flex items-center gap-1.5"><input type="checkbox" checked={!!c.canales?.push} onChange={(e) => setObj('canales', { push: e.target.checked })} /> Notificación (app y navegador)</label>
            <label className="inline-flex items-center gap-1.5"><input type="checkbox" checked={!!c.canales?.franja} onChange={(e) => setObj('canales', { franja: e.target.checked })} /> Franja del menú</label>
          </div>
          <span className="text-[11px] text-muted-fg font-normal">Cada cliente recibe máximo una promoción cada 24 horas, sumando correo y notificaciones. La franja no cuenta.</span>
        </div>
        <label className="text-xs font-medium text-coal">Fecha prevista de envío (opcional)
          <input type="date" className={campo} value={c.fechaPrevista || ''} onChange={(e) => set('fechaPrevista', e.target.value)} />
          <span className="text-[11px] text-muted-fg">Con fecha, la campaña aparece en el calendario.</span>
        </label>
        {(c.canales?.push || c.canales?.franja) && (
          <NotificacionYFranja c={c} setObj={setObj} onSede={(v) => setC({ ...c, sedeId: v })} campo={campo} productos={productos} categorias={categorias} />
        )}
        {correo && <>
        <label className="text-xs font-medium text-coal">Asunto del correo
          <input className={campo} value={c.asunto} onChange={(e) => set('asunto', e.target.value)} placeholder="Ej: 🌭 Hoy tu perro favorito con 20% off" maxLength={120} />
        </label>
        <label className="text-xs font-medium text-coal">Mensaje
          <textarea className={`${campo} h-40`} value={c.mensaje} onChange={(e) => set('mensaje', e.target.value)}
            placeholder={'Hola, {nombre} 👋\n\nEste martes...'} />
          <span className="text-[11px] text-muted-fg">Escribe {'{nombre}'} y se reemplaza por el primer nombre de cada cliente.</span>
        </label>
        <div className="text-xs font-medium text-coal flex flex-col gap-1">Imagen (opcional)
          <SubirImagen valor={c.imagenUrl} onCambio={(url) => set('imagenUrl', url)} />
          <details className="text-[11px] text-muted-fg">
            <summary className="cursor-pointer">¿La imagen ya está en internet? Pega el enlace</summary>
            <input className={`${campo} mt-1`} value={c.imagenUrl || ''} onChange={(e) => set('imagenUrl', e.target.value)} placeholder="https://…/promo.jpg" />
          </details>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <label className="text-xs font-medium text-coal">Texto del botón
            <input className={campo} value={c.botonTexto || ''} onChange={(e) => set('botonTexto', e.target.value)} />
          </label>
          <label className="text-xs font-medium text-coal">Enlace del botón
            <input className={campo} value={c.botonUrl || ''} onChange={(e) => set('botonUrl', e.target.value)} />
          </label>
        </div>
        </>}
        <div className="flex gap-2 flex-wrap pt-2">
          <button onClick={onGuardar} disabled={guardando}
            className="bg-primary text-white font-semibold rounded-lg px-4 py-2.5 text-sm inline-flex items-center gap-2 hover:opacity-90 disabled:opacity-50">
            <Save className="w-4 h-4" /> {guardando ? 'Guardando…' : 'Guardar'}
          </button>
          <button onClick={onCancelar} className="border border-gray-300 rounded-lg px-4 py-2.5 text-sm hover:bg-gray-50">Cancelar</button>
        </div>
        {vivo
          ? <>
              {conCorreo(vivo) && <EnvioCampana c={vivo} destinatarios={destinatarios} />}
              {(vivo.canales?.push || vivo.canales?.franja) && <ProgramarCampana c={vivo} notificables={vivo.canales?.push ? notificables : null} productos={productos} />}
            </>
          : <p className="text-[11px] text-muted-fg">Guarda la campaña para poder enviarla o programarla.</p>}
      </div>

      <div>
        <p className="text-xs font-medium text-muted-fg mb-2 flex items-center gap-1.5"><Eye className="w-3.5 h-3.5" /> Vista previa</p>
        {c.canales?.push && <VistaNotificacion c={c} />}
        {c.canales?.franja && <VistaFranja c={c} />}
        {correo && <VistaPrevia c={c} />}
      </div>
    </div>
  )
}

/**
 * Envío de la campaña: primero una prueba al correo de quien la está armando,
 * después a los clientes del segmento que aceptaron promociones. El panel solo
 * pide el envío (envio.estado); lo hace el servidor desde marketing@delistars.com.
 */
function EnvioCampana({ c, destinatarios }: { c: Campana; destinatarios: number }) {
  const { user } = useAuthStore()
  const [pidiendo, setPidiendo] = useState(false)
  const e = c.envio
  const pedir = async (datos: Record<string, unknown>) => {
    setPidiendo(true)
    try { await updateDoc(doc(db, 'campanas', c.id), datos) }
    catch { toast.error('No se pudo pedir el envío') }
    finally { setPidiendo(false) }
  }
  const prueba = () => pedir({
    envio: { estado: 'prueba_solicitada', pruebaA: user?.email || '', pruebaNombre: user?.displayName || '',
      solicitadoPor: user?.email || '', solicitadoAt: serverTimestamp(), error: null },
  })
  const historial = e?.historial ?? []
  const yaEnviada = e?.estado === 'enviada' || historial.length > 0
  const pausada = e?.estado === 'pausada'
  const fecha = (iso: string) => new Date(iso).toLocaleString('es-CO', { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' })
  const enviar = () => {
    const nadaPendiente = !pausada
    const aviso = yaEnviada && nadaPendiente
      ? `Esta campaña ya se envió ${historial.length} ${historial.length === 1 ? 'vez' : 'veces'}` +
        (historial.length ? ` (la última, ${fecha(historial[historial.length - 1].fecha)})` : '') +
        `.\n\n¿Enviarla OTRA VEZ a ${destinatarios} cliente${destinatarios !== 1 ? 's' : ''}? Les llegará de nuevo a todos.`
      : `¿Enviar "${c.asunto}" a ${destinatarios} cliente${destinatarios !== 1 ? 's' : ''}? Esto no se puede deshacer.`
    if (!confirm(aviso)) return
    pedir(pausada
      // Continuar: no se le repite a quien ya le llegó.
      ? { 'envio.estado': 'solicitado', 'envio.solicitadoPor': user?.email || '', 'envio.solicitadoAt': serverTimestamp(), 'envio.error': null }
      // Envío nuevo (también el reenvío): empieza de cero con todos.
      : {
          'envio.estado': 'solicitado', 'envio.solicitadoPor': user?.email || '', 'envio.solicitadoAt': serverTimestamp(),
          'envio.error': null, 'envio.enviadosUids': [], 'envio.enviados': 0, 'envio.fallidos': 0, 'envio.total': null,
          'envio.ronda': (e?.ronda ?? (historial.length || 0)) + 1,
        })
  }
  const ocupado = pidiendo || ['prueba_solicitada', 'solicitado', 'enviando'].includes(e?.estado || '')

  return (
    <div className="border-t border-gray-200 pt-4 flex flex-col gap-2">
      <p className="text-xs font-semibold text-coal">Enviar por correo (desde marketing@delistars.com)</p>
      <div className="flex gap-2 flex-wrap">
        <button onClick={prueba} disabled={ocupado}
          className="border border-primary text-primary rounded-lg px-4 py-2.5 text-sm font-semibold inline-flex items-center gap-2 hover:bg-primary/5 disabled:opacity-50">
          <Send className="w-4 h-4" /> Enviarme una prueba
        </button>
        <button onClick={enviar} disabled={ocupado || destinatarios === 0}
          title={destinatarios === 0 ? 'Nadie de este grupo ha aceptado promociones todavía' : undefined}
          className="bg-coal text-white rounded-lg px-4 py-2.5 text-sm font-semibold inline-flex items-center gap-2 hover:opacity-90 disabled:opacity-40">
          <Send className="w-4 h-4" /> {pausada ? 'Continuar envío'
            : `${yaEnviada ? 'Enviar de nuevo' : 'Enviar'} a ${n(destinatarios)} cliente${destinatarios !== 1 ? 's' : ''}`}
        </button>
      </div>
      <p className="text-[11px] text-muted-fg">
        Primero envíate la prueba y revísala en tu correo. Guarda los cambios antes de enviar: se envía lo último guardado.
      </p>
      {e && (
        <p className={`text-xs rounded-lg px-3 py-2 ${e.estado === 'error' || pausada ? 'bg-red-50 text-red-700' : e.estado === 'enviada' ? 'bg-emerald-50 text-emerald-800' : 'bg-sky-50 text-sky-800'}`}>
          {e.estado === 'prueba_solicitada' && 'Enviando la prueba…'}
          {e.estado === 'prueba_enviada' && `✓ Prueba enviada a ${e.pruebaA}. Revisa tu bandeja (y la carpeta de spam).`}
          {e.estado === 'solicitado' && 'Preparando el envío…'}
          {e.estado === 'enviando' && `Enviando… ${n(e.enviados)} de ${n(e.total)}`}
          {e.estado === 'enviada' && `✓ Enviada a ${n(e.enviados)} cliente${e.enviados !== 1 ? 's' : ''}${e.fallidos ? ` (${e.fallidos} no se pudieron entregar)` : ''}.`}
          {(e.estado === 'error' || pausada) && (e.error || 'Algo falló al enviar.')}
        </p>
      )}
      {historial.length > 0 && (
        <div className="text-[11px] text-muted-fg">
          <p className="font-semibold text-coal">Envíos de esta campaña</p>
          <ul className="mt-0.5 space-y-0.5">
            {historial.map((h, i) => (
              <li key={i}>
                {fecha(h.fecha)} · {n(h.enviados)} cliente{h.enviados !== 1 ? 's' : ''}{h.fallidos ? ` (${h.fallidos} fallidos)` : ''}{h.por ? ` · ${h.por}` : ''}
              </li>
            ))}
          </ul>
          <p className="mt-1">Cada envío deja una copia en la carpeta Enviados del correo.</p>
        </div>
      )}
    </div>
  )
}

/** Cómo se verá el correo. El HTML real lo arma el servidor al enviar. */
function VistaPrevia({ c }: { c: Omit<Campana, 'id'> }) {
  const mensaje = useMemo(() => c.mensaje.replace(/\{nombre\}/g, 'Ana'), [c.mensaje])
  return (
    <div className="bg-gray-100 rounded-lg p-4">
      <p className="text-xs text-muted-fg mb-2"><strong>Asunto:</strong> {c.asunto || '—'}</p>
      <div className="bg-white rounded-lg overflow-hidden max-w-md mx-auto shadow-sm">
        <div className="bg-coal py-4 flex justify-center">
          <img src={logo} alt="DeliStars" className="h-10" />
        </div>
        {c.imagenUrl && /^https:\/\//.test(c.imagenUrl) && (
          <img src={c.imagenUrl} alt="" className="w-full max-h-64 object-cover" />
        )}
        <div className="p-5">
          <p className="text-sm text-coal whitespace-pre-line leading-relaxed">{mensaje || 'Aquí va tu mensaje…'}</p>
          {c.botonTexto && (
            <div className="text-center mt-5">
              <span className="inline-block bg-primary text-white font-semibold rounded-lg px-6 py-3 text-sm">{c.botonTexto}</span>
            </div>
          )}
        </div>
        <div className="border-t border-gray-100 px-5 py-3 text-[10px] text-gray-400 text-center leading-relaxed">
          Recibes este correo porque aceptaste las promociones de DeliStars.<br />
          <span className="underline">Darme de baja</span>
        </div>
      </div>
    </div>
  )
}

/** Notificación y franja (§17.2): sede, vigencia, textos y destino. */
function NotificacionYFranja({ c, setObj, onSede, campo, productos, categorias }: {
  c: Campana | Omit<Campana, 'id'>
  setObj: <K extends 'canales' | 'vigencia' | 'push' | 'franja' | 'destino'>(k: K, v: Partial<NonNullable<Campana[K]>>) => void
  onSede: (v: string) => void
  campo: string; productos: Producto[]; categorias: Categoria[]
}) {
  const d = c.destino || { tipo: 'menu' as const }
  return (
    <div className="border border-sky-200 bg-sky-50/50 rounded-lg p-3 flex flex-col gap-3">
      <p className="text-xs font-semibold text-sky-800 flex items-center gap-1.5"><Bell className="w-3.5 h-3.5" /> Notificación y franja</p>
      <label className="text-xs font-medium text-coal">Sede
        <select className={campo} value={c.sedeId || ''} onChange={(e) => onSede(e.target.value)}>
          {Object.entries(SEDES_CAMPANA).map(([id, nombre]) => <option key={id} value={id}>{nombre}</option>)}
        </select>
        <span className="text-[11px] text-muted-fg font-normal">Con una sede, la notificación llega a quienes piden en esa sede y la franja sale en su menú.</span>
      </label>
      <div className="grid grid-cols-2 gap-3">
        <label className="text-xs font-medium text-coal">Empieza
          <input type="datetime-local" className={campo} value={aLocal(c.vigencia?.inicio)} onChange={(e) => setObj('vigencia', { inicio: deLocal(e.target.value) })} />
        </label>
        <label className="text-xs font-medium text-coal">Termina
          <input type="datetime-local" className={campo} value={aLocal(c.vigencia?.fin)} onChange={(e) => setObj('vigencia', { fin: deLocal(e.target.value) })} />
        </label>
      </div>
      {c.canales?.push && <>
        <label className="text-xs font-medium text-coal">Título de la notificación
          <input className={campo} maxLength={65} value={c.push?.titulo || ''} onChange={(e) => setObj('push', { titulo: e.target.value })} placeholder="Ej: 🌭 Martes de perros" />
        </label>
        <label className="text-xs font-medium text-coal">Texto de la notificación
          <textarea className={`${campo} h-20`} maxLength={180} value={c.push?.texto || ''} onChange={(e) => setObj('push', { texto: e.target.value })} placeholder="Ej: Hoy el perro clásico a $15.000 hasta las 11 p. m." />
        </label>
      </>}
      {c.canales?.franja && <>
        <label className="text-xs font-medium text-coal">Título en la franja
          <input className={campo} maxLength={60} value={c.franja?.titulo || ''} onChange={(e) => setObj('franja', { titulo: e.target.value })} placeholder={c.push?.titulo || 'Ej: Martes de perros'} />
        </label>
        <label className="text-xs font-medium text-coal">Texto en la franja
          <input className={campo} maxLength={120} value={c.franja?.texto || ''} onChange={(e) => setObj('franja', { texto: e.target.value })} placeholder="Ej: Solo hoy, en Santa Lucía" />
        </label>
      </>}
      <div className="grid grid-cols-2 gap-3">
        <label className="text-xs font-medium text-coal">Al tocarla abre
          <select className={campo} value={d.tipo} onChange={(e) => setObj('destino', { tipo: e.target.value as 'menu', id: null })}>
            <option value="menu">El menú</option>
            <option value="producto">Un producto</option>
            <option value="categoria">Una categoría</option>
            <option value="premios">Mis premios</option>
          </select>
        </label>
        {d.tipo === 'producto' && (
          <label className="text-xs font-medium text-coal">Producto
            <select className={campo} value={d.id ?? ''} onChange={(e) => setObj('destino', { id: e.target.value || null })}>
              <option value="">Elige…</option>
              {productos.map((p) => <option key={p.id_producto} value={p.id_producto}>{p.nombre_producto}</option>)}
            </select>
          </label>
        )}
        {d.tipo === 'categoria' && (
          <label className="text-xs font-medium text-coal">Categoría
            <select className={campo} value={d.id ?? ''} onChange={(e) => setObj('destino', { id: e.target.value || null })}>
              <option value="">Elige…</option>
              {categorias.map((x) => <option key={x.id_categoria} value={x.id_categoria}>{x.nombre_categoria}</option>)}
            </select>
          </label>
        )}
      </div>
      <p className="text-[11px] text-muted-fg">Solo comunica precios, ofertas y premios ya configurados por administración. Si la promoción ya terminó cuando el cliente abre la notificación, verá «Esta promoción terminó» y los precios de hoy.</p>
    </div>
  )
}

/** Programar, pausar o reanudar; destinatarios y métricas (las cuenta el servidor). */
function ProgramarCampana({ c, notificables, productos }: { c: Campana; notificables: number | null; productos: Producto[] }) {
  const [busy, setBusy] = useState(false)
  const estado = estadoProgramacion(c)
  const falta = faltantesProgramar(c, productos as never)
  const m = c.metricas || {}
  const cambiar = async (datos: Record<string, unknown>, ok: string) => {
    setBusy(true)
    try { await updateDoc(doc(db, 'campanas', c.id), datos); toast.success(ok) } catch { toast.error('No se pudo cambiar') } finally { setBusy(false) }
  }
  const fecha = (ms?: number | null) => (ms ? new Date(ms).toLocaleString('es-CO', { dateStyle: 'medium', timeStyle: 'short' }) : '—')
  return (
    <div className="border border-gray-200 rounded-lg p-3 flex flex-col gap-2">
      <p className="text-xs font-semibold text-coal flex items-center gap-1.5"><Bell className="w-3.5 h-3.5" /> Notificación y franja
        {ESTADO_PROG[estado] && <span className={`ml-1 text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full ${ESTADO_PROG[estado].cls}`}>{ESTADO_PROG[estado].texto}</span>}
      </p>
      <p className="text-[11px] text-muted-fg">Del {fecha(c.vigencia?.inicio)} al {fecha(c.vigencia?.fin)}{notificables != null ? ` · ${n(notificables)} clientes pueden recibir la notificación hoy` : ''}.</p>
      {estado === 'sin_programar' && (falta.length
        ? <p className="text-[11px] text-amber-700">Para programarla falta {falta.join(', ')}. Guarda los cambios primero.</p>
        : <button onClick={() => cambiar({ programada: true, pausada: false }, 'Campaña programada')} disabled={busy}
            className="self-start bg-primary text-white font-semibold rounded-lg px-4 py-2 text-sm inline-flex items-center gap-2 disabled:opacity-50"><Play className="w-4 h-4" /> Programar</button>)}
      {estado === 'programada' && (
        <button onClick={() => cambiar({ programada: false }, 'Ya no está programada')} disabled={busy} className="self-start border border-gray-300 rounded-lg px-3 py-1.5 text-sm">Quitar de la programación</button>
      )}
      {estado === 'activa' && (
        <button onClick={() => cambiar({ pausada: true }, 'Campaña pausada')} disabled={busy} className="self-start border border-amber-300 text-amber-800 rounded-lg px-3 py-1.5 text-sm inline-flex items-center gap-1.5"><Pause className="w-4 h-4" /> Pausar</button>
      )}
      {estado === 'pausada' && (
        <button onClick={() => cambiar({ pausada: false }, 'Campaña reanudada')} disabled={busy} className="self-start bg-primary text-white rounded-lg px-3 py-1.5 text-sm inline-flex items-center gap-1.5"><Play className="w-4 h-4" /> Reanudar</button>
      )}
      {c.programada && (
        <div className="grid grid-cols-4 gap-2 pt-1">
          {([['En cola', m.enCola], ['Enviadas', m.enviados], ['Vencidas', m.expirados], ['Sin permiso', m.omitidos],
             ['Aperturas', m.aperturas], ['Clics en la franja', m.clics], ['Pedidos', m.pedidos], ['En productos', m.ventas != null ? `$${n(m.ventas)}` : undefined]] as [string, number | string | undefined][])
            .map(([t, v]) => (
              <div key={t} className="bg-gray-50 rounded-md px-2 py-1.5">
                <p className="text-[10px] text-muted-fg leading-tight">{t}</p>
                <p className="text-sm font-semibold text-coal">{typeof v === 'string' ? v : n(v as number | undefined)}</p>
              </div>
            ))}
        </div>
      )}
      {c.programada && <p className="text-[10px] text-muted-fg flex items-start gap-1"><BarChart3 className="w-3 h-3 mt-0.5 shrink-0" /> Pedidos: los que hizo alguien que abrió esta campaña de esa sede en las 24 horas anteriores. Es una relación, no prueba que la campaña causó la compra.</p>}
    </div>
  )
}

function VistaNotificacion({ c }: { c: Campana | Omit<Campana, 'id'> }) {
  return (
    <div className="mb-4 bg-gray-800 rounded-2xl p-3 max-w-sm">
      <div className="bg-white/95 rounded-xl p-3 flex gap-3">
        <img src={logo} alt="" className="w-9 h-9 rounded-lg shrink-0" />
        <div className="min-w-0">
          <p className="text-[11px] text-gray-500">DeliStars · ahora</p>
          <p className="text-sm font-semibold text-gray-900 truncate">{c.push?.titulo || 'Título de la notificación'}</p>
          <p className="text-xs text-gray-700 line-clamp-3">{c.push?.texto || 'Texto de la notificación'}</p>
        </div>
      </div>
    </div>
  )
}

function VistaFranja({ c }: { c: Campana | Omit<Campana, 'id'> }) {
  return (
    <div className="mb-4 max-w-sm rounded-2xl bg-gradient-to-r from-red-600 to-orange-500 text-white px-4 py-3 flex items-center gap-3">
      <span className="text-2xl">⭐</span>
      <span className="flex-1 min-w-0">
        <span className="block font-display text-lg leading-tight">{c.franja?.titulo || c.push?.titulo || c.nombre || 'Título'}</span>
        <span className="block text-xs opacity-90">{c.franja?.texto || 'Texto de la franja'}</span>
      </span>
      <span className="rounded-xl bg-white/20 px-3 py-2 text-sm font-semibold">Ver</span>
    </div>
  )
}
