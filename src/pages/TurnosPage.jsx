import { useState, useEffect } from 'react'
import { doc, getDoc, setDoc, serverTimestamp, collection, onSnapshot } from 'firebase/firestore'
import { onAuthStateChanged, signInWithPopup, signInWithRedirect, getRedirectResult, signOut } from 'firebase/auth'
import { auth, db, provider } from '../services/firebase'
import { format, addWeeks, startOfWeek, addDays, getISOWeek } from 'date-fns'
import { es } from 'date-fns/locale'
import { ADMIN_EMAILS } from '../services/roles'
import { generarRotacion, esCajero } from '../utils/turnos'
import { LogOut, RotateCcw, Save, Calendar, User } from 'lucide-react'
import Logo from '../components/common/Logo'

// ─── Empleados ────────────────────────────────────────────────────────────────
// Plantilla base con los datos propios del cuadro de turnos (nombre corto y si
// es personal "regular" o de "servicios"), que no viven en la base de datos.
// La lista REAL se filtra contra las bajas del panel de administración
// (colección roles_disabled): al eliminar un empleado en el admin, desaparece
// solo de aquí — antes había que editar este archivo y volver a desplegar.
// `doc` es la cédula (o PPT): identifica a la persona aunque aún no tengamos su
// correo. Sin correo sale en el cuadro pero no puede iniciar sesión; cuando
// llegue hay que escribirlo aquí y en los espejos (admin/src/lib/team.ts).
const EMPLOYEES_BASE = [
  { id: 'joseluis',  email: 'lluis02martinez@gmail.com',  doc: '1003231096',    name: 'José Luis Martínez Villegas', short: 'José Luis', type: 'regular'   },
  { id: 'sara',      email: 'monsalvesara1124@gmail.com', doc: '1015072348',    name: 'Sara Castaño Monsalve',       short: 'Sara',      type: 'regular'   },
  { id: 'valentina', email: 'vvillegasmazo@gmail.com',    doc: '1041631088',    name: 'Valentina Villegas Mazo',     short: 'Valentina', type: 'regular'   },
  { id: 'gendelson', email: 'tikdash17@gmail.com',        doc: 'PPT6005363877', name: 'Gendelson González Blanco',   short: 'Gendelson', type: 'regular'   },
  { id: 'shirly',    email: '',                           doc: '1003316676',    name: 'Shirly Elena Rico Daza',      short: 'Shirly',    type: 'regular'   },
  { id: 'melissa',   email: '',                           doc: '1042151261',    name: 'Melissa Varelas Mazo',        short: 'Melissa',   type: 'regular'   },
  { id: 'deisy',     email: 'deisyhenao670@gmail.com',    doc: '1035916337',    name: 'Deisy Henao Grisales',        short: 'Deisy',     type: 'servicios' },
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
  { value: 'santa_lucia',    label: 'Santa Lucía',    color: 'bg-cherry/15 text-cherry border-cherry/30'          },
  { value: 'santa_teresita', label: 'Santa Teresita', color: 'bg-mint/15 text-[#2d8c6f] border-mint/30'           },
  { value: 'descanso',       label: 'Descanso',       color: 'bg-smoked text-coal/40 border-coal/10'               },
]
// Servicios generales (aseo): no rota entre sedes, solo turno de la mañana.
// El valor sigue siendo 'trabajo' para no romper los cuadros ya guardados.
const SERVICIOS_OPTS = [
  { value: 'trabajo',  label: 'Mañana',   color: 'bg-mustard/20 text-[#7a5c00] border-mustard/30' },
  { value: 'descanso', label: 'Descanso', color: 'bg-smoked text-coal/40 border-coal/10'           },
]

// ─── Semana helpers ───────────────────────────────────────────────────────────
const getMonday  = (offset = 0) => addWeeks(startOfWeek(new Date(), { weekStartsOn: 1 }), offset)
const weekId     = d => `${d.getFullYear()}-W${String(getISOWeek(d)).padStart(2, '0')}`
const weekLabel  = d => {
  const sun = addDays(d, 6)
  return `${format(d, "d 'de' MMM", { locale: es })} – ${format(sun, "d 'de' MMM yyyy", { locale: es })}`
}
const dayDate    = (monday, i) => addDays(monday, i)
const getCell    = (value, type) => {
  const opts = type === 'servicios' ? SERVICIOS_OPTS : SEDE_OPTS
  return opts.find(o => o.value === value) || { label: '—', color: 'bg-smoked/30 text-coal/20 border-coal/5' }
}

