import { useCallback, useEffect, useMemo, useState } from 'react'
import { createPortal } from 'react-dom'
import { MonitorSmartphone, X, LogOut, Loader2, ShieldAlert } from 'lucide-react'
import { signOut } from 'firebase/auth'
import { auth } from '../../services/firebase'
import { useAuth } from '../../contexts/AuthContext'
import { llamarApi, ErrorApi } from '../../services/pedidosApi'
import { sesionGuardada, olvidarSesion } from '../../services/sesionEquipo'
import { SEDES, ROLES } from '../../services/roles'

// «Mis sesiones» (especificación §6.3): en qué aparatos tiene sesión abierta
// esta persona, y cerrar la de un aparato o todas. Administración ve además
// las de todo el equipo y puede cerrarlas.

const ROL = { caja: 'Caja', domiciliario: 'Domiciliario', admin: 'Administración' }
const hace = (ms) => {
  if (!ms) return 'sin datos'
  const min = Math.round((Date.now() - ms) / 60000)
  if (min < 2) return 'ahora'
  if (min < 60) return `hace ${min} min`
  const h = Math.round(min / 60)
  if (h < 48) return `hace ${h} h`
  return `hace ${Math.round(h / 24)} días`
}

export function BotonMisSesiones({ variante = 'icono', className = '', onAbrir }) {
  const [abierto, setAbierto] = useState(false)
  const abrir = () => { onAbrir?.(); setAbierto(true) }
  return (
    <>
      {variante === 'menu' ? (
        <button onClick={abrir} className={className}><MonitorSmartphone size={16} aria-hidden="true" /> Mis sesiones</button>
      ) : (
        <button onClick={abrir} title="Mis sesiones: en qué aparatos tienes sesión abierta"
          className={`btn-icon flex items-center gap-1 px-2 w-auto min-w-11 ${className}`}>
          <MonitorSmartphone size={20} aria-hidden="true" />
          <span className="font-body text-xs font-semibold hidden xl:inline">Sesiones</span>
        </button>
      )}
      {/* En el body: dentro del menú del domiciliario quedaría tapada */}
      {abierto && createPortal(<MisSesiones onClose={() => setAbierto(false)} />, document.body)}
    </>
  )
}

