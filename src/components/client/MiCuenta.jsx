import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { doc, setDoc, serverTimestamp } from 'firebase/firestore'
import { updateProfile } from 'firebase/auth'
import { X, Mail, Trash2, Check, ShieldCheck, LogOut } from 'lucide-react'
import {
  db, auth, PROVEEDORES, metodosDe, vincularMetodo, agregarContrasena, quitarMetodo, confirmarIdentidad,
} from '../../services/firebase'
import { llamarApi, ErrorApi } from '../../services/pedidosApi'
import { mensajeAuth, esCancelacion } from '../../utils/erroresAuth'
import { LogoGoogle, LogoMicrosoft } from '../common/LogosMarca'
import { useAuth } from '../../contexts/AuthContext'

// Mi cuenta (especificación §6.1 puntos 8, 10 y 11; Fase 4, paso 4): datos,
// formas de entrar, promociones y eliminar la cuenta. Eliminar deja una
// solicitud de 30 días (decisión P-25 del 21 oct 2026): el saldo a favor se le
// transfiere y los pedidos quedan sin datos personales.

const campo = 'w-full bg-white border border-coal/15 rounded-xl px-3 py-2.5 font-body text-sm text-coal focus:outline-none focus:border-cherry'
const fecha = (ms) => (ms ? new Date(ms).toLocaleDateString('es-CO', { day: 'numeric', month: 'long', year: 'numeric' }) : '')
const pesos = (n) => `$${Number(n || 0).toLocaleString('es-CO')}`
const NOMBRE_SEDE = { santa_lucia: 'Santa Lucía', santa_teresita: 'Santa Teresita' }

function Seccion({ titulo, children }) {
  return (
    <section className="bg-white rounded-2xl border border-coal/10 p-4 flex flex-col gap-3">
      <p className="font-display text-lg tracking-wide text-coal">{titulo}</p>
      {children}
    </section>
  )
}

export default function MiCuenta({ user, perfil, onCerrar }) {
  // Cerrar sesión vive aquí, y no entre los iconos del encabezado: en un
  // celular no caben todos, y este es el sitio donde uno lo busca.
  const { logout } = useAuth()
  return createPortal(
    <div className="fixed inset-0 z-[140] bg-gradient-soft overflow-y-auto animate-sheet-up">
      <div className="sticky top-0 z-10 bg-cream/95 backdrop-blur-sm px-5 py-4 border-b border-coal/10 flex items-center justify-between">
        <p className="font-display text-xl text-coal tracking-wide">Mi cuenta</p>
        <button onClick={onCerrar} className="btn-icon" aria-label="Cerrar"><X size={20} /></button>
      </div>
      <div className="p-4 max-w-lg mx-auto flex flex-col gap-4 pb-16">
        <Datos user={user} perfil={perfil} />
        <FormasDeEntrar user={user} />
        {user?.email && <Promociones user={user} perfil={perfil} />}
        <button onClick={logout} className="btn-secondary w-full">
          <LogOut size={18} aria-hidden="true" /> Cerrar sesión
        </button>
        <EliminarCuenta user={user} />
      </div>
    </div>,
    document.body,
  )
}

function Datos({ user, perfil }) {
  const [nombre, setNombre] = useState(perfil?.name || user?.displayName || '')
  const [telefono, setTelefono] = useState(perfil?.phone || '')
  const [msg, setMsg] = useState('')
  const [busy, setBusy] = useState(false)
  const guardar = async (e) => {
    e.preventDefault()
    const tel = telefono.replace(/\D/g, '')
    if (nombre.trim().length < 3) { setMsg('Escribe tu nombre completo.'); return }
    if (tel.length < 10) { setMsg('El teléfono debe tener 10 dígitos.'); return }
    setBusy(true); setMsg('')
    try {
      await setDoc(doc(db, 'customers', user.uid), { uid: user.uid, name: nombre.trim(), phone: tel.slice(-10) }, { merge: true })
      if (auth.currentUser) await updateProfile(auth.currentUser, { displayName: nombre.trim() }).catch(() => {})
      setMsg('Guardado ✓')
    } catch { setMsg('No se pudo guardar. Revisa tu conexión.') } finally { setBusy(false) }
  }
  return (
    <Seccion titulo="Mis datos">
      <form onSubmit={guardar} className="flex flex-col gap-2">
        <label className="label-field">Nombre completo</label>
        <input className={campo} value={nombre} onChange={(e) => setNombre(e.target.value)} autoComplete="name" />
        <label className="label-field">Teléfono / WhatsApp</label>
        <input className={campo} value={telefono} onChange={(e) => setTelefono(e.target.value)} inputMode="tel" autoComplete="tel" />
        {user?.email && <p className="font-body text-xs text-coal/55">Correo: <strong>{user.email}</strong></p>}
        <button type="submit" disabled={busy} className="btn-primary w-full mt-1">{busy ? 'Guardando…' : 'Guardar'}</button>
        {msg && <p className="font-body text-xs text-coal/70">{msg}</p>}
      </form>
    </Seccion>
  )
}

