import { useEffect, useState } from 'react'
import { doc, getDoc, setDoc, serverTimestamp } from 'firebase/firestore'
import { db } from '@/services/firebase'
import { useAuthStore } from '@/store/authStore'
import { toast } from 'sonner'

// ─── Datos ──────────────────────────────────────────────────────────────────
const EMPLOYEES = [
  { id: 'joseluis',   name: 'José Luis Martínez Villegas',   short: 'José Luis',   type: 'regular' },
  { id: 'yency',      name: 'Yency Torres Parra',            short: 'Yency',       type: 'regular' },
  { id: 'sara',       name: 'Sara Castaño Monsalve',         short: 'Sara',        type: 'regular' },
  { id: 'valentina',  name: 'Valentina Villegas Mazo',       short: 'Valentina',   type: 'regular' },
  { id: 'josemanuel', name: 'Jose Manuel Londoño Rivillas',  short: 'Jose Manuel', type: 'regular' },
  { id: 'juandiego',  name: 'Juan Diego Rodríguez Martínez', short: 'Juan Diego',  type: 'regular' },
  { id: 'gendelson',  name: 'Gendelson González Blanco',     short: 'Gendelson',   type: 'regular' },
  { id: 'deisy',      name: 'Deisy Henao Grisales',          short: 'Deisy',       type: 'servicios' },
] as const

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
const SERVICIOS_OPTS = [
  { value: 'trabajo',  label: 'Trabajo',  color: 'bg-mustard/20 text-mustard border-mustard/30' },
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

function generarRotacion(): Schedule {
  const regulares = EMPLOYEES.filter((e) => e.type === 'regular')
  const deisy = EMPLOYEES.find((e) => e.type === 'servicios')
  const keys = DAYS.map((d) => d.key)
  const shuffled = [...keys].sort(() => Math.random() - 0.5)
  const sched: Schedule = {}
  regulares.forEach((emp, idx) => {
    const rest = shuffled[idx]; let tog = idx; sched[emp.id] = {}
    keys.forEach((day) => {
      if (day === rest) sched[emp.id][day] = 'descanso'
      else { sched[emp.id][day] = tog % 2 === 0 ? 'santa_lucia' : 'santa_teresita'; tog++ }
    })
  })
  if (deisy) {
    const ri = Math.floor(Math.random() * 7); sched[deisy.id] = {}
    keys.forEach((day, i) => { sched[deisy.id][day] = i === ri ? 'descanso' : 'trabajo' })
  }
  return sched
}

// ─── Componente ───────────────────────────────────────────────────────────────
export default function Turnos() {
  const { user } = useAuthStore()
  const [weekOffset, setWeekOffset] = useState(1)
  const [schedule, setSchedule] = useState<Schedule>({})
  const [saved, setSaved] = useState<Schedule>({})
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [picker, setPicker] = useState<Picker>(null)

  const monday = getMonday(weekOffset)
  const wid = weekId(monday)
  const dirty = JSON.stringify(schedule) !== JSON.stringify(saved)

  useEffect(() => {
    setLoading(true); setPicker(null)
    getDoc(doc(db, 'turnos', wid))
      .then((snap) => {
        const data = (snap.exists() ? (snap.data().schedule ?? {}) : {}) as Schedule
        setSchedule(data); setSaved(data)
      })
      .catch(() => { setSchedule({}); setSaved({}) })
      .finally(() => setLoading(false))
  }, [wid])

  const setCelda = (empId: string, dayKey: string, value: string) => {
    setSchedule((prev) => ({ ...prev, [empId]: { ...(prev[empId] ?? {}), [dayKey]: value } }))
    setPicker(null)
  }

  const guardar = async () => {
    setSaving(true)
    try {
      await setDoc(doc(db, 'turnos', wid), {
        weekStart: monday.toISOString().slice(0, 10),
        schedule,
        updatedAt: serverTimestamp(),
        updatedBy: user?.email,
        published: true,
      })
      setSaved({ ...schedule })
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
          <button onClick={() => { setSchedule(generarRotacion()); setPicker(null) }}
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
              {EMPLOYEES.map((emp, ei) => (
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
                    return (
                      <td key={day.key} className="px-1.5 py-2 text-center relative">
                        <button
                          onClick={(e) => { e.stopPropagation(); setPicker(open ? null : { empId: emp.id, dayKey: day.key }) }}
                          className={`w-full px-1.5 py-2 rounded-lg border text-[11px] font-semibold ${cell.color} ${open ? 'ring-2 ring-cherry/40' : ''}`}>
                          {cell.label || '—'}
                        </button>
                        {open && (
                          <div className="absolute z-50 top-full left-1/2 -translate-x-1/2 mt-1 bg-white rounded-xl shadow-lg border border-gray-200 p-1.5 flex flex-col gap-1 min-w-[130px]">
                            {opts.map((opt) => (
                              <button key={opt.value} onClick={(e) => { e.stopPropagation(); setCelda(emp.id, day.key, opt.value) }}
                                className={`px-3 py-1.5 rounded-lg text-xs font-semibold border text-left ${opt.color} ${value === opt.value ? 'ring-2 ring-coal/20' : ''}`}>
                                {opt.label}
                              </button>
                            ))}
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
