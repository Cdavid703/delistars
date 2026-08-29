import { useEffect, useState } from 'react'
import { doc, getDoc, setDoc, serverTimestamp, collection, onSnapshot } from 'firebase/firestore'
import { db } from '@/services/firebase'
import { useAuthStore } from '@/store/authStore'
import { toast } from 'sonner'
import { buildShiftEmployees, type ShiftEmployee } from '@/lib/team'
import { generarRotacion, esCajero, type Caja } from '@/lib/turnos'

const DAYS = [
  { key: 'lun', label: 'Lunes' }, { key: 'mar', label: 'Martes' }, { key: 'mie', label: 'Miércoles' },
  { key: 'jue', label: 'Jueves' }, { key: 'vie', label: 'Viernes' }, { key: 'sab', label: 'Sábado' },
  { key: 'dom', label: 'Domingo' },
]

const SEDE_OPTS = [
  { value: 'santa_lucia',    label: 'Santa Lucía',    color: 'bg-cherry/15 text-cherry border-cherry/30' },
  { value: 'santa_teresita', label: 'Santa Teresita', color: 'bg-mint/15 text-mint border-mint/30' },
  { value: 'descanso',       label: 'Descanso',       color: 'bg-gray-100 text-coal/40 border-gray-200' },
]
// Servicios generales (aseo): no rota entre sedes, solo turno de la mañana.
// El valor sigue siendo 'trabajo' para no romper los cuadros ya guardados.
const SERVICIOS_OPTS = [
  { value: 'trabajo',  label: 'Mañana',   color: 'bg-mustard/20 text-mustard border-mustard/30' },
  { value: 'descanso', label: 'Descanso', color: 'bg-gray-100 text-coal/40 border-gray-200' },
]

type Schedule = Record<string, Record<string, string>>
type Picker = { empId: string; dayKey: string } | null

// ─── Helpers de semana (JS plano; weekId ISO compatible con turnos existentes) ─
const getISOWeek = (date: Date): number => {
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()))
  const dayNum = (d.getUTCDay() + 6) % 7
  d.setUTCDate(d.getUTCDate() - dayNum + 3)
  const firstThursday = new Date(Date.UTC(d.getUTCFullYear(), 0, 4))
  const ftDayNum = (firstThursday.getUTCDay() + 6) % 7
  firstThursday.setUTCDate(firstThursday.getUTCDate() - ftDayNum + 3)
  return 1 + Math.round((d.getTime() - firstThursday.getTime()) / (7 * 24 * 3600 * 1000))
}
const getMonday = (offset = 0): Date => {
  const now = new Date()
  const day = (now.getDay() + 6) % 7
  const monday = new Date(now)
  monday.setHours(0, 0, 0, 0)
  monday.setDate(now.getDate() - day + offset * 7)
  return monday
}
const weekId = (d: Date): string => `${d.getFullYear()}-W${String(getISOWeek(d)).padStart(2, '0')}`
const addDays = (d: Date, n: number): Date => { const r = new Date(d); r.setDate(r.getDate() + n); return r }
const fmtShort = (d: Date): string => d.toLocaleDateString('es-CO', { day: 'numeric', month: 'short' })
const weekLabel = (d: Date): string => `${fmtShort(d)} – ${addDays(d, 6).toLocaleDateString('es-CO', { day: 'numeric', month: 'short', year: 'numeric' })}`

const getCell = (value: string, type: string) => {
  const opts = type === 'servicios' ? SERVICIOS_OPTS : SEDE_OPTS
  return opts.find((o) => o.value === value) || { label: '—', color: 'bg-gray-50 text-coal/20 border-gray-100' }
}