// ─── Selector de semana ───────────────────────────────────────────────────────
function WeekSelector({ weekOffset, setWeekOffset }) {
  return (
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
            <p className={`font-body text-[11px] mt-0.5 ${active ? 'text-cream/70' : 'text-coal/40'}`}>{weekLabel(m)}</p>
          </button>
        )
      })}
    </div>
  )
}

// ─── Tabla de turnos ─────────────────────────────────────────────────────────
function ScheduleTable({ empleados, schedule, caja = {}, monday, isAdmin, myEmployeeId, picker, setPicker, setCelda, toggleCaja }) {
  return (
    <div className="bg-white rounded-2xl shadow-soft overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full min-w-[640px] border-collapse">
          <thead>
            <tr className="bg-smoked/50 border-b border-coal/5">
              <th className="text-left px-4 py-3 font-display text-xs tracking-wide text-coal/60 w-32">Empleado</th>
              {DAYS.map((day, i) => (
                <th key={day.key} className="px-1.5 py-3 text-center min-w-[82px]">
                  <p className="font-display text-[11px] tracking-wide text-coal/70">{day.label}</p>
                  <p className="font-body text-[10px] text-coal/40">{format(dayDate(monday, i), 'd MMM', { locale: es })}</p>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {empleados.map((emp, ei) => {
              const isMe = emp.id === myEmployeeId
              return (
                <tr key={emp.id}
                  className={`border-b border-coal/5 transition-colors ${
                    isMe ? 'bg-cherry/5 ring-1 ring-inset ring-cherry/20' : ei % 2 === 0 ? 'bg-white' : 'bg-smoked/15'
                  }`}>
                  <td className="px-4 py-2.5">
                    <div className="flex items-center gap-1.5">
                      {isMe && <span className="text-cherry text-xs">●</span>}
                      <div>
                        <p className={`font-body font-semibold text-sm leading-tight ${isMe ? 'text-cherry' : 'text-coal'}`}>{emp.short}</p>
                        {emp.type === 'servicios' && (
                          <p className="font-body text-[9px] font-bold uppercase tracking-wider text-coal/35 mt-0.5">Serv. generales</p>
                        )}
                      </div>
                    </div>
                  </td>
                  {DAYS.map(day => {
                    const value = schedule[emp.id]?.[day.key] ?? ''
                    const cell  = getCell(value, emp.type)
                    const opts  = emp.type === 'servicios' ? SERVICIOS_OPTS : SEDE_OPTS
                    const open  = picker?.empId === emp.id && picker?.dayKey === day.key
                    const enCaja = caja[day.key]?.[value] === emp.id
                    // La caja solo tiene sentido en una sede: no en descanso ni en aseo.
                    const puedeCaja = esCajero(emp.id) && emp.type !== 'servicios' &&
                                      value && value !== 'descanso'
                    return (
                      <td key={day.key} className="px-1.5 py-2 text-center relative">
                        <button
                          onClick={() => isAdmin && setPicker && setPicker(open ? null : { empId: emp.id, dayKey: day.key })}
                          className={`w-full px-1.5 py-2 rounded-lg border text-[11px] font-semibold leading-tight transition-all ${cell.color} ${
                            isAdmin ? 'hover:opacity-75 cursor-pointer' : 'cursor-default'
                          } ${open ? 'ring-2 ring-cherry/40' : ''} ${
                            isMe && value === 'descanso' ? 'ring-2 ring-mustard/40' : ''
                          }`}>
                          {cell.label || '—'}
                          {enCaja && (
                            <span className="block mt-0.5 text-[9px] font-bold uppercase tracking-wider text-coal/60">
                              Caja
                            </span>
                          )}
                        </button>
                        {open && isAdmin && (
                          <div className="absolute z-50 top-full left-1/2 -translate-x-1/2 mt-1 bg-white rounded-xl shadow-lg border border-coal/10 p-1.5 flex flex-col gap-1 min-w-[130px]">
                            {opts.map(opt => (
                              <button key={opt.value}
                                onClick={() => setCelda(emp.id, day.key, opt.value)}
                                className={`px-3 py-1.5 rounded-lg text-xs font-semibold border text-left hover:opacity-80 transition-opacity ${opt.color} ${value === opt.value ? 'ring-2 ring-coal/20' : ''}`}>
                                {opt.label}
                              </button>
                            ))}
                            {puedeCaja && toggleCaja && (
                              <button
                                onClick={() => toggleCaja(emp.id, day.key, value)}
                                className={`px-3 py-1.5 rounded-lg text-xs font-semibold border text-left hover:opacity-80 transition-opacity ${
                                  enCaja ? 'bg-coal text-cream border-coal' : 'bg-white text-coal/70 border-coal/15'
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
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}

// ─── Resumen de descansos ─────────────────────────────────────────────────────
function DescansosSummary({ empleados, schedule }) {
  if (Object.keys(schedule).length === 0) return null
  return (
    <div className="bg-white rounded-2xl shadow-soft p-4">
      <p className="font-display text-base tracking-wide text-coal mb-3">Descansos de la semana</p>
      <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-2">
        {DAYS.map(day => {
          const descansando = empleados.filter(e => schedule[e.id]?.[day.key] === 'descanso')
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
  )
}

// ─── Panel empleado: tarjeta personal ────────────────────────────────────────
function MiTurnoCard({ employee, schedule, caja = {}, monday }) {
  const mySchedule = schedule[employee.id] ?? {}
  const restDay    = DAYS.find(d => mySchedule[d.key] === 'descanso')

  return (
    <div className="bg-gradient-to-br from-cherry/10 to-tangelo/10 border border-cherry/20 rounded-2xl p-4 flex flex-col gap-3">
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 bg-cherry rounded-full flex items-center justify-center flex-shrink-0">
          <User size={20} className="text-cream" />
        </div>
        <div>
          <p className="font-display text-lg tracking-wide text-coal">{employee.name}</p>
          {employee.type === 'servicios' && (
            <p className="font-body text-[10px] font-bold uppercase tracking-wider text-coal/40">Servicios generales</p>
          )}
        </div>
      </div>

      {Object.keys(mySchedule).length === 0 ? (
        <div className="bg-white/60 rounded-xl px-4 py-3 text-center">
          <p className="font-body text-sm text-coal/50">El administrador aún no ha publicado el turno para esta semana.</p>
        </div>
      ) : (
        <>
          {/* Día de descanso destacado */}
          {restDay && (
            <div className="bg-mustard/15 border border-mustard/30 rounded-xl px-4 py-2.5 flex items-center gap-3">
              <span className="text-2xl">🛋️</span>
              <div>
                <p className="font-body text-xs text-coal/50 uppercase tracking-wider">Tu día de descanso</p>
                <p className="font-display text-lg text-coal tracking-wide">{restDay.label}</p>
                <p className="font-body text-[11px] text-coal/40">
                  {format(dayDate(monday, DAYS.indexOf(restDay)), "d 'de' MMMM", { locale: es })}
                </p>
              </div>
            </div>
          )}

          {/* Días de trabajo */}
          <div className="flex flex-col gap-1.5">
            <p className="font-body text-[11px] font-semibold uppercase tracking-wider text-coal/40">Tu semana</p>
            <div className="grid grid-cols-1 gap-1">
              {DAYS.map((day, i) => {
                const val  = mySchedule[day.key]
                if (!val) return null
                const cell = getCell(val, employee.type)
                const date = dayDate(monday, i)
                const isRest = val === 'descanso'
                return (
                  <div key={day.key} className={`flex items-center justify-between rounded-xl px-3 py-2 ${isRest ? 'bg-smoked/60' : 'bg-white/70'}`}>
                    <div>
                      <span className="font-display text-sm tracking-wide text-coal">{day.label}</span>
                      <span className="font-body text-[10px] text-coal/40 ml-2">{format(date, 'd MMM', { locale: es })}</span>
                    </div>
                    <div className="flex items-center gap-1.5">
                      {caja[day.key]?.[val] === employee.id && (
                        <span className="text-[10px] font-bold uppercase tracking-wider px-2 py-1 rounded-lg bg-coal text-cream">
                          Caja
                        </span>
                      )}
                      <span className={`text-[11px] font-semibold px-2.5 py-1 rounded-lg border ${cell.color}`}>
                        {cell.label}
                      </span>
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        </>
      )}
    </div>
  )
}

// ─── Pantalla de login ────────────────────────────────────────────────────────
function LoginScreen({ onLogin, error, loading }) {
  return (
    <div className="min-h-screen bg-gradient-to-br from-cherry to-tangelo flex flex-col items-center justify-center px-6">
      <div className="flex flex-col items-center gap-6 text-center max-w-xs w-full">
        <div className="flex flex-col items-center gap-2">
          <Logo variant="dark" size="lg" />
          <h1 className="font-display text-4xl text-cream tracking-widest">Turnos</h1>
          <p className="font-body text-cream/60 text-sm">Panel de gestión de empleados</p>
        </div>
        <div className="bg-cream/10 rounded-2xl p-4 w-full flex justify-center">
          <Calendar size={36} className="text-cream/40" />
        </div>
        <button onClick={onLogin} disabled={loading}
          className="w-full flex items-center justify-center gap-3 bg-cream text-coal font-body font-semibold text-base py-3.5 px-6 rounded-2xl shadow-lg hover:bg-cream/90 transition-colors disabled:opacity-60">
          {loading ? (
            <div className="w-5 h-5 border-2 border-coal/20 border-t-coal rounded-full animate-spin" />
          ) : (
            <svg viewBox="0 0 24 24" width="20" height="20">
              <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
              <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
              <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l3.66-2.84z"/>
              <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
            </svg>
          )}
          {loading ? 'Conectando…' : 'Ingresar con Google'}
        </button>

        {error && (
          <div className="bg-cream/20 border border-cream/30 rounded-xl px-4 py-3 w-full">
            <p className="font-body text-xs text-cream text-center">{error}</p>
          </div>
        )}

        <p className="font-body text-[11px] text-cream/40">
          Solo para administradores y empleados DeliStars
        </p>
      </div>
    </div>
  )
}

// ─── Header compartido ────────────────────────────────────────────────────────
function Header({ isAdmin, isEmployee, user, logout }) {
  return (
    <header className="bg-gradient-to-r from-cherry to-tangelo px-5 py-5 shadow-md">
      <div className="max-w-5xl mx-auto flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Logo variant="dark" size="sm" />
          <div>
            <h1 className="font-display text-2xl text-cream tracking-widest leading-tight">Turnos</h1>
            <p className="font-body text-[11px] text-cream/60">Gestión de empleados</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {isAdmin && <span className="hidden sm:block text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full bg-cream/20 text-cream">Admin</span>}
          {isEmployee && !isAdmin && <span className="hidden sm:block text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full bg-cream/20 text-cream">Empleado</span>}
          <span className="hidden sm:block text-cream/70 text-xs">{user.displayName?.split(' ')[0]}</span>
          <button onClick={logout} className="p-2 rounded-xl text-cream hover:bg-cream/10 transition-colors" title="Cerrar sesión">
            <LogOut size={18} />
          </button>
        </div>
      </div>
    </header>
  )
}

// ─── Componente principal ─────────────────────────────────────────────────────
export default function TurnosPage() {
  const [user,       setUser]       = useState(null)
  const [authReady,  setAuthReady]  = useState(false)
  const [loginError, setLoginError] = useState('')
  const [loginLoading, setLoginLoading] = useState(false)
  const [weekOffset, setWeekOffset] = useState(1)
  const [schedule,   setSchedule]   = useState({})
  const [saved,      setSaved]      = useState({})
  // Quién hace caja en cada sede cada día: caja[dia][sede] = empId.
  const [caja,       setCaja]       = useState({})
  const [savedCaja,  setSavedCaja]  = useState({})
  const [loading,    setLoading]    = useState(false)
  const [saving,     setSaving]     = useState(false)
  const [savedOk,    setSavedOk]    = useState(false)
  const [picker,     setPicker]     = useState(null)
  // Empleados dados de baja desde el panel de administración (roles_disabled).
  // Se escucha EN VIVO: al eliminar a alguien en el admin desaparece del cuadro
  // sin tener que editar el código ni volver a desplegar.
  const [disabledEmails, setDisabledEmails] = useState([])
  // Empleados creados desde el admin con datos de turnos (shiftType/shortName).
  const [extraEmployees, setExtraEmployees] = useState([])

  useEffect(() => {
    const unsubDis = onSnapshot(collection(db, 'roles_disabled'),
      snap => setDisabledEmails(snap.docs.map(d => d.id.toLowerCase())),
      () => {})
    // Un empleado puede estar en cajeros y/o domiciliarios: se juntan ambos.
    const acc = {}
    const watch = (col) => onSnapshot(collection(db, col), snap => {
      snap.docs.forEach(d => {
        acc[d.id.toLowerCase()] = { ...acc[d.id.toLowerCase()], ...d.data(), email: d.id.toLowerCase() }
      })
      setExtraEmployees(Object.values(acc))
    }, () => {})
    const unsubC = watch('roles_cashiers')
    const unsubD = watch('roles_drivers')
    return () => { unsubDis(); unsubC(); unsubD() }
  }, [])

  // Plantilla base + altas del admin, menos las bajas.
  const empleados = (() => {
    const baja = new Set(disabledEmails)
    // Si a alguien de la plantilla sin correo le crean su usuario desde el admin
    // con la misma cédula, manda el del panel (si no, saldría dos veces).
    const docsDelPanel = new Set(extraEmployees.map(e => (e.doc || '').trim()).filter(Boolean))
    const out = EMPLOYEES_BASE.filter(e =>
      e.email ? !baja.has(e.email.toLowerCase()) : !(e.doc && docsDelPanel.has(e.doc)))
    const ya = new Set(out.map(e => e.email.toLowerCase()))
    extraEmployees.forEach(e => {
      const email = (e.email || '').toLowerCase()
      if (!email || baja.has(email) || ya.has(email)) return
      if (e.shiftType !== 'regular' && e.shiftType !== 'servicios') return
      const nombre = e.name || email
      out.push({
        id:    email.split('@')[0].replace(/[^a-z0-9]/g, '') || email,
        email, name: nombre,
        short: e.shortName || nombre.split(' ')[0],
        type:  e.shiftType,
      })
      ya.add(email)
    })
    return out
  })()

  const monday  = getMonday(weekOffset)
  const wid     = weekId(monday)
  const userEmail = user?.email?.toLowerCase() ?? ''
  const isAdmin   = ADMIN_EMAILS.map(e => e.toLowerCase()).includes(userEmail)
  // Sin correo no hay a quién parear: los empleados aún sin correo (email '')
  // no deben calzar con una sesión sin email.
  const myEmployee = userEmail
    ? empleados.find(e => e.email.toLowerCase() === userEmail) ?? null
    : null
  const isEmployee = myEmployee !== null
  const dirty      = JSON.stringify(schedule) !== JSON.stringify(saved) ||
                     JSON.stringify(caja) !== JSON.stringify(savedCaja)

  // Auth con timeout de seguridad + captura resultado de redirect
  useEffect(() => {
    const timer = setTimeout(() => setAuthReady(true), 4000)
    // Capturar resultado si venimos de un redirect de Google
    getRedirectResult(auth).then(result => {
      if (result?.user) setUser(result.user)
    }).catch(() => {})
    const unsub = onAuthStateChanged(auth, u => {
      setUser(u ?? null)
      setAuthReady(true)
      clearTimeout(timer)
    })
    return () => { unsub(); clearTimeout(timer) }
  }, [])

  // Cargar turno desde Firestore
  useEffect(() => {
    setLoading(true)
    setPicker(null)
    getDoc(doc(db, 'turnos', wid))
      .then(snap => {
        const data = snap.exists() ? (snap.data().schedule ?? {}) : {}
        const cajas = snap.exists() ? (snap.data().caja ?? {}) : {}
        setSchedule(data); setSaved(data)
        setCaja(cajas); setSavedCaja(cajas)
      })
      .catch(() => { setSchedule({}); setSaved({}); setCaja({}); setSavedCaja({}) })
      .finally(() => setLoading(false))
  }, [wid])

  const login = async () => {
    setLoginError('')
    setLoginLoading(true)
    try {
      await signInWithPopup(auth, provider)
    } catch (err) {
      // En móvil o si el popup fue bloqueado, usar redirect
      if (err.code === 'auth/popup-blocked' || err.code === 'auth/popup-cancelled-by-user' || /mobile|android|iphone/i.test(navigator.userAgent)) {
        try { await signInWithRedirect(auth, provider) } catch (e) { setLoginError('Error al iniciar sesión. Intenta de nuevo.') }
      } else if (err.code === 'auth/unauthorized-domain') {
        setLoginError('Dominio no autorizado en Firebase. Contacta al administrador.')
      } else if (err.code !== 'auth/cancelled-popup-request') {
        setLoginError(`Error: ${err.message}`)
      }
    } finally {
      setLoginLoading(false)
    }
  }
  const logout = () => { signOut(auth); setPicker(null) }

  const [avisos, setAvisos] = useState([])

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
        weekStart: format(monday, 'yyyy-MM-dd'),
        schedule,
        caja,
        updatedAt: serverTimestamp(),
        updatedBy: user.email,
        published: true,
      })
      setSaved({ ...schedule })
      setSavedCaja({ ...caja })
      setSavedOk(true)
      setTimeout(() => setSavedOk(false), 3000)
    } catch (e) { console.error(e) }
    finally { setSaving(false) }
  }

  const setCelda = (empId, dayKey, value) => {
    setSchedule(prev => ({ ...prev, [empId]: { ...(prev[empId] ?? {}), [dayKey]: value } }))
    // Si estaba en caja y lo cambian de sede (o a descanso), esa caja queda
    // huérfana: se limpia para que nadie quede marcado donde ya no está.
    setCaja(prev => {
      const delDia = { ...(prev[dayKey] ?? {}) }
      let cambio = false
      Object.keys(delDia).forEach(sede => {
        if (delDia[sede] === empId && sede !== value) { delete delDia[sede]; cambio = true }
      })
      return cambio ? { ...prev, [dayKey]: delDia } : prev
    })
    setPicker(null)
  }

  // Marcar/desmarcar caja. Solo una persona por sede y día: al marcar a alguien
  // el anterior queda libre automáticamente.
  const toggleCaja = (empId, dayKey, sede) => {
    setCaja(prev => {
      const delDia = { ...(prev[dayKey] ?? {}) }
      if (delDia[sede] === empId) delete delDia[sede]
      else delDia[sede] = empId
      return { ...prev, [dayKey]: delDia }
    })
    setPicker(null)
  }

  // Cargando auth por primera vez
  if (!authReady) return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-cherry to-tangelo">
      <div className="w-10 h-10 border-4 border-cream/30 border-t-cream rounded-full animate-spin" />
    </div>
  )

  // Sin sesión → pantalla de login
  if (!user) return <LoginScreen onLogin={login} error={loginError} loading={loginLoading} />

  // ── PANEL ADMINISTRADOR ──────────────────────────────────────────────────────
  if (isAdmin) return (
    <div className="min-h-screen bg-gradient-soft">
      <Header isAdmin={isAdmin} isEmployee={isEmployee} user={user} logout={logout} />
      <div className="max-w-5xl mx-auto px-3 py-5 flex flex-col gap-4">

        <WeekSelector weekOffset={weekOffset} setWeekOffset={setWeekOffset} />

        {/* Controles admin */}
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
            <Save size={14} /> {savedOk ? '✓ Publicado' : saving ? 'Guardando…' : 'Publicar turno'}
          </button>
        </div>

        {savedOk && (
          <div className="bg-mint/10 border border-mint/30 rounded-xl px-4 py-2.5 text-center">
            <p className="font-body text-sm text-[#2d8c6f] font-semibold">
              ✓ Turno publicado — los empleados ya pueden verlo al iniciar sesión
            </p>
          </div>
        )}

        {/* Leyenda */}
        <div className="flex flex-wrap gap-1.5">
          {SEDE_OPTS.map(s => <span key={s.value} className={`text-[11px] font-semibold px-2.5 py-1 rounded-full border ${s.color}`}>{s.label}</span>)}
          <span className="text-[11px] font-semibold px-2.5 py-1 rounded-full border bg-mustard/20 text-[#7a5c00] border-mustard/30">Mañana (Serv. Grales.)</span>
          <span className="text-[11px] font-semibold px-2.5 py-1 rounded-full border bg-coal text-cream border-coal">Caja</span>
        </div>

        {loading ? (
          <div className="flex justify-center py-20">
            <div className="w-8 h-8 border-4 border-cherry/20 border-t-cherry rounded-full animate-spin" />
          </div>
        ) : (
          <>
            {avisos.length > 0 && (
              <div className="bg-mustard/15 border border-mustard/40 rounded-2xl p-3">
                {avisos.map(aviso => (
                  <p key={aviso} className="font-body text-xs text-[#7a5c00]">⚠️ {aviso}</p>
                ))}
              </div>
            )}
            <ScheduleTable
              empleados={empleados}
              schedule={schedule} caja={caja} monday={monday} isAdmin={true}
              picker={picker} setPicker={setPicker} setCelda={setCelda} toggleCaja={toggleCaja} />
            <DescansosSummary empleados={empleados} schedule={schedule} />
          </>
        )}

        {picker && <div className="fixed inset-0 z-40" onClick={() => setPicker(null)} />}
        <p className="text-center font-body text-[10px] text-coal/25 pb-4">DeliStars · Panel de Turnos</p>
      </div>
    </div>
  )

  // ── PANEL EMPLEADO ───────────────────────────────────────────────────────────
  if (isEmployee) return (
    <div className="min-h-screen bg-gradient-soft">
      <Header isAdmin={isAdmin} isEmployee={isEmployee} user={user} logout={logout} />
      <div className="max-w-2xl mx-auto px-3 py-5 flex flex-col gap-4">

        <WeekSelector weekOffset={weekOffset} setWeekOffset={setWeekOffset} />

        {loading ? (
          <div className="flex justify-center py-20">
            <div className="w-8 h-8 border-4 border-cherry/20 border-t-cherry rounded-full animate-spin" />
          </div>
        ) : (
          <>
            {/* Tarjeta personal */}
            <MiTurnoCard employee={myEmployee} schedule={schedule} caja={caja} monday={monday} />

            {/* Grid completo (lectura) */}
            <div>
              <p className="font-display text-base tracking-wide text-coal mb-2 px-1">Turnos del equipo</p>
              <ScheduleTable empleados={empleados} schedule={schedule} caja={caja} monday={monday} isAdmin={false} myEmployeeId={myEmployee.id} />
            </div>

            <DescansosSummary empleados={empleados} schedule={schedule} />
          </>
        )}

        <p className="text-center font-body text-[10px] text-coal/25 pb-4">DeliStars · Mis Turnos</p>
      </div>
    </div>
  )

  // ── Usuario logueado pero no es empleado ni admin ────────────────────────────
  return (
    <div className="min-h-screen bg-gradient-to-br from-cherry to-tangelo flex flex-col items-center justify-center px-6 text-center">
      <p className="text-6xl mb-4">🔒</p>
      <h2 className="font-display text-2xl text-cream tracking-widest mb-2">Acceso restringido</h2>
      <p className="font-body text-cream/70 text-sm max-w-xs">
        Esta sección es solo para el equipo DeliStars.<br />
        Iniciaste sesión con <strong>{user.email}</strong>
      </p>
      <button onClick={logout} className="mt-6 flex items-center gap-2 bg-cream/20 hover:bg-cream/30 text-cream font-body text-sm font-semibold px-4 py-2 rounded-xl transition-colors">
        <LogOut size={14} /> Cerrar sesión
      </button>
    </div>
  )
}
