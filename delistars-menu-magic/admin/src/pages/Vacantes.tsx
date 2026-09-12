import { useEffect, useState } from 'react'
import {
  collection, onSnapshot, query, orderBy, addDoc, updateDoc, deleteDoc, doc,
  serverTimestamp, type Timestamp,
} from 'firebase/firestore'
import { db } from '@/services/firebase'
import { toast } from 'sonner'
import { Plus, Pencil, Trash2, Eye, EyeOff, X } from 'lucide-react'

interface Postulante {
  id: string
  name?: string
  phone?: string
  email?: string
  cvUrl?: string
  cvName?: string
  submittedAt?: Timestamp
}

interface Vacante {
  id: string
  titulo?: string
  subtitulo?: string
  zona?: string
  descripcion?: string
  beneficios?: string[]
  requisitos?: string[]
  activa?: boolean
  createdAt?: Timestamp
}

interface VacanteForm {
  titulo: string
  subtitulo: string
  zona: string
  descripcion: string
  beneficios: string   // una por línea
  requisitos: string   // una por línea
  activa: boolean
}

const emptyForm: VacanteForm = { titulo: '', subtitulo: '', zona: '', descripcion: '', beneficios: '', requisitos: '', activa: true }

const toForm = (v: Vacante): VacanteForm => ({
  titulo: v.titulo || '',
  subtitulo: v.subtitulo || '',
  zona: v.zona || '',
  descripcion: v.descripcion || '',
  beneficios: (v.beneficios || []).join('\n'),
  requisitos: (v.requisitos || []).join('\n'),
  activa: v.activa ?? true,
})

const linesToArray = (s: string) => s.split('\n').map((l) => l.trim()).filter(Boolean)

const fmtFecha = (ts?: Timestamp): string => {
  if (!ts?.toDate) return 'Fecha desconocida'
  return ts.toDate().toLocaleString('es-CO', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })
}

