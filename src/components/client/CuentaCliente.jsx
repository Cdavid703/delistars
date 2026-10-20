import { useState } from 'react'
import { doc, setDoc } from 'firebase/firestore'
import { updateProfile } from 'firebase/auth'
import { MailCheck } from 'lucide-react'
import { db, auth, reenviarVerificacion, correoVerificado } from '../../services/firebase'
import { mensajeAuth } from '../../utils/erroresAuth'

// Piezas de la cuenta del cliente (especificación §6.1, Fase 4).

/**
 * Cuenta creada con correo y contraseña que aún no confirmó el correo: no puede
 * enviar su primer pedido. El carrito y el borrador se conservan mientras tanto.
 */
export function AvisoVerificarCorreo({ email, onVerificado, className = '' }) {
  const [busy, setBusy] = useState(null)
  const [msg, setMsg] = useState('')
  const reenviar = async () => {
    setBusy('reenviar'); setMsg('')
    try { await reenviarVerificacion(); setMsg(`Te enviamos otro enlace a ${email}.`) }
    catch (err) { setMsg(mensajeAuth(err)) }
    finally { setBusy(null) }
  }
  const yaConfirme = async () => {
    setBusy('ya'); setMsg('')
    try {
      if (await correoVerificado()) onVerificado?.()
      else setMsg('Todavía no aparece confirmado. Abre el enlace del correo y vuelve a tocar aquí.')
    } catch (err) { setMsg(mensajeAuth(err)) }
    finally { setBusy(null) }
  }
  return (
    <div className={`bg-mustard/15 border-2 border-mustard rounded-2xl p-4 ${className}`}>
      <p className="font-display text-base tracking-wide text-coal flex items-center gap-2">
        <MailCheck size={18} /> Confirma tu correo para pedir
      </p>
      <p className="font-body text-xs text-coal/75 mt-1.5 leading-relaxed">
        Te enviamos un enlace a <strong>{email}</strong>. Ábrelo y vuelve aquí: tu pedido se conserva.
        Revisa también el correo no deseado.
      </p>
      <div className="flex gap-2 mt-3">
        <button onClick={yaConfirme} disabled={!!busy} className="btn-primary flex-1 text-sm">
          {busy === 'ya' ? 'Revisando…' : 'Ya lo confirmé'}
        </button>
        <button onClick={reenviar} disabled={!!busy} className="btn-secondary flex-1 text-sm">
          {busy === 'reenviar' ? 'Enviando…' : 'Reenviar enlace'}
        </button>
      </div>
      {msg && <p className="font-body text-xs text-coal/70 mt-2">{msg}</p>}
    </div>
  )
}

/**
 * Al entrar con Google o Microsoft se pide SOLO lo que falte (nombre y/o
 * teléfono), sin repetir lo que ya se sabe (especificación §6.1).
 */
export function CompletarPerfil({ user, perfil, onListo }) {
  const faltaNombre = !(perfil?.name || user?.displayName)
  const faltaTelefono = String(perfil?.phone || '').replace(/\D/g, '').length < 10
  const [nombre, setNombre] = useState(perfil?.name || user?.displayName || '')
  const [telefono, setTelefono] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  if (!faltaNombre && !faltaTelefono) return null

  const guardar = async (e) => {
    e.preventDefault()
    if (faltaNombre && nombre.trim().length < 3) { setError('Escribe tu nombre completo.'); return }
    const tel = telefono.replace(/\D/g, '')
    if (faltaTelefono && tel.length < 10) { setError('El teléfono debe tener 10 dígitos.'); return }
    setBusy(true); setError('')
    try {
      await setDoc(doc(db, 'customers', user.uid), {
        uid: user.uid,
        ...(faltaNombre ? { name: nombre.trim() } : {}),
        ...(faltaTelefono ? { phone: tel.slice(-10) } : {}),
        ...(user.email ? { email: user.email } : {}),
      }, { merge: true })
      if (faltaNombre && auth.currentUser) await updateProfile(auth.currentUser, { displayName: nombre.trim() }).catch(() => {})
      onListo?.()
    } catch {
      setError('No se pudo guardar. Revisa tu conexión e intenta de nuevo.')
    } finally { setBusy(false) }
  }

  const campo = 'w-full bg-white border border-coal/15 rounded-xl px-3 py-2.5 font-body text-sm text-coal focus:outline-none focus:border-cherry'
  return (
    <div className="fixed inset-0 z-[150] bg-coal/60 backdrop-blur-sm flex items-end sm:items-center justify-center p-3">
      <form onSubmit={guardar} className="bg-cream w-full max-w-sm rounded-3xl shadow-2xl p-5 flex flex-col gap-3">
        <p className="font-display text-xl tracking-wide text-coal">Completa tus datos</p>
        <p className="font-body text-xs text-coal/65">
          Los necesitamos para tus pedidos. Solo te los pedimos una vez.
        </p>
        {faltaNombre && (
          <input className={campo} placeholder="Nombre completo" autoComplete="name"
            value={nombre} onChange={(e) => setNombre(e.target.value)} />
        )}
        {faltaTelefono && (
          <input className={campo} placeholder="Teléfono / WhatsApp" autoComplete="tel" inputMode="tel"
            value={telefono} onChange={(e) => setTelefono(e.target.value)} />
        )}
        <button type="submit" disabled={busy} className="btn-primary w-full">
          {busy ? 'Guardando…' : 'Guardar'}
        </button>
        {error && <p className="font-body text-xs text-pepper">{error}</p>}
      </form>
    </div>
  )
}
