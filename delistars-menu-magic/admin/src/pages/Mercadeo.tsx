import { useEffect, useMemo, useState } from 'react'
import {
  collection, doc, onSnapshot, orderBy, query, addDoc, updateDoc, deleteDoc, serverTimestamp,
} from 'firebase/firestore'
import { toast } from 'sonner'
import { Users, Megaphone, Plus, Save, Trash2, Send, Eye, Pencil, Info } from 'lucide-react'
import { db } from '@/services/firebase'
import { useAuthStore } from '@/store/authStore'
import logo from '@/assets/logo.svg'
import {
  SEGMENTOS, nombreSegmento, CAMPANA_VACIA, faltantes, type Audiencia, type Campana,
} from '@/lib/mercadeo'

const n = (v?: number) => (v ?? 0).toLocaleString('es-CO')

export default function Mercadeo() {
  const [tab, setTab] = useState<'audiencia' | 'campanas'>('audiencia')
  const [aud, setAud] = useState<Audiencia | null>(null)
  const [audError, setAudError] = useState(false)

  useEffect(() => onSnapshot(
    doc(db, 'config', 'mercadeo_audiencia'),
    (s) => setAud(s.exists() ? (s.data() as Audiencia) : null),
    () => setAudError(true),
  ), [])

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-3xl sm:text-4xl font-display font-bold text-coal">Mercadeo</h1>
        <p className="text-muted-fg mt-1">Audiencia y campañas de correo para los clientes de DeliStars</p>
      </div>

      <div className="flex gap-2 mb-6 border-b border-gray-200">
        {([['audiencia', 'Audiencia', Users], ['campanas', 'Campañas', Megaphone]] as const).map(([id, label, Icon]) => (
          <button key={id} onClick={() => setTab(id)}
            className={`px-4 py-2.5 text-sm font-semibold flex items-center gap-2 border-b-2 -mb-px transition-colors ${
              tab === id ? 'border-primary text-primary' : 'border-transparent text-muted-fg hover:text-coal'}`}>
            <Icon className="w-4 h-4" /> {label}
          </button>
        ))}
      </div>

      {tab === 'audiencia'
        ? <AudienciaTab aud={aud} error={audError} />
        : <CampanasTab aud={aud} />}
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
function CampanasTab({ aud }: { aud: Audiencia | null }) {
  const { user } = useAuthStore()
  const [lista, setLista] = useState<Campana[]>([])
  const [editando, setEditando] = useState<Campana | Omit<Campana, 'id'> | null>(null)
  const [guardando, setGuardando] = useState(false)

  useEffect(() => onSnapshot(
    query(collection(db, 'campanas'), orderBy('creadoAt', 'desc')),
    (s) => setLista(s.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<Campana, 'id'>) }))),
    () => toast.error('No se pudieron leer las campañas'),
  ), [])

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
        estado: datos.estado || 'borrador', actualizadoAt: serverTimestamp(),
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
    return <EditorCampana c={editando} setC={setEditando} aud={aud} onGuardar={guardar}
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
                  <span className={`text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full ${
                    c.estado === 'enviada' ? 'bg-emerald-100 text-emerald-700' : 'bg-gray-100 text-gray-600'}`}>
                    {c.estado === 'enviada' ? 'Enviada' : 'Borrador'}
                  </span>
                </div>
                <p className="text-xs text-muted-fg truncate">
                  {c.asunto} · {nombreSegmento(c.segmento)} · {n(aud?.segmentos?.[c.segmento]?.aceptan)} destinatarios
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

function EditorCampana({ c, setC, aud, onGuardar, onCancelar, guardando }: {
  c: Campana | Omit<Campana, 'id'>
  setC: (c: Campana | Omit<Campana, 'id'>) => void
  aud: Audiencia | null
  onGuardar: () => void
  onCancelar: () => void
  guardando: boolean
}) {
  const set = (k: keyof Campana, v: string) => setC({ ...c, [k]: v })
  const destinatarios = aud?.segmentos?.[c.segmento]?.aceptan ?? 0
  const campo = 'w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-primary'

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
          <span className="text-[11px] text-muted-fg">{n(destinatarios)} clientes de este grupo aceptan promociones</span>
        </label>
        <label className="text-xs font-medium text-coal">Asunto del correo
          <input className={campo} value={c.asunto} onChange={(e) => set('asunto', e.target.value)} placeholder="Ej: 🌭 Hoy tu perro favorito con 20% off" maxLength={120} />
        </label>
        <label className="text-xs font-medium text-coal">Mensaje
          <textarea className={`${campo} h-40`} value={c.mensaje} onChange={(e) => set('mensaje', e.target.value)}
            placeholder={'Hola, {nombre} 👋\n\nEste martes...'} />
          <span className="text-[11px] text-muted-fg">Escribe {'{nombre}'} y se reemplaza por el primer nombre de cada cliente.</span>
        </label>
        <label className="text-xs font-medium text-coal">Imagen (opcional, enlace https://)
          <input className={campo} value={c.imagenUrl || ''} onChange={(e) => set('imagenUrl', e.target.value)} placeholder="https://…/promo.jpg" />
        </label>
        <div className="grid grid-cols-2 gap-3">
          <label className="text-xs font-medium text-coal">Texto del botón
            <input className={campo} value={c.botonTexto || ''} onChange={(e) => set('botonTexto', e.target.value)} />
          </label>
          <label className="text-xs font-medium text-coal">Enlace del botón
            <input className={campo} value={c.botonUrl || ''} onChange={(e) => set('botonUrl', e.target.value)} />
          </label>
        </div>
        <div className="flex gap-2 flex-wrap pt-2">
          <button onClick={onGuardar} disabled={guardando}
            className="bg-primary text-white font-semibold rounded-lg px-4 py-2.5 text-sm inline-flex items-center gap-2 hover:opacity-90 disabled:opacity-50">
            <Save className="w-4 h-4" /> {guardando ? 'Guardando…' : 'Guardar borrador'}
          </button>
          <button onClick={onCancelar} className="border border-gray-300 rounded-lg px-4 py-2.5 text-sm hover:bg-gray-50">Cancelar</button>
          <button disabled title="Se activa cuando se configure el envío de correos"
            className="ml-auto border border-gray-200 text-muted-fg rounded-lg px-4 py-2.5 text-sm inline-flex items-center gap-2 cursor-not-allowed">
            <Send className="w-4 h-4" /> Enviar (pendiente de configurar el correo)
          </button>
        </div>
      </div>

      <div>
        <p className="text-xs font-medium text-muted-fg mb-2 flex items-center gap-1.5"><Eye className="w-3.5 h-3.5" /> Vista previa</p>
        <VistaPrevia c={c} />
      </div>
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