const ICONOS = {
  'google.com': <LogoGoogle />,
  'microsoft.com': <LogoMicrosoft />,
  password: <Mail size={18} className="text-cherry" />,
}

function FormasDeEntrar({ user }) {
  const [metodos, setMetodos] = useState(() => metodosDe(user))
  const [busy, setBusy] = useState(null)
  const [error, setError] = useState('')
  const [clave, setClave] = useState(null) // null = cerrado; '' = escribiendo
  const refrescar = () => setMetodos(metodosDe(auth.currentUser))

  const correr = async (cual, fn) => {
    setBusy(cual); setError('')
    try { await fn(); refrescar() } catch (err) { if (!esCancelacion(err)) setError(mensajeAuth(err)) } finally { setBusy(null) }
  }
  const quitar = (id) => {
    if (!window.confirm(`¿Quitar «${PROVEEDORES[id].nombre}» de tu cuenta? Ya no podrás entrar así.`)) return
    correr(id, () => quitarMetodo(id))
  }
  const guardarClave = (e) => {
    e.preventDefault()
    if ((clave || '').length < 6) { setError('La contraseña debe tener al menos 6 caracteres.'); return }
    correr('password', async () => { await agregarContrasena(clave); setClave(null) })
  }

  return (
    <Seccion titulo="Formas de entrar">
      <p className="font-body text-xs text-coal/60 -mt-1">
        Entra con cualquiera de estas. Siempre debe quedar al menos una.
      </p>
      {Object.keys(PROVEEDORES).map((id) => {
        const tiene = metodos.includes(id)
        // La contraseña va con el correo de la cuenta (no se puede sin correo).
        if (id === 'password' && !tiene && !user?.email) return null
        return (
          <div key={id} className="flex items-center gap-3 border border-coal/10 rounded-xl px-3 py-2.5">
            <span className="w-6 flex justify-center">{ICONOS[id]}</span>
            <span className="flex-1 font-body text-sm font-semibold text-coal">{PROVEEDORES[id].nombre}</span>
            {tiene ? (
              <>
                <span className="font-body text-xs text-mint font-semibold inline-flex items-center gap-1"><Check size={13} /> Vinculada</span>
                {metodos.length > 1 && (
                  <button onClick={() => quitar(id)} disabled={!!busy} className="font-body text-xs text-pepper underline underline-offset-2 ml-2">
                    {busy === id ? '…' : 'Quitar'}
                  </button>
                )}
              </>
            ) : id === 'password' ? (
              <button onClick={() => setClave('')} disabled={!!busy} className="btn-secondary btn-sm">Agregar</button>
            ) : (
              <button onClick={() => correr(id, () => vincularMetodo(id))} disabled={!!busy} className="btn-secondary btn-sm">
                {busy === id ? 'Conectando…' : 'Vincular'}
              </button>
            )}
          </div>
        )
      })}
      {clave !== null && (
        <form onSubmit={guardarClave} className="flex flex-col gap-2 bg-smoked/40 rounded-xl p-3">
          <p className="font-body text-xs text-coal/70">Crea una contraseña para entrar con <strong>{user.email}</strong>.</p>
          <input className={campo} type="password" autoComplete="new-password" placeholder="Contraseña nueva (6 o más)"
            value={clave} onChange={(e) => setClave(e.target.value)} />
          <div className="flex gap-2">
            <button type="submit" disabled={!!busy} className="btn-primary flex-1 text-sm">{busy === 'password' ? 'Guardando…' : 'Guardar contraseña'}</button>
            <button type="button" onClick={() => setClave(null)} className="btn-secondary flex-1 text-sm">Cancelar</button>
          </div>
        </form>
      )}
      {error && <p className="font-body text-xs text-pepper">{error}</p>}
    </Seccion>
  )
}

