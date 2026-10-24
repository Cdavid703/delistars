import { useState } from 'react'
import { createPortal } from 'react-dom'
import { X, Eye, EyeOff, Mail } from 'lucide-react'
import {
  loginGoogle, loginMicrosoft, loginApple, crearCuentaCorreo, entrarConCorreo, recuperarContrasena,
} from '../../services/firebase'
import { mensajeAuth, esCancelacion, erroresRegistro } from '../../utils/erroresAuth'
import { LogoGoogle, LogoMicrosoft, LogoApple } from './LogosMarca'

// Entrar o crear cuenta (especificación §6.1): Google, Apple, Microsoft y
// correo con contraseña. Si la persona estaba como invitada, los botones y
// "Crear cuenta" ENLAZAN su sesión: no pierde el pedido que ya hizo.
export default function AccesoCuenta({ titulo = 'Entra o crea tu cuenta', onCerrar, onListo }) {
  const [modo, setModo] = useState('entrar') // 'entrar' | 'crear'
  const [form, setForm] = useState({ nombre: '', telefono: '', email: '', password: '' })
  const [verClave, setVerClave] = useState(false)
  const [busy, setBusy] = useState(null)
  const [errores, setErrores] = useState([])
  const [aviso, setAviso] = useState('')
  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }))

  const correr = async (cual, fn) => {
    setBusy(cual); setErrores([]); setAviso('')
    try {
      await fn()
    } catch (err) {
      if (!esCancelacion(err)) setErrores([mensajeAuth(err)])
    } finally { setBusy(null) }
  }

  const social = (cual, fn) => correr(cual, async () => { await fn(); onListo?.() })

  const entrar = () => correr('correo', async () => {
    if (!form.email.trim() || !form.password) { setErrores(['Escribe tu correo y tu contraseña.']); return }
    await entrarConCorreo(form.email, form.password)
    onListo?.()
  })

  const crear = () => correr('correo', async () => {
    const e = erroresRegistro(form)
    if (e.length) { setErrores(e); return }
    await crearCuentaCorreo(form)
    onListo?.({ nueva: true, email: form.email.trim().toLowerCase() })
  })

  const olvide = () => correr('olvide', async () => {
    if (!form.email.trim()) { setErrores(['Escribe tu correo arriba y vuelve a tocar «Olvidé mi contraseña».']); return }
    await recuperarContrasena(form.email)
    setAviso(`Te enviamos a ${form.email.trim()} un enlace para crear una contraseña nueva. Revisa también el correo no deseado.`)
  })

  // Botón blanco con el logo a la izquierda (guías de marca de Google, Microsoft y Apple).
  const botonMarca = 'w-full inline-flex items-center justify-center gap-3 bg-white text-coal font-body font-semibold text-sm px-5 py-3 rounded-full border border-coal/20 shadow-sm hover:bg-smoked/40 active:scale-[0.98] transition disabled:opacity-60'
  const campo = 'w-full bg-white border border-coal/15 rounded-xl px-3 py-2.5 font-body text-sm text-coal focus:outline-none focus:border-cherry'

  // Se dibuja en <body>: dentro de una tarjeta con animación (transform) el
  // "fixed" quedaría encerrado en la tarjeta y la ventana saldría detrás.
  return createPortal(
    <div className="fixed inset-0 z-[150] bg-coal/60 backdrop-blur-sm flex items-end sm:items-center justify-center p-3 animate-fade-in">
      <div className="bg-cream w-full max-w-sm rounded-3xl shadow-2xl p-5 flex flex-col gap-3 max-h-[92dvh] overflow-y-auto">
        <div className="flex items-center justify-between">
          <p className="font-display text-xl tracking-wide text-coal">{titulo}</p>
          {onCerrar && (
            <button onClick={onCerrar} className="btn-icon" aria-label="Cerrar"><X size={18} /></button>
          )}
        </div>

        <button onClick={() => social('google', loginGoogle)} disabled={!!busy} className={botonMarca}>
          <LogoGoogle />
          {busy === 'google' ? 'Conectando…' : 'Continuar con Google'}
        </button>
        <button onClick={() => social('apple', loginApple)} disabled={!!busy} className={botonMarca}>
          <LogoApple />
          {busy === 'apple' ? 'Conectando…' : 'Continuar con Apple'}
        </button>
        <button onClick={() => social('microsoft', loginMicrosoft)} disabled={!!busy} className={botonMarca}>
          <LogoMicrosoft />
          {busy === 'microsoft' ? 'Conectando…' : 'Continuar con Microsoft'}
        </button>

        <div className="flex items-center gap-3 my-1">
          <div className="flex-1 h-px bg-coal/10" />
          <span className="font-body text-[11px] text-coal/45 uppercase tracking-wider">o con tu correo</span>
          <div className="flex-1 h-px bg-coal/10" />
        </div>

        <div className="grid grid-cols-2 bg-smoked/60 rounded-xl p-1">
          {[['entrar', 'Ya tengo cuenta'], ['crear', 'Crear cuenta']].map(([id, texto]) => (
            <button key={id} onClick={() => { setModo(id); setErrores([]); setAviso('') }}
              className={`py-2 rounded-lg font-body text-xs font-semibold ${modo === id ? 'bg-cream text-cherry shadow-sm' : 'text-coal/60'}`}>
              {texto}
            </button>
          ))}
        </div>

        <form className="flex flex-col gap-2" onSubmit={(e) => { e.preventDefault(); modo === 'crear' ? crear() : entrar() }}>
          {modo === 'crear' && (
            <>
              <input className={campo} placeholder="Nombre completo" autoComplete="name"
                value={form.nombre} onChange={(e) => set('nombre', e.target.value)} />
              <input className={campo} placeholder="Teléfono / WhatsApp" autoComplete="tel" inputMode="tel"
                value={form.telefono} onChange={(e) => set('telefono', e.target.value)} />
            </>
          )}
          <input className={campo} placeholder="Correo" type="email" autoComplete="email"
            value={form.email} onChange={(e) => set('email', e.target.value)} />
          <div className="relative">
            <input className={`${campo} pr-10`} placeholder="Contraseña" type={verClave ? 'text' : 'password'}
              autoComplete={modo === 'crear' ? 'new-password' : 'current-password'}
              value={form.password} onChange={(e) => set('password', e.target.value)} />
            <button type="button" onClick={() => setVerClave((v) => !v)}
              className="absolute right-2 top-1/2 -translate-y-1/2 p-1 text-coal/50" aria-label={verClave ? 'Ocultar contraseña' : 'Mostrar contraseña'}>
              {verClave ? <EyeOff size={16} /> : <Eye size={16} />}
            </button>
          </div>
          <button type="submit" disabled={!!busy} className="btn-primary w-full mt-1">
            <Mail size={16} />
            {busy === 'correo' ? 'Un momento…' : modo === 'crear' ? 'Crear cuenta' : 'Entrar'}
          </button>
          {modo === 'crear' && (
            <p className="font-body text-[11px] text-coal/55 text-center">
              Te enviaremos un enlace para confirmar tu correo antes de tu primer pedido.
            </p>
          )}
          {modo === 'entrar' && (
            <button type="button" onClick={olvide} disabled={!!busy}
              className="font-body text-xs text-cherry underline underline-offset-2 self-center mt-1">
              {busy === 'olvide' ? 'Enviando…' : 'Olvidé mi contraseña'}
            </button>
          )}
        </form>

        {errores.map((e) => <p key={e} className="font-body text-xs text-pepper">{e}</p>)}
        {aviso && <p className="font-body text-xs text-mint font-semibold">{aviso}</p>}
      </div>
    </div>,
    document.body,
  )
}
