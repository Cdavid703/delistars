// ─── Historial de turnos (solo consulta) ─────────────────────────────────────
// Cómo quedó cada semana (lo último publicado), de la semana tal a la semana
// tal. Siempre semanas completas de lunes a domingo.
// ESPEJO de HistorialTurnos en src/pages/TurnosPage.jsx (repo raíz).
import { useEffect, useState } from 'react'
import { collection, getDocs } from 'firebase/firestore'
import { db } from '@/services/firebase'
import { toast } from 'sonner'
import {
  DIAS, etiquetaSemana, fechaCorta, filasSemana, lunesDe, lunesDeRegistro, semanasEntre, sumarDias,
  type RegistroSemana,
} from '@/lib/turnos'
import { exportarExcel, exportarPDF, type SemanaHistorial } from '@/lib/turnosExport'

const DIA_LARGO: Record<string, string> = {
  lun: 'Lunes', mar: 'Martes', mie: 'Miércoles', jue: 'Jueves', vie: 'Viernes', sab: 'Sábado', dom: 'Domingo',
}
// Mismos colores del cuadro editable (ver SEDE_OPTS en Turnos.tsx).
const COLOR: Record<string, string> = {
  santa_lucia:    'bg-cherry/15 text-cherry border-cherry/30',
  santa_teresita: 'bg-mint/15 text-mint border-mint/30',
  descanso:       'bg-gray-100 text-coal/40 border-gray-200',
  trabajo:        'bg-mustard/20 text-mustard border-mustard/30',
}
const SIN_VALOR = 'bg-gray-50 text-coal/20 border-gray-100'