function Promociones({ user, perfil }) {
  const [acepta, setAcepta] = useState(perfil?.promociones?.acepta === true)
  const [busy, setBusy] = useState(false)
  const cambiar = async () => {
    const nuevo = !acepta
    setBusy(true)
    try {
      await setDoc(doc(db, 'customers', user.uid), {
        promociones: { acepta: nuevo, fecha: serverTimestamp(), fuente: 'mi_cuenta', email: user.email },
      }, { merge: true })
      setAcepta(nuevo)
    } catch { /* se queda como estaba */ } finally { setBusy(false) }
  }
  return (
    <Seccion titulo="Promociones por correo">
      <label className="flex items-start gap-3 cursor-pointer">
        <input type="checkbox" checked={acepta} onChange={cambiar} disabled={busy} className="mt-1 w-5 h-5 accent-cherry" />
        <span className="font-body text-sm text-coal/80 leading-relaxed">
          Quiero recibir descuentos y novedades de DeliStars en <strong>{user.email}</strong>.
          Los avisos de tus pedidos te siguen llegando igual.
        </span>
      </label>
    </Seccion>
  )
}

function EliminarCuenta({ user }) {
  const [abierto, setAbierto] = useState(false)
  const [estado, setEstado] = useState(null)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [datos, setDatos] = useState({ medio: '', numero: '', titular: '', documento: '' })
  const [clave, setClave] = useState('')
  const [confirmo, setConfirmo] = useState('')
  const conClave = metodosDe(user).includes('password')

  const cargar = () => llamarApi('GET', 'cuenta/eliminacion').then(setEstado)
    .catch((err) => setError(err instanceof ErrorApi ? err.message : 'No se pudo consultar. Revisa tu conexión.'))
  useEffect(() => { if (abierto && !estado) cargar() }, [abierto]) // eslint-disable-line react-hooks/exhaustive-deps

  const saldo = Object.entries(estado?.saldo || {})
  const total = saldo.reduce((t, [, m]) => t + m, 0)

  const eliminar = async () => {
    if (confirmo.trim().toUpperCase() !== 'ELIMINAR') { setError('Escribe ELIMINAR para confirmar.'); return }
    if (conClave && !clave) { setError('Escribe tu contraseña para confirmar que eres tú.'); return }
    setBusy(true); setError('')
    try {
      await confirmarIdentidad({ password: clave || undefined })
      setEstado(await llamarApi('POST', 'cuenta/eliminacion', total > 0 ? { datosDevolucion: datos } : {}))
      setClave(''); setConfirmo('')
    } catch (err) {
      if (esCancelacion(err)) return
      setError(err instanceof ErrorApi ? err.message : mensajeAuth(err))
    } finally { setBusy(false) }
  }
  const arrepentirse = async () => {
    setBusy(true); setError('')
    try { setEstado(await llamarApi('DELETE', 'cuenta/eliminacion')) }
    catch (err) { setError(err instanceof ErrorApi ? err.message : 'No se pudo. Intenta de nuevo.') }
    finally { setBusy(false) }
  }

  if (!abierto) {
    return (
      <button onClick={() => setAbierto(true)}
        className="w-full flex items-center justify-center gap-2 py-3 rounded-2xl border border-pepper/40 text-pepper font-body text-sm font-semibold bg-white">
        <Trash2 size={16} /> Eliminar mi cuenta
      </button>
    )
  }

  return (
    <Seccion titulo="Eliminar mi cuenta">
      {!estado && !error && <p className="font-body text-sm text-coal/60">Revisando tu cuenta…</p>}

      {estado?.solicitud ? (
        <>
          <div className="bg-pepper/10 border-2 border-pepper/40 rounded-xl p-3">
            <p className="font-body text-sm font-bold text-coal">Tu cuenta se eliminará el {fecha(estado.solicitud.ejecutarDesde)}.</p>
            <p className="font-body text-xs text-coal/70 mt-1">Mientras tanto no puedes hacer pedidos. Si cambiaste de opinión, cancélala.</p>
          </div>
          {estado.pendientes.length > 0 && <Pendientes lista={estado.pendientes} titulo="Antes de borrarla terminamos esto:" />}
          <button onClick={arrepentirse} disabled={busy} className="btn-primary w-full">
            {busy ? 'Un momento…' : 'Cancelar la eliminación y seguir con mi cuenta'}
          </button>
        </>
      ) : estado ? (
        <>
          <ul className="font-body text-sm text-coal/80 leading-relaxed list-disc pl-5 flex flex-col gap-1">
            <li>Tu cuenta se borra <strong>en 30 días</strong>. Si entras antes, puedes arrepentirte.</li>
            <li>Mientras tanto <strong>no puedes hacer pedidos</strong>.</li>
            <li>Se borran tus datos, direcciones y <strong>tus premios de fidelización</strong>.</li>
            <li>Tus pedidos quedan para la contabilidad de la sede, <strong>sin tu nombre, teléfono, correo ni dirección</strong>.</li>
          </ul>
          {estado.pendientes.length > 0 && <Pendientes lista={estado.pendientes} titulo="Esto se resuelve primero:" />}

          {total > 0 && (
            <div className="bg-mint/10 border border-mint/40 rounded-xl p-3 flex flex-col gap-2">
              <p className="font-body text-sm text-coal">
                Tienes <strong>{pesos(total)}</strong> de saldo a favor
                {saldo.length > 1 ? ` (${saldo.map(([s, m]) => `${pesos(m)} en ${NOMBRE_SEDE[s] || s}`).join(' y ')})` : ` en ${NOMBRE_SEDE[saldo[0][0]] || saldo[0][0]}`}.
                Te lo transferimos: ¿a dónde?
              </p>
              <select className={campo} value={datos.medio} onChange={(e) => setDatos((d) => ({ ...d, medio: e.target.value }))}>
                <option value="">— Elige —</option>
                {['Nequi', 'Daviplata', 'Bancolombia', 'Otro banco'].map((m) => <option key={m}>{m}</option>)}
              </select>
              <input className={campo} inputMode="numeric" placeholder="Número de cuenta o celular"
                value={datos.numero} onChange={(e) => setDatos((d) => ({ ...d, numero: e.target.value }))} />
              <input className={campo} placeholder="Nombre del titular"
                value={datos.titular} onChange={(e) => setDatos((d) => ({ ...d, titular: e.target.value }))} />
              {['Bancolombia', 'Otro banco'].includes(datos.medio) && (
                <input className={campo} inputMode="numeric" placeholder="Cédula del titular (opcional)"
                  value={datos.documento} onChange={(e) => setDatos((d) => ({ ...d, documento: e.target.value }))} />
              )}
            </div>
          )}

          <div className="flex flex-col gap-2 border-t border-coal/10 pt-3">
            <p className="font-body text-xs text-coal/70 flex items-center gap-1.5">
              <ShieldCheck size={14} /> {conClave ? 'Confirma que eres tú con tu contraseña.' : 'Te pediremos entrar otra vez para confirmar que eres tú.'}
            </p>
            {conClave && (
              <input className={campo} type="password" autoComplete="current-password" placeholder="Tu contraseña"
                value={clave} onChange={(e) => setClave(e.target.value)} />
            )}
            <input className={campo} placeholder="Escribe ELIMINAR" autoCapitalize="characters"
              value={confirmo} onChange={(e) => setConfirmo(e.target.value)} />
            <button onClick={eliminar} disabled={busy}
              className="w-full py-3 rounded-xl bg-pepper text-cream font-body text-sm font-bold disabled:opacity-50">
              {busy ? 'Un momento…' : 'Eliminar mi cuenta'}
            </button>
            <button onClick={() => setAbierto(false)} className="font-body text-xs text-coal/60 underline underline-offset-2">
              No, la conservo
            </button>
          </div>
        </>
      ) : null}
      {error && <p className="font-body text-xs text-pepper">{error}</p>}
    </Seccion>
  )
}

function Pendientes({ lista, titulo }) {
  return (
    <div className="bg-tangelo/10 border border-tangelo/40 rounded-xl p-3">
      <p className="font-body text-xs font-bold text-coal">{titulo}</p>
      <ul className="font-body text-xs text-coal/75 mt-1 list-disc pl-4 flex flex-col gap-0.5">
        {lista.map((p) => <li key={`${p.tipo}-${p.id}`}>{p.texto}</li>)}
      </ul>
    </div>
  )
}