// ─── Componente ───────────────────────────────────────────────────────────────
export default function Turnos() {
  const { user } = useAuthStore()
  const [weekOffset, setWeekOffset] = useState(0)
  const [schedule, setSchedule] = useState<Schedule>({})
  const [saved, setSaved] = useState<Schedule>({})
  // Quién hace caja en cada sede cada día: caja[dia][sede] = empId.
  const [caja, setCaja] = useState<Caja>({})
  const [savedCaja, setSavedCaja] = useState<Caja>({})
  const [avisos, setAvisos] = useState<string[]>([])
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [picker, setPicker] = useState<Picker>(null)
  // Empleados del cuadro: plantilla base + los que se crean desde Empleados con
  // datos de turnos, menos los dados de baja. Todo en vivo desde Firestore.
  const [empleados, setEmpleados] = useState<ShiftEmployee[]>(() => buildShiftEmployees([], []))

  useEffect(() => {
    let bajas: string[] = []
    let extra: { email: string; doc?: string; name?: string; shortName?: string; shiftType?: string }[] = []
    const recalc = () => setEmpleados(buildShiftEmployees(extra, bajas))

    const unsubDis = onSnapshot(collection(db, 'roles_disabled'), (snap) => {
      bajas = snap.docs.map((d) => d.id.toLowerCase()); recalc()
    }, () => {})
    // Un empleado puede estar en cajeros y/o domiciliarios: se juntan ambos.
    const acc: Record<string, { email: string; doc?: string; name?: string; shortName?: string; shiftType?: string }> = {}
    const watch = (col: string) => onSnapshot(collection(db, col), (snap) => {
      snap.docs.forEach((d) => {
        const v = d.data() as { doc?: string; name?: string; shortName?: string; shiftType?: string }
        acc[d.id.toLowerCase()] = { ...acc[d.id.toLowerCase()], ...v, email: d.id.toLowerCase() }
      })
      extra = Object.values(acc); recalc()
    }, () => {})
    const unsubC = watch('roles_cashiers')
    const unsubD = watch('roles_drivers')
    return () => { unsubDis(); unsubC(); unsubD() }
  }, [])

  const monday = getMonday(weekOffset)
  const wid = weekId(monday)
  const dirty = JSON.stringify(schedule) !== JSON.stringify(saved) ||
                JSON.stringify(caja) !== JSON.stringify(savedCaja)

  useEffect(() => {
    setLoading(true); setPicker(null)
    getDoc(doc(db, 'turnos', wid))
      .then((snap) => {
        const data = (snap.exists() ? (snap.data().schedule ?? {}) : {}) as Schedule
        const cajas = (snap.exists() ? (snap.data().caja ?? {}) : {}) as Caja
        setSchedule(data); setSaved(data)
        setCaja(cajas); setSavedCaja(cajas)
      })
      .catch(() => { setSchedule({}); setSaved({}); setCaja({}); setSavedCaja({}) })
      .finally(() => setLoading(false))
  }, [wid])

  const setCelda = (empId: string, dayKey: string, value: string) => {
    setSchedule((prev) => ({ ...prev, [empId]: { ...(prev[empId] ?? {}), [dayKey]: value } }))
    // Si estaba en caja y lo cambian de sede (o a descanso), esa caja queda
    // huérfana: se limpia para que nadie quede marcado donde ya no está.
    setCaja((prev) => {
      const delDia = { ...(prev[dayKey] ?? {}) }
      let cambio = false
      Object.keys(delDia).forEach((sede) => {
        if (delDia[sede] === empId && sede !== value) { delete delDia[sede]; cambio = true }
      })
      return cambio ? { ...prev, [dayKey]: delDia } : prev
    })
    setPicker(null)
  }

  // Marcar/desmarcar caja. Solo una persona por sede y día.
  const toggleCaja = (empId: string, dayKey: string, sede: string) => {
    setCaja((prev) => {
      const delDia = { ...(prev[dayKey] ?? {}) }
      if (delDia[sede] === empId) delete delDia[sede]
      else delDia[sede] = empId
      return { ...prev, [dayKey]: delDia }
    })
    setPicker(null)
  }

  const rotar = () => {
    const sugerido = generarRotacion(empleados)
    setSchedule(sugerido.schedule)
    setCaja(sugerido.caja)
    setAvisos(sugerido.avisos)
    setPicker(null)
  }

  const guardar = async () => {
    setSaving(true)
    try {
      await setDoc(doc(db, 'turnos', wid), {
        weekStart: monday.toISOString().slice(0, 10),
        schedule,
        caja,
        updatedAt: serverTimestamp(),
        updatedBy: user?.email,
        published: true,
      })
      setSaved({ ...schedule })
      setSavedCaja({ ...caja })
      toast.success('Turno publicado — los empleados ya pueden verlo')
    } catch {
      toast.error('Error al publicar el turno')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div onClick={() => picker && setPicker(null)}>
      <div className="flex flex-wrap items-center justify-between gap-3 mb-6">
        <div>
          <h1 className="text-4xl font-display font-bold text-coal">Turnos</h1>
          <p className="text-muted-fg mt-1">Horario semanal del equipo</p>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={rotar}
            className="text-sm font-semibold px-4 py-2 rounded-lg bg-tangelo/10 hover:bg-tangelo/20 text-tangelo border border-tangelo/30">
            Sugerir rotación
          </button>
          <button onClick={guardar} disabled={saving || !dirty}
            className={`text-sm font-semibold px-4 py-2 rounded-lg ${dirty ? 'bg-primary text-white' : 'bg-gray-100 text-coal/30 cursor-not-allowed'}`}>
            {saving ? 'Guardando…' : 'Publicar turno'}
          </button>
        </div>
      </div>

      {/* Selector de semana */}
      <div className="grid grid-cols-2 gap-3 mb-4 max-w-md">
        {[0, 1].map((offset) => {
          const m = getMonday(offset); const active = weekOffset === offset
          return (
            <button key={offset} onClick={() => setWeekOffset(offset)}
              className={`py-3 px-4 rounded-xl text-left border ${active ? 'bg-primary text-white border-primary' : 'bg-white text-coal/60 border-gray-200'}`}>
              <p className="font-display text-sm">{offset === 0 ? 'Esta semana' : 'Próxima semana'}</p>
              <p className={`text-[11px] mt-0.5 ${active ? 'text-white/70' : 'text-muted-fg'}`}>{weekLabel(m)}</p>
            </button>
          )
        })}
      </div>

      {avisos.length > 0 && (
        <div className="bg-mustard/15 border border-mustard/40 rounded-lg p-3 mb-4 max-w-3xl">
          {avisos.map((aviso) => (
            <p key={aviso} className="text-xs text-coal">⚠️ {aviso}</p>
          ))}
        </div>
      )}

      {loading ? (
        <p className="text-muted-fg">Cargando turno…</p>
      ) : (
        <div className="bg-white border border-gray-200 rounded-lg overflow-x-auto" onClick={(e) => e.stopPropagation()}>
          <table className="w-full min-w-[680px] border-collapse">
            <thead>
              <tr className="bg-gray-50 border-b border-gray-200">
                <th className="text-left px-4 py-3 font-display text-xs text-coal/60 w-36">Empleado</th>
                {DAYS.map((day, i) => (
                  <th key={day.key} className="px-1.5 py-3 text-center min-w-[84px]">
                    <p className="font-display text-[11px] text-coal/70">{day.label}</p>
                    <p className="text-[10px] text-muted-fg">{fmtShort(addDays(monday, i))}</p>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {empleados.map((emp, ei) => (
                <tr key={emp.id} className={`border-b border-gray-100 ${ei % 2 ? 'bg-gray-50/40' : 'bg-white'}`}>
                  <td className="px-4 py-2.5">
                    <p className="font-semibold text-sm text-coal leading-tight">{emp.short}</p>
                    {emp.type === 'servicios' && <p className="text-[9px] font-bold uppercase tracking-wider text-coal/35">Serv. generales</p>}
                  </td>
                  {DAYS.map((day) => {
                    const value = schedule[emp.id]?.[day.key] ?? ''
                    const cell = getCell(value, emp.type)
                    const opts = emp.type === 'servicios' ? SERVICIOS_OPTS : SEDE_OPTS
                    const open = picker?.empId === emp.id && picker?.dayKey === day.key
                    const enCaja = caja[day.key]?.[value] === emp.id
                    // La caja solo tiene sentido en una sede: no en descanso ni en aseo.
                    const puedeCaja = esCajero(emp.id) && emp.type !== 'servicios' &&
                                      !!value && value !== 'descanso'
                    return (
                      <td key={day.key} className="px-1.5 py-2 text-center relative">
                        <button
                          onClick={(e) => { e.stopPropagation(); setPicker(open ? null : { empId: emp.id, dayKey: day.key }) }}
                          className={`w-full px-1.5 py-2 rounded-lg border text-[11px] font-semibold ${cell.color} ${open ? 'ring-2 ring-cherry/40' : ''}`}>
                          {cell.label || '—'}
                          {enCaja && (
                            <span className="block mt-0.5 text-[9px] font-bold uppercase tracking-wider text-coal/60">
                              Caja
                            </span>
                          )}
                        </button>
                        {open && (
                          <div className="absolute z-50 top-full left-1/2 -translate-x-1/2 mt-1 bg-white rounded-xl shadow-lg border border-gray-200 p-1.5 flex flex-col gap-1 min-w-[130px]">
                            {opts.map((opt) => (
                              <button key={opt.value} onClick={(e) => { e.stopPropagation(); setCelda(emp.id, day.key, opt.value) }}
                                className={`px-3 py-1.5 rounded-lg text-xs font-semibold border text-left ${opt.color} ${value === opt.value ? 'ring-2 ring-coal/20' : ''}`}>
                                {opt.label}
                              </button>
                            ))}
                            {puedeCaja && (
                              <button onClick={(e) => { e.stopPropagation(); toggleCaja(emp.id, day.key, value) }}
                                className={`px-3 py-1.5 rounded-lg text-xs font-semibold border text-left ${
                                  enCaja ? 'bg-coal text-white border-coal' : 'bg-white text-coal/70 border-gray-200'
                                }`}>
                                {enCaja ? '✓ En caja' : 'Poner en caja'}
                              </button>
                            )}
                          </div>
                        )}
                      </td>
                    )
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
