import { useState, useEffect } from 'react'
import { doc, getDoc, setDoc, serverTimestamp } from 'firebase/firestore'
import { onAuthStateChanged, signInWithPopup, signOut } from 'firebase/auth'
import { auth, db, provider } from '../services/firebase'
import { format, addWeeks, startOfWeek, addDays, getISOWeek } from 'date-fns'
import { es } from 'date-fns/locale'
import { ADMIN_EMAILS } from '../services/roles'
import { LogIn, LogOut, RotateCcw, Save } from 'lucide-react'

// ─── Datos fijos ──────────────────────────────────────────────────────────────
const EMPLOYEES = [
  { id: 'joseluis',    email: 'lluis02martinez@gmail.com',           name: 'José Luis Martínez Villegas',   short: 'José Luis',   type: 'regular'   },
  { id: 'yency',       email: 'yencytp@gmail.com',                   name: 'Yency Torres Parra',             short: 'Yency',       type: 'regular'   },
  { id: 'sara',        email: 'monsalvesara1124@gmail.com',          name: 'Sara Castaño Monsalve',          short: 'Sara',        type: 'regular'   },
  { id: 'valentina',   email: 'vvillegasmazo@gmail.com',             name: 'Valentina Villegas Mazo',        short: 'Valentina',   type: 'regular'   },
  { id: 'josemanuel',  email: 'josemanuellondonorivillas@gmail.com', name: 'Jose Manuel Londoño Rivillas',   short: 'Jose Manuel', type: 'regular'   },
  { id: 'juandiego',   email: 'jotade.rodmar@gmail.com',             name: 'Juan Diego Rodríguez Martínez', short: 'Juan Diego',  type: 'regular'   },
  { id: 'gendelson',   email: 'tikdash17@gmail.com',                 name: 'Gendelson González Blanco',      short: 'Gendelson',   type: 'regular'   },
  { id: 'deisy',       email: 'deisyhenao670@gmail.com',             name: 'Deisy Henao Grisales',           short: 'Deisy',       type: 'servicios' },
]

const DAYS = [
  { key: 'lun', label: 'Lunes'     },
  { key: 'mar', label: 'Martes'    },
  { key: 'mie', label: 'Miércoles' },
  { key: 'jue', label: 'Jueves'    },
  { key: 'vie', label: 'Viernes'   },
  { key: 'sab', label: 'Sábado'    },
  { key: 'dom', label: 'Domingo'   },
]

const SEDE_OPTS = [
  { value: 'santa_lucia',    label: 'Santa Lucía',    color: 'bg-cherry/15 text-cherry border-cherry/30'      },
  { value: 'santa_teresita', label: 'Santa Teresita', color: 'bg-mint/15 text-[#2d8c6f] border-mint/30'       },
  { value: 'descanso',       label: 'Descanso',       color: 'bg-smoked text-coal/40 border-coal/10'           },
]
const SERVICIOS_OPTS = [
  { value: 'trabajo',  label: 'Trabajo',  color: 'bg-mustard/20 text-[#7a5c00] border-mustard/30' },
  { value: 'descanso', label: 'Descanso', color: 'bg-smoked text-coal/40 border-coal/10'           },
]

// ─── Semana helpers ───────────────────────────────────────────────────────────
const getMonday = (offset = 0) => addWeeks(startOfWeek(new Date(), { weekStartsOn: 1 }), offset)
const weekId    = d => `${d.getFullYear()}-W${String(getISOWeek(d)).padStart(2, '0')}`
const weekLabel = d => {
  const sun = addDays(d, 6)
  return `${format(d, "d 'de' MMM", { locale: es })} – ${format(sun, "d 'de' MMM", { locale: es })}`
}
const dayDate = (monday, i) => addDays(monday, i)

