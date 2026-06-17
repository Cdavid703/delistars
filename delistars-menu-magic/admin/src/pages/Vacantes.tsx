import { useEffect, useState } from 'react'
import { collection, onSnapshot, query, orderBy, type Timestamp } from 'firebase/firestore'
import { db } from '@/services/firebase'

interface Postulante {
  id: string
  name?: string
  phone?: string
  email?: string
  cvUrl?: string
  cvName?: string
  submittedAt?: Timestamp
}

const fmtFecha = (ts?: Timestamp): string => {
  if (!ts?.toDate) return 'Fecha desconocida'
  return ts.toDate().toLocaleString('es-CO', {
    day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit',
  })
}

export default function Vacantes() {
  const [postulantes, setPostulantes] = useState<Postulante[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const q = query(collection(db, 'vacantes_postulantes'), orderBy('submittedAt', 'desc'))
    return onSnapshot(q, (snap) => {
      setPostulantes(snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<Postulante, 'id'>) })))
      setLoading(false)
    }, (err) => { setError(err.message || 'Error al cargar postulantes'); setLoading(false) })
  }, [])

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-4xl font-display font-bold text-coal">Vacantes</h1>
        <p className="text-muted-fg mt-1">Postulantes recibidos</p>
      </div>

      {loading ? (
        <p className="text-muted-fg">Cargando postulantes…</p>
      ) : error ? (
        <div className="bg-red-50 border border-red-200 rounded-lg p-4 text-red-700 text-sm">{error}</div>
      ) : postulantes.length === 0 ? (
        <div className="text-center py-16">
          <p className="text-4xl mb-2">📭</p>
          <p className="text-muted-fg">Aún no hay postulantes</p>
        </div>
      ) : (
        <div className="space-y-3">
          <div className="bg-coal text-cream rounded-lg p-4 flex items-center gap-4">
            <div className="w-12 h-12 bg-cherry rounded-full flex items-center justify-center text-xl">👥</div>
            <div>
              <p className="font-display text-2xl">{postulantes.length}</p>
              <p className="text-xs opacity-60">
                Postulante{postulantes.length !== 1 ? 's' : ''} recibido{postulantes.length !== 1 ? 's' : ''}
              </p>
            </div>
          </div>

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
                  ⬇️ Descargar hoja de vida
                  {p.cvName && <span className="text-xs font-normal text-mint/60">({p.cvName})</span>}
                </a>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