export default function Vacantes() {
  const [tab, setTab] = useState<'vacantes' | 'postulantes' | 'preview'>('vacantes')
  const [vacantes, setVacantes] = useState<Vacante[]>([])
  const [postulantes, setPostulantes] = useState<Postulante[]>([])
  const [loading, setLoading] = useState(true)
  const [editingId, setEditingId] = useState<string | null>(null) // null = ninguno, '' = nuevo
  const [form, setForm] = useState<VacanteForm>(emptyForm)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    const unsub1 = onSnapshot(query(collection(db, 'vacantes'), orderBy('createdAt', 'desc')), (snap) => {
      setVacantes(snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<Vacante, 'id'>) })))
    }, (err) => console.error('Error al leer vacantes:', err))
    const unsub2 = onSnapshot(query(collection(db, 'vacantes_postulantes'), orderBy('submittedAt', 'desc')), (snap) => {
      setPostulantes(snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<Postulante, 'id'>) })))
      setLoading(false)
    }, () => setLoading(false))
    return () => { unsub1(); unsub2() }
  }, [])

  const openNew = () => { setForm(emptyForm); setEditingId('') }
  const openEdit = (v: Vacante) => { setForm(toForm(v)); setEditingId(v.id) }
  const set = (k: keyof VacanteForm, val: string | boolean) => setForm((f) => ({ ...f, [k]: val }))

  const save = async () => {
    if (!form.titulo.trim()) { toast.error('El título es obligatorio'); return }
    setSaving(true)
    try {
      const payload = {
        titulo: form.titulo.trim(),
        subtitulo: form.subtitulo.trim(),
        zona: form.zona.trim(),
        descripcion: form.descripcion.trim(),
        beneficios: linesToArray(form.beneficios),
        requisitos: linesToArray(form.requisitos),
        activa: form.activa,
      }
      if (editingId) {
        await updateDoc(doc(db, 'vacantes', editingId), { ...payload, updatedAt: serverTimestamp() })
        toast.success('Vacante actualizada')
      } else {
        await addDoc(collection(db, 'vacantes'), { ...payload, createdAt: serverTimestamp() })
        toast.success('Vacante publicada')
      }
      setEditingId(null)
    } catch (err) {
      console.error(err)
      toast.error('No se pudo guardar. Verifica los permisos.')
    } finally {
      setSaving(false)
    }
  }

  const toggleActiva = async (v: Vacante) => {
    try { await updateDoc(doc(db, 'vacantes', v.id), { activa: !v.activa }) }
    catch { toast.error('No se pudo cambiar el estado') }
  }

  const remove = async (v: Vacante) => {
    if (!window.confirm(`¿Eliminar la vacante "${v.titulo}"? Ya no aparecerá en la página.`)) return
    try { await deleteDoc(doc(db, 'vacantes', v.id)); toast.success('Vacante eliminada') }
    catch { toast.error('No se pudo eliminar') }
  }

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-3 mb-6">
        <div>
          <h1 className="text-3xl sm:text-4xl font-display font-bold text-coal">Vacantes</h1>
          <p className="text-muted-fg mt-1">Publica ofertas de trabajo y revisa los postulantes</p>
        </div>
        {tab === 'vacantes' && (
          <button onClick={openNew} className="flex items-center gap-2 bg-primary text-white rounded-lg px-4 py-2 text-sm font-medium">
            <Plus className="w-4 h-4" /> Nueva vacante
          </button>
        )}
      </div>

      {/* Tabs */}
      <div className="flex gap-2 mb-6">
        <button onClick={() => setTab('vacantes')} className={`px-4 py-2 rounded-lg text-sm font-medium ${tab === 'vacantes' ? 'bg-coal text-white' : 'border text-coal'}`}>
          📋 Vacantes ({vacantes.length})
        </button>
        <button onClick={() => setTab('postulantes')} className={`px-4 py-2 rounded-lg text-sm font-medium ${tab === 'postulantes' ? 'bg-coal text-white' : 'border text-coal'}`}>
          👥 Postulantes ({postulantes.length})
        </button>
        <button onClick={() => setTab('preview')} className={`px-4 py-2 rounded-lg text-sm font-medium ${tab === 'preview' ? 'bg-coal text-white' : 'border text-coal'}`}>
          👁️ Vista previa (como usuario)
        </button>
      </div>

      {/* Vista previa: la página real de /vacantes/ tal como la ve un cliente
          (mismo origen, sin login → muestra la oferta activa + formulario). */}
      {tab === 'preview' && (
        <div>
          <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
            <p className="text-sm text-muted-fg">
              Así se ve la página de vacantes para el cliente. Se actualiza sola con lo que publiques.
            </p>
            <a href="/vacantes/" target="_blank" rel="noreferrer"
              className="text-sm font-medium text-primary underline underline-offset-4">
              Abrir en pestaña nueva ↗
            </a>
          </div>
          <div className="border border-gray-200 rounded-xl overflow-hidden bg-white">
            <iframe
              src="/vacantes/"
              title="Vista previa de vacantes"
              className="w-full"
              style={{ height: '78vh', border: 'none' }}
            />
          </div>
        </div>
      )}

      {tab !== 'preview' && (tab === 'vacantes' ? (
        vacantes.length === 0 ? (
          <div className="text-center py-16">
            <p className="text-4xl mb-2">📋</p>
            <p className="text-muted-fg">Aún no hay vacantes publicadas. Crea la primera con “Nueva vacante”.</p>
            <p className="text-xs text-muted-fg mt-1">Mientras no haya ninguna activa, la página muestra la oferta por defecto de domiciliario.</p>
          </div>
        ) : (
          <div className="space-y-3 max-w-3xl">
            {vacantes.map((v) => (
              <div key={v.id} className={`bg-white border rounded-lg p-4 ${v.activa ? 'border-gray-200' : 'border-gray-200 opacity-60'}`}>
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="font-semibold text-coal">
                      {v.titulo}
                      {!v.activa && <span className="ml-2 text-[10px] uppercase tracking-wider text-muted-fg font-bold">oculta</span>}
                    </p>
                    {v.subtitulo && <p className="text-sm text-muted-fg">{v.subtitulo}</p>}
                    {v.zona && <p className="text-xs text-muted-fg mt-0.5">📍 {v.zona}</p>}
                    <p className="text-xs text-muted-fg mt-1">
                      {(v.beneficios?.length || 0)} beneficios · {(v.requisitos?.length || 0)} requisitos
                    </p>
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    <button onClick={() => toggleActiva(v)} title={v.activa ? 'Ocultar' : 'Publicar'} className="text-coal/60 hover:bg-gray-100 rounded p-1.5">
                      {v.activa ? <Eye className="w-4 h-4" /> : <EyeOff className="w-4 h-4" />}
                    </button>
                    <button onClick={() => openEdit(v)} title="Editar" className="text-primary hover:bg-primary/10 rounded p-1.5"><Pencil className="w-4 h-4" /></button>
                    <button onClick={() => remove(v)} title="Eliminar" className="text-red-600 hover:bg-red-50 rounded p-1.5"><Trash2 className="w-4 h-4" /></button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )
      ) : loading ? (
        <p className="text-muted-fg">Cargando…</p>
      ) : postulantes.length === 0 ? (
        <div className="text-center py-16">
          <p className="text-4xl mb-2">📭</p>
          <p className="text-muted-fg">Aún no hay postulantes</p>
        </div>
      ) : (
        <div className="space-y-3 max-w-3xl">
          {postulantes.map((p, i) => (
            <div key={p.id} className="bg-white border border-gray-200 rounded-lg p-4 flex flex-col gap-3">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-full bg-cherry/10 flex items-center justify-center">
                  <span className="font-display text-base text-cherry">{i + 1}</span>
                </div>
                <div>
                  <p className="font-semibold text-sm text-coal">{p.name || '—'}</p>
                  <p className="text-xs text-muted-fg">{fmtFecha(p.submittedAt)}</p>
                </div>
              </div>
              <div className="flex flex-col gap-1.5 bg-gray-50 rounded-xl p-3">
                {p.phone && <a href={`tel:${p.phone}`} className="text-sm text-cherry font-semibold">📞 {p.phone}</a>}
                {p.email && <a href={`mailto:${p.email}`} className="text-sm text-coal/70">✉️ {p.email}</a>}
              </div>
              {p.cvUrl && (
                <a href={p.cvUrl} target="_blank" rel="noreferrer"
                  className="flex items-center justify-center gap-2 py-2.5 px-4 rounded-xl bg-mint/10 border border-mint/30 text-mint font-semibold text-sm hover:bg-mint/20 transition-colors">
                  ⬇️ Descargar hoja de vida {p.cvName && <span className="text-xs font-normal text-mint/60">({p.cvName})</span>}
                </a>
              )}
            </div>
          ))}
        </div>
      ))}

      {/* Modal crear/editar vacante */}
      {editingId !== null && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={(e) => { if (e.target === e.currentTarget) setEditingId(null) }}>
          <div className="bg-white rounded-xl shadow-xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
            <div className="sticky top-0 bg-white border-b border-gray-200 px-5 py-4 flex items-center justify-between">
              <p className="font-display text-xl font-bold text-coal">{editingId ? 'Editar vacante' : 'Nueva vacante'}</p>
              <button onClick={() => setEditingId(null)} className="p-1.5 rounded hover:bg-gray-100 text-coal/60"><X className="w-5 h-5" /></button>
            </div>
            <div className="p-5 flex flex-col gap-3">
              <label className="flex flex-col gap-1">
                <span className="text-xs font-semibold text-muted-fg">Título *</span>
                <input className="border rounded px-3 py-2 text-sm" value={form.titulo} onChange={(e) => set('titulo', e.target.value)} placeholder="Ej: Domiciliario / Mensajero Motorizado" />
              </label>
              <label className="flex flex-col gap-1">
                <span className="text-xs font-semibold text-muted-fg">Subtítulo</span>
                <input className="border rounded px-3 py-2 text-sm" value={form.subtitulo} onChange={(e) => set('subtitulo', e.target.value)} placeholder="Ej: Pago diario + 100% propinas" />
              </label>
              <label className="flex flex-col gap-1">
                <span className="text-xs font-semibold text-muted-fg">Zona</span>
                <input className="border rounded px-3 py-2 text-sm" value={form.zona} onChange={(e) => set('zona', e.target.value)} placeholder="Ej: Santa Lucía / La América – Medellín" />
              </label>
              <label className="flex flex-col gap-1">
                <span className="text-xs font-semibold text-muted-fg">Descripción</span>
                <textarea className="border rounded px-3 py-2 text-sm h-28" value={form.descripcion} onChange={(e) => set('descripcion', e.target.value)} placeholder="Describe el cargo…" />
              </label>
              <label className="flex flex-col gap-1">
                <span className="text-xs font-semibold text-muted-fg">Beneficios (uno por línea)</span>
                <textarea className="border rounded px-3 py-2 text-sm h-24" value={form.beneficios} onChange={(e) => set('beneficios', e.target.value)} placeholder={'Pago diario en efectivo\n100% de las propinas\nHorario flexible'} />
              </label>
              <label className="flex flex-col gap-1">
                <span className="text-xs font-semibold text-muted-fg">Requisitos (uno por línea)</span>
                <textarea className="border rounded px-3 py-2 text-sm h-24" value={form.requisitos} onChange={(e) => set('requisitos', e.target.value)} placeholder={'Moto propia\nLicencia A2 vigente\nDocumentos al día'} />
              </label>
              <label className="flex items-center gap-2 text-sm">
                <input type="checkbox" checked={form.activa} onChange={(e) => set('activa', e.target.checked)} />
                Publicada (visible en la página de vacantes)
              </label>
              <div className="flex gap-2 border-t border-gray-100 pt-4 mt-1">
                <button onClick={() => setEditingId(null)} disabled={saving} className="flex-1 text-sm font-semibold px-4 py-2 rounded border text-coal">Cancelar</button>
                <button onClick={save} disabled={saving} className="flex-1 text-sm font-semibold px-4 py-2 rounded bg-primary text-white disabled:opacity-50">
                  {saving ? 'Guardando…' : editingId ? 'Guardar' : 'Publicar'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