// ─── Auto-rotación ────────────────────────────────────────────────────────────
function generarRotacion() {
  const regulares = EMPLOYEES.filter(e => e.type === 'regular')   // 7
  const deisy     = EMPLOYEES.find(e => e.type === 'servicios')
  const keys      = DAYS.map(d => d.key)                           // 7 días

  // Mezclar días para asignar un día de descanso diferente a cada empleado
  const diasMezclados = [...keys].sort(() => Math.random() - 0.5)

  const sched = {}

  regulares.forEach((emp, idx) => {
    const diaDescanso = diasMezclados[idx]   // cada empleado descansa un día diferente
    sched[emp.id] = {}
    let toggle = idx   // alterna sede según posición del empleado
    keys.forEach(day => {
      if (day === diaDescanso) {
        sched[emp.id][day] = 'descanso'
      } else {
        sched[emp.id][day] = toggle % 2 === 0 ? 'santa_lucia' : 'santa_teresita'
        toggle++
      }
    })
  })

  // Deisy: un día de descanso aleatorio, resto "trabajo"
  if (deisy) {
    const restIdx = Math.floor(Math.random() * 7)
    sched[deisy.id] = {}
    keys.forEach((day, i) => { sched[deisy.id][day] = i === restIdx ? 'descanso' : 'trabajo' })
  }

  return sched
}

// ─── Cell helper ──────────────────────────────────────────────────────────────
const getCell = (value, type) => {
  const opts = type === 'servicios' ? SERVICIOS_OPTS : SEDE_OPTS
  return opts.find(o => o.value === value) || { label: '—', color: 'bg-smoked/30 text-coal/20 border-coal/5' }
}