export default function TurnosHistorial({ directorio }: {
  directorio: { id: string; short: string; type: string }[]
}) {
  const hoyLunes = lunesDe()
  const [registros, setRegistros] = useState<Record<string, RegistroSemana> | null>(null)
  const [error, setError] = useState(false)
  const [desde, setDesde] = useState(sumarDias(hoyLunes, -28))
  const [hasta, setHasta] = useState(hoyLunes)
  const [exportando, setExportando] = useState('')

  useEffect(() => {
    getDocs(collection(db, 'turnos'))
      .then((snap) => {
        const porLunes: Record<string, RegistroSemana> = {}
        snap.docs.forEach((d) => {
          const data = d.data() as RegistroSemana
          const lunes = lunesDeRegistro(d.id, data)
          if (lunes) porLunes[lunes] = data
        })
        setRegistros(porLunes)
        const primera = Object.keys(porLunes).sort()[0]
        if (primera) setDesde((d) => (d < primera ? primera : d))
      })
      .catch(() => setError(true))
  }, [])

  if (error) return <p className="text-cherry">No se pudo cargar el historial. Revisa la conexión e inténtalo de nuevo.</p>
  if (!registros) return <p className="text-muted-fg">Cargando historial…</p>

  // Se puede escoger desde la primera semana publicada hasta la próxima.
  const primera = Object.keys(registros).sort()[0] ?? hoyLunes
  const opciones = semanasEntre(primera < hoyLunes ? primera : hoyLunes, sumarDias(hoyLunes, 7)).reverse()
  const tienePublicado = (l: string) => Object.keys(registros[l]?.schedule ?? {}).length > 0
  const etiqueta = (l: string) => `Semana del ${etiquetaSemana(l)}${
    l === hoyLunes ? ' · esta semana' : l === sumarDias(hoyLunes, 7) ? ' · próxima' : ''
  }${tienePublicado(l) ? '' : ' · sin cuadro'}`

  const rangoValido = desde <= hasta
  const semanas: SemanaHistorial[] = rangoValido
    ? semanasEntre(desde, hasta).map((lunes) => ({
        lunes,
        filas: tienePublicado(lunes) ? filasSemana(registros[lunes], directorio) : null,
      }))
    : []
  const publicadas = semanas.filter((s) => s.filas).length

  const exportar = async (tipo: 'excel' | 'pdf') => {
    setExportando(tipo)
    try { await (tipo === 'excel' ? exportarExcel(semanas) : exportarPDF(semanas)) }
    catch { toast.error('No se pudo generar el archivo') }
    finally { setExportando('') }
  }

  const selectCls = 'w-full bg-white rounded-lg border border-gray-200 px-3 py-2 text-sm text-coal'
  return (
    <div className="flex flex-col gap-5">
      <div className="bg-white border border-gray-200 rounded-lg p-4 flex flex-col gap-3 max-w-3xl">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <label className="flex flex-col gap-1">
            <span className="text-[11px] font-bold uppercase tracking-wider text-muted-fg">Desde la semana</span>
            <select value={desde} onChange={(e) => setDesde(e.target.value)} className={selectCls}>
              {opciones.map((l) => <option key={l} value={l}>{etiqueta(l)}</option>)}
            </select>
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-[11px] font-bold uppercase tracking-wider text-muted-fg">Hasta la semana</span>
            <select value={hasta} onChange={(e) => setHasta(e.target.value)} className={selectCls}>
              {opciones.map((l) => <option key={l} value={l}>{etiqueta(l)}</option>)}
            </select>
          </label>
        </div>
        {rangoValido ? (
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-xs text-muted-fg">
              {semanas.length === 1 ? '1 semana' : `${semanas.length} semanas`} · {publicadas} con cuadro publicado
            </p>
            <div className="flex gap-2">
              {([['excel', 'Exportar Excel'], ['pdf', 'Exportar PDF']] as const).map(([tipo, label]) => (
                <button key={tipo} onClick={() => exportar(tipo)} disabled={!!exportando || publicadas === 0}
                  className="text-sm font-semibold px-4 py-2 rounded-lg bg-coal text-white disabled:opacity-40">
                  {exportando === tipo ? 'Generando…' : label}
                </button>
              ))}
            </div>
          </div>
        ) : (
          <p className="text-xs text-cherry">La semana inicial tiene que ser anterior (o igual) a la final.</p>
        )}
      </div>

      {semanas.map(({ lunes, filas }) => (
        <div key={lunes}>
          <h2 className="font-display text-lg text-coal mb-2">Semana del {etiquetaSemana(lunes)}</h2>
          {filas ? (
            <div className="bg-white border border-gray-200 rounded-lg overflow-x-auto">
              <table className="w-full min-w-[680px] border-collapse">
                <thead>
                  <tr className="bg-gray-50 border-b border-gray-200">
                    <th className="text-left px-4 py-3 font-display text-xs text-coal/60 w-36">Empleado</th>
                    {DIAS.map((d) => (
                      <th key={d} className="px-1.5 py-3 text-center min-w-[84px]">
                        <p className="font-display text-[11px] text-coal/70">{DIA_LARGO[d]}</p>
                        <p className="text-[10px] text-muted-fg">{fechaCorta(lunes, d)}</p>
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {filas.map((f, i) => (
                    <tr key={f.id} className={`border-b border-gray-100 ${i % 2 ? 'bg-gray-50/40' : 'bg-white'}`}>
                      <td className="px-4 py-2.5">
                        <p className="font-semibold text-sm text-coal leading-tight">{f.short}</p>
                        {f.type === 'servicios' && <p className="text-[9px] font-bold uppercase tracking-wider text-coal/35">Serv. generales</p>}
                        {f.type === 'refuerzo' && <p className="text-[9px] font-bold uppercase tracking-wider text-coal/35">Refuerzo</p>}
                      </td>
                      {DIAS.map((d) => {
                        const c = f.dias[d]
                        return (
                          <td key={d} className="px-1.5 py-2 text-center">
                            <div className={`w-full px-1.5 py-2 rounded-lg border text-[11px] font-semibold ${COLOR[c.valor] ?? SIN_VALOR}`}>
                              {c.etiqueta}
                              {c.caja && <span className="block mt-0.5 text-[9px] font-bold uppercase tracking-wider text-coal/60">Caja</span>}
                            </div>
                          </td>
                        )
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="bg-gray-50 border border-dashed border-gray-200 rounded-lg px-4 py-4 text-center max-w-3xl">
              <p className="text-sm text-muted-fg italic">Sin cuadro publicado</p>
            </div>
          )}
        </div>
      ))}
    </div>
  )
}
