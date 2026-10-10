import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { collection, onSnapshot, query, where } from 'firebase/firestore'
import { db } from '@/services/firebase'
import { tipoDe, fechaTexto, sumarDias, actividadesDelDia, SEDES_ACT, type Actividad } from '@/lib/calendario'

// Alerta en Resumen: qué tiene Mercadeo programado hoy (y mañana), sacado del
// calendario de la pestaña Mercadeo. El scheduler manda lo mismo al celular
// de administración a las 10:00 a. m.
export default function AvisoMercadeo() {
  const hoy = fechaTexto(new Date())
  const manana = sumarDias(hoy, 1)
  const [acts, setActs] = useState<Actividad[]>([])

  useEffect(() => onSnapshot(
    query(collection(db, 'mercadeo', 'calendario', 'actividades'), where('inicio', '<=', manana)),
    (s) => setActs(s.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<Actividad, 'id'>) }))),
    () => {},
  ), [manana])

  const vigentes = (dia: string) =>
    actividadesDelDia(acts, dia).filter((a) => a.estado !== 'cancelada' && a.estado !== 'hecha')
  const deHoy = vigentes(hoy)
  const deManana = vigentes(manana).filter((a) => !deHoy.some((h) => h.id === a.id))
  if (!deHoy.length && !deManana.length) return null

  const fila = (a: Actividad) => (
    <li key={a.id} className="flex items-start gap-2 text-sm">
      <span className={`text-[10px] font-semibold rounded border px-1.5 py-0.5 shrink-0 mt-0.5 ${tipoDe(a.tipo).color}`}>{tipoDe(a.tipo).nombre}</span>
      <span className="text-coal">
        <strong>{a.titulo}</strong>
        <span className="text-muted-fg"> · {SEDES_ACT.find((s) => s.id === a.sede)?.nombre}{a.responsable ? ` · ${a.responsable}` : ''}</span>
        {a.notas && <span className="block text-xs text-muted-fg line-clamp-2">{a.notas}</span>}
      </span>
    </li>
  )

  return (
    <Link to="/mercadeo" className="block bg-fuchsia-50 border border-fuchsia-200 rounded-lg p-4 mb-8 hover:bg-fuchsia-100/70 transition-colors">
      {deHoy.length > 0 && (
        <>
          <p className="font-semibold text-fuchsia-900 text-sm mb-2">📣 Mercadeo hoy: {deHoy.length} actividad{deHoy.length > 1 ? 'es' : ''}</p>
          <ul className="space-y-1.5">{deHoy.map(fila)}</ul>
        </>
      )}
      {deManana.length > 0 && (
        <>
          <p className={`font-semibold text-fuchsia-900/80 text-xs ${deHoy.length ? 'mt-3' : ''} mb-1.5`}>Mañana</p>
          <ul className="space-y-1.5">{deManana.map(fila)}</ul>
        </>
      )}
    </Link>
  )
}