// ─── Componente principal ─────────────────────────────────────────────────────
export default function TurnosPage() {
  const [user,        setUser]        = useState(undefined)   // undefined = cargando
  const [weekOffset,  setWeekOffset]  = useState(1)           // 1 = próxima semana (inicio desde sem 8 jun)
  const [schedule,    setSchedule]    = useState({})
  const [saved,       setSaved]       = useState({})
  const [loading,     setLoading]     = useState(false)
  const [saving,      setSaving]      = useState(false)
  const [savedOk,     setSavedOk]     = useState(false)
  const [picker,      setPicker]      = useState(null)        // { empId, dayKey }

  const monday   = getMonday(weekOffset)
  const wid      = weekId(monday)
  const isAdmin  = ADMIN_EMAILS.map(e => e.toLowerCase()).includes(user?.email?.toLowerCase() ?? '')
  const dirty    = JSON.stringify(schedule) !== JSON.stringify(saved)

  // Auth
  useEffect(() => onAuthStateChanged(auth, u => setUser(u ?? null)), [])

  // Cargar turno desde Firestore
  useEffect(() => {
    setLoading(true)
    setPicker(null)
    getDoc(doc(db, 'turnos', wid))
      .then(snap => {
        const data = snap.exists() ? (snap.data().schedule ?? {}) : {}
        setSchedule(data)
        setSaved(data)
      })
      .catch(() => { setSchedule({}); setSaved({}) })
      .finally(() => setLoading(false))
  }, [wid])

  const login  = () => signInWithPopup(auth, provider).catch(() => {})
  const logout = () => { signOut(auth); setPicker(null) }

  const rotar = () => { setSchedule(generarRotacion()); setPicker(null) }

  const guardar = async () => {
    setSaving(true)
    try {
      await setDoc(doc(db, 'turnos', wid), {
        weekStart: format(monday, 'yyyy-MM-dd'),
        schedule,
        updatedAt: serverTimestamp(),
        updatedBy: user.email,
      })
      setSaved({ ...schedule })
      setSavedOk(true)
      setTimeout(() => setSavedOk(false), 2500)
    } catch (e) { console.error(e) }
    finally { setSaving(false) }
  }

  const setCelda = (empId, dayKey, value) => {
    setSchedule(prev => ({ ...prev, [empId]: { ...(prev[empId] ?? {}), [dayKey]: value } }))
    setPicker(null)
  }

  // Cargando auth
  if (user === undefined) return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-cherry to-tangelo">
      <div className="w-10 h-10 border-4 border-cream/30 border-t-cream rounded-full animate-spin" />
    </div>
  )

  return (
    <div className="min-h-screen bg-gradient-soft">

      {/* Header */}
      <header className="bg-gradient-to-r from-cherry to-tangelo px-5 py-5 shadow-md">
        <div className="max-w-5xl mx-auto flex items-center justify-between">
          <div>
            <p className="font-script text-cream/70 text-base leading-none">DeliStars</p>
            <h1 className="font-display text-3xl text-cream tracking-widest">Turnos</h1>
          </div>
          <div className="flex items-center gap-2">
            {user ? (
              <>
                {isAdmin && <span className="hidden sm:block text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full bg-cream/20 text-cream">Admin</span>}
                <span className="hidden sm:block text-cream/70 text-xs">{user.displayName?.split(' ')[0]}</span>
                <button onClick={logout} className="p-2 rounded-xl text-cream hover:bg-cream/10 transition-colors" title="Cerrar sesión">
                  <LogOut size={18} />
                </button>
              </>
            ) : (
              <button onClick={login} className="flex items-center gap-1.5 bg-cream/20 hover:bg-cream/30 text-cream text-sm font-semibold px-3 py-1.5 rounded-xl transition-colors">
                <LogIn size={15} /> Admin
              </button>
            )}
          </div>
        </div>
      </header>

      <div className="max-w-5xl mx-auto px-3 py-5 flex flex-col gap-4">

        {/* Selector de semana */}
        <div className="grid grid-cols-2 gap-2">
          {[0, 1].map(offset => {
            const m = getMonday(offset)
            const active = weekOffset === offset
            return (
              <button key={offset} onClick={() => setWeekOffset(offset)}
                className={`py-3 px-4 rounded-2xl text-left transition-all ${active ? 'bg-cherry text-cream shadow-md' : 'bg-white text-coal/60 shadow-soft hover:bg-smoked/40'}`}>
                <p className={`font-display text-sm tracking-wide ${active ? 'text-cream' : 'text-coal/70'}`}>
                  {offset === 0 ? 'Esta semana' : 'Próxima semana'}
                </p>
                <p className={`font-body text-[11px] mt-0.5 ${active ? 'text-cream/70' : 'text-coal/40'}`}>
                  {weekLabel(m)}
                </p>
              </button>
            )
          })}
        </div>

        {/* Controles admin */}
        {isAdmin && (
          <div className="flex items-center gap-2 justify-end">
            <button onClick={rotar}
              className="flex items-center gap-1.5 text-sm font-semibold px-4 py-2 rounded-xl bg-tangelo/10 hover:bg-tangelo/20 text-tangelo border border-tangelo/30 transition-colors">
              <RotateCcw size={14} /> Sugerir rotación
            </button>
            <button onClick={guardar} disabled={saving || !dirty}
              className={`flex items-center gap-1.5 text-sm font-semibold px-4 py-2 rounded-xl transition-colors ${
                savedOk  ? 'bg-mint/20 text-[#2d8c6f] border border-mint/40' :
                dirty    ? 'bg-cherry text-cream hover:bg-cherry/80 shadow-sm' :
                           'bg-smoked text-coal/30 cursor-not-allowed'
              }`}>
              <Save size={14} /> {savedOk ? '✓ Guardado' : saving ? 'Guardando…' : 'Guardar'}
            </button>
          </div>
        )}

        {/* Leyenda */}
        <div className="flex flex-wrap gap-1.5">
          {SEDE_OPTS.map(s => (
            <span key={s.value} className={`text-[11px] font-semibold px-2.5 py-1 rounded-full border ${s.color}`}>{s.label}</span>
          ))}
          <span className="text-[11px] font-semibold px-2.5 py-1 rounded-full border bg-mustard/20 text-[#7a5c00] border-mustard/30">
            Trabajo (Serv. Grales.)
          </span>
        </div>

        {/* Tabla de turnos */}
        {loading ? (
          <div className="flex justify-center py-20">
            <div className="w-8 h-8 border-4 border-cherry/20 border-t-cherry rounded-full animate-spin" />
          </div>
        ) : (
          <div className="bg-white rounded-2xl shadow-soft overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full min-w-[640px] border-collapse">
                <thead>
                  <tr className="bg-smoked/50 border-b border-coal/5">
                    <th className="text-left px-4 py-3 font-display text-xs tracking-wide text-coal/60 w-32">Empleado</th>
                    {DAYS.map((day, i) => (
                      <th key={day.key} className="px-1.5 py-3 text-center min-w-[82px]">
                        <p className="font-display text-[11px] tracking-wide text-coal/70">{day.label}</p>
                        <p className="font-body text-[10px] text-coal/40">
                          {format(dayDate(monday, i), 'd MMM', { locale: es })}
                        </p>
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {EMPLOYEES.map((emp, ei) => (
                    <tr key={emp.id} className={`border-b border-coal/5 ${ei % 2 === 0 ? 'bg-white' : 'bg-smoked/15'}`}>
                      {/* Nombre */}
                      <td className="px-4 py-2.5">
                        <p className="font-body font-semibold text-sm text-coal leading-tight">{emp.short}</p>
                        {emp.type === 'servicios' && (
                          <p className="font-body text-[9px] font-bold uppercase tracking-wider text-coal/35 mt-0.5">
                            Serv. generales
                          </p>
                        )}
                      </td>

                      {/* Celdas */}
                      {DAYS.map(day => {
                        const value = schedule[emp.id]?.[day.key] ?? ''
                        const cell  = getCell(value, emp.type)
                        const opts  = emp.type === 'servicios' ? SERVICIOS_OPTS : SEDE_OPTS
                        const open  = picker?.empId === emp.id && picker?.dayKey === day.key

                        return (
                          <td key={day.key} className="px-1.5 py-2 text-center relative">
                            <button
                              onClick={() => isAdmin && setPicker(open ? null : { empId: emp.id, dayKey: day.key })}
                              className={`w-full px-1.5 py-2 rounded-lg border text-[11px] font-semibold leading-tight transition-all ${cell.color} ${
                                isAdmin ? 'hover:opacity-75 cursor-pointer' : 'cursor-default'
                              } ${open ? 'ring-2 ring-cherry/40' : ''}`}
                            >
                              {cell.label || '—'}
                            </button>

                            {/* Picker flotante */}
                            {open && (
                              <div className="absolute z-50 top-full left-1/2 -translate-x-1/2 mt-1 bg-white rounded-xl shadow-lg border border-coal/10 p-1.5 flex flex-col gap-1 min-w-[130px]">
                                {opts.map(opt => (
                                  <button key={opt.value}
                                    onClick={() => setCelda(emp.id, day.key, opt.value)}
                                    className={`px-3 py-1.5 rounded-lg text-xs font-semibold border text-left hover:opacity-80 transition-opacity ${opt.color} ${
                                      value === opt.value ? 'ring-2 ring-coal/20' : ''
                                    }`}>
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
          </div>
        )}

        {/* Cierra picker al click fuera */}
        {picker && (
          <div className="fixed inset-0 z-40" onClick={() => setPicker(null)} />
        )}

        {/* Resumen de descansos */}
        {Object.keys(schedule).length > 0 && (
          <div className="bg-white rounded-2xl shadow-soft p-4">
            <p className="font-display text-base tracking-wide text-coal mb-3">Descansos de la semana</p>
            <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-2">
              {DAYS.map(day => {
                const descansando = EMPLOYEES.filter(e => schedule[e.id]?.[day.key] === 'descanso')
                return (
                  <div key={day.key} className="bg-smoked/40 rounded-xl p-2.5">
                    <p className="font-display text-[11px] tracking-wide text-coal/60 mb-1.5">{day.label}</p>
                    {descansando.length === 0
                      ? <p className="font-body text-[10px] text-coal/30 italic">Todos trabajan</p>
                      : descansando.map(e => (
                          <p key={e.id} className="font-body text-[11px] font-semibold text-coal/70">{e.short}</p>
                        ))
                    }
                  </div>
                )
              })}
            </div>
          </div>
        )}

        {/* Aviso vista pública */}
        {!isAdmin && user && (
          <p className="text-center font-body text-xs text-coal/40 pb-2">Estás viendo los turnos en modo lectura.</p>
        )}
        {!user && (
          <p className="text-center font-body text-xs text-coal/40 pb-2">
            Solo los administradores pueden iniciar sesión para editar.
          </p>
        )}

        <p className="text-center font-body text-[10px] text-coal/25 pb-4">DeliStars · Gestión de Turnos</p>
      </div>
    </div>
  )
}