function MisSesiones({ onClose }) {
  const { user, role } = useAuth()
  const esAdmin = role === ROLES.ADMIN
  const [verTodo, setVerTodo] = useState(false)
  const [sesiones, setSesiones] = useState(null)
  const [error, setError] = useState('')
  const [ocupado, setOcupado] = useState(null) // id o 'todas'
  const actual = sesionGuardada(user?.uid)?.id

  const cargar = useCallback(async () => {
    setError('')
    try { setSesiones(await llamarApi('GET', `equipo/sesiones${verTodo ? '?todos=1' : ''}`)) }
    catch (e) { setError(e instanceof ErrorApi ? e.message : 'No se pudo cargar. Revisa la conexión.'); setSesiones([]) }
  }, [verTodo])
  useEffect(() => { cargar() }, [cargar])

  const cerrar = async (s) => {
    const quien = s.email === user?.email ? 'tu sesión en' : `la sesión de ${s.nombre || s.email} en`
    if (!window.confirm(`¿Cerrar ${quien} ${s.aparato} (${s.navegador})? Ese aparato sale de inmediato.`)) return
    setOcupado(s.id)
    try { await llamarApi('POST', `equipo/sesiones/${s.id}/cerrar`, {}); await cargar() }
    catch (e) { setError(e instanceof ErrorApi ? e.message : 'No se pudo cerrar. Intenta de nuevo.') }
    finally { setOcupado(null) }
  }
  const cerrarTodas = async (email) => {
    const propia = !email || email === user?.email
    if (!window.confirm(propia
      ? '¿Cerrar tu sesión en TODOS los aparatos, también en este? Tendrás que volver a entrar en cada uno.'
      : `¿Cerrar todas las sesiones de ${email}? Tendrá que volver a entrar en cada aparato.`)) return
    setOcupado(email || 'todas')
    try {
      await llamarApi('POST', 'equipo/sesiones/cerrar-todas', propia ? {} : { email })
      if (propia) { olvidarSesion(user.uid); await signOut(auth); return }
      await cargar()
    } catch (e) { setError(e instanceof ErrorApi ? e.message : 'No se pudo cerrar. Intenta de nuevo.') }
    finally { setOcupado(null) }
  }

  // Administración: agrupadas por persona.
  const grupos = useMemo(() => {
    const m = new Map()
    for (const s of sesiones || []) { const k = s.email || s.id; m.set(k, [...(m.get(k) || []), s]) }
    return [...m.entries()]
  }, [sesiones])

  const fila = (s) => (
    <li key={s.id} className="bg-white rounded-xl border border-coal/10 px-3 py-2.5 flex items-center gap-3">
      <MonitorSmartphone size={18} className="text-coal/45 flex-shrink-0" aria-hidden="true" />
      <div className="min-w-0 flex-1">
        <p className="font-body text-sm font-semibold text-coal truncate">
          {s.aparato}{s.navegador ? ` · ${s.navegador}` : ''}
          {s.id === actual && <span className="ml-2 text-[10px] uppercase tracking-wider bg-mint/15 text-mint rounded-full px-2 py-0.5">Este aparato</span>}
        </p>
        <p className="font-body text-xs text-coal/55">
          {[ROL[s.rol], SEDES[s.sedeId]?.name, `usado ${hace(s.vistaAt)}`].filter(Boolean).join(' · ')}
          {s.sinUso && <span className="text-tangelo"> · lleva días sin usarse</span>}
        </p>
      </div>
      {s.id !== actual && (
        <button onClick={() => cerrar(s)} disabled={!!ocupado} className="btn-secondary btn-sm whitespace-nowrap">
          {ocupado === s.id ? <Loader2 size={14} className="animate-spin" aria-hidden="true" /> : <LogOut size={14} aria-hidden="true" />} Cerrar
        </button>
      )}
    </li>
  )

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-coal/50 backdrop-blur-sm animate-fade-in"
      onClick={(e) => { if (e.target === e.currentTarget) onClose() }}>
      <div className="bg-cream w-full max-w-lg rounded-t-3xl sm:rounded-3xl max-h-[92dvh] overflow-y-auto scroll-custom animate-sheet-up sm:animate-scale-in">
        <div className="sticky top-0 z-10 bg-cream/95 backdrop-blur-sm flex items-center justify-between px-5 py-4 border-b border-coal/10">
          <p className="font-display text-lg tracking-wide text-coal flex items-center gap-2">
            <MonitorSmartphone size={19} className="text-cherry" aria-hidden="true" /> {verTodo ? 'Sesiones del equipo' : 'Mis sesiones'}
          </p>
          <button onClick={onClose} className="btn-icon" aria-label="Cerrar"><X size={20} aria-hidden="true" /></button>
        </div>
        <div className="p-5 flex flex-col gap-4">
          {esAdmin && (
            <div className="grid grid-cols-2 gap-2">
              {[[false, 'Mis sesiones'], [true, 'Todo el equipo']].map(([v, t]) => (
                <button key={t} onClick={() => { setSesiones(null); setVerTodo(v) }}
                  className={`btn btn-sm w-full justify-center border-2 ${verTodo === v ? 'border-cherry bg-cherry/10 text-cherry' : 'border-coal/15 text-coal/60 bg-cream'}`}>{t}</button>
              ))}
            </div>
          )}
          <p className="font-body text-xs text-coal/60 leading-relaxed">
            {verTodo
              ? 'Aparatos donde alguien del equipo tiene sesión abierta. Si cierras una, ese aparato sale de inmediato.'
              : 'Aparatos donde tienes sesión abierta. Si no reconoces uno, ciérralo: sale de inmediato.'}
          </p>
          {sesiones === null ? (
            <p className="font-body text-sm text-coal/50">Cargando…</p>
          ) : !sesiones.length ? (
            <p className="font-body text-sm text-coal/50">No hay sesiones abiertas registradas.</p>
          ) : verTodo ? (
            grupos.map(([email, lista]) => (
              <div key={email} className="flex flex-col gap-2">
                <div className="flex items-center justify-between gap-2">
                  <p className="font-body text-sm font-bold text-coal truncate">{lista[0].nombre || email} <span className="font-normal text-coal/50">· {email}</span></p>
                  <button onClick={() => cerrarTodas(email)} disabled={!!ocupado} className="btn-ghost btn-sm text-pepper whitespace-nowrap">Cerrar todas</button>
                </div>
                <ul className="flex flex-col gap-2">{lista.map(fila)}</ul>
              </div>
            ))
          ) : (
            <ul className="flex flex-col gap-2">{sesiones.map(fila)}</ul>
          )}
          {!verTodo && (
            <button onClick={() => cerrarTodas()} disabled={!!ocupado} className="btn-secondary w-full text-pepper border-pepper/30">
              <ShieldAlert size={17} aria-hidden="true" /> {ocupado === 'todas' ? 'Cerrando…' : 'Cerrar en todos los aparatos (también este)'}
            </button>
          )}
          {error && <p className="font-body text-sm text-pepper">{error}</p>}
        </div>
      </div>
    </div>
  )
}
