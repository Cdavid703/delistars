import { useState } from 'react'
import { doc, setDoc } from 'firebase/firestore'
import { updateProfile } from 'firebase/auth'
import { db, auth } from '../../services/firebase'

// Piezas de la cuenta del cliente (especificación §6.1, Fase 4).

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
