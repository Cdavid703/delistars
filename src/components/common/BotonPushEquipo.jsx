import { useState, useEffect } from 'react'
import { Bell, BellOff, BellRing } from 'lucide-react'
import { enableStaffPush, pushPermission } from '../../services/firebase'

// Activa las notificaciones al celular para cajeros y domiciliarios.
//
// El sonido solo existe con el panel abierto. Esto es lo otro: que le llegue al
// teléfono aunque tenga la app cerrada — a la caja cuando entra un pedido, y al
// domiciliario cuando le asignan uno estando en la calle con el celular
// bloqueado.
//
// El permiso lo tiene que dar la persona en su teléfono, y solo se puede pedir
// con un toque suyo: por eso es un botón y no algo automático.
export default function BotonPushEquipo({ email, rol, sedeId, className = '' }) {
  const [estado, setEstado]   = useState(pushPermission)   // default | granted | denied | unsupported
  const [activando, setActivando] = useState(false)
  const [listo, setListo]     = useState(false)

  useEffect(() => {
    // Si ya dio permiso antes, se re-registra el token en silencio: los tokens
    // caducan y cambian al reinstalar o limpiar datos del navegador.
    if (pushPermission() !== 'granted' || !email) return
    let vivo = true
    enableStaffPush(email, { rol, sedeId }).then(r => { if (vivo) setListo(!!r.ok) })
    return () => { vivo = false }
  }, [email, rol, sedeId])

  const activar = async () => {
    setActivando(true)
    const r = await enableStaffPush(email, { rol, sedeId })
    setEstado(pushPermission())
    setListo(!!r.ok)
    setActivando(false)
  }

  if (estado === 'unsupported') return null

  // Ya activo: se muestra discreto, solo para saber que está andando.
  if (estado === 'granted' && listo) {
    return (
      <span className={`flex items-center gap-1.5 rounded-full px-2.5 py-1.5 text-xs font-semibold font-body bg-mint/15 text-mint ${className}`}
        title="Te van a llegar avisos al celular aunque cierres la aplicación">
        <BellRing size={13} />
        <span className="hidden sm:inline">Avisos al celular</span>
      </span>
    )
  }

  if (estado === 'denied') {
    return (
      <span className={`flex items-center gap-1.5 rounded-full px-2.5 py-1.5 text-xs font-semibold font-body bg-coal/10 text-coal/50 ${className}`}
        title="Bloqueaste las notificaciones. Actívalas desde los ajustes del navegador para este sitio.">
        <BellOff size={13} />
        <span className="hidden sm:inline">Avisos bloqueados</span>
      </span>
    )
  }

  return (
    <button
      onClick={activar}
      disabled={activando}
      title="Recibe los avisos en el celular aunque tengas la aplicación cerrada"
      className={`flex items-center gap-1.5 rounded-full px-2.5 py-1.5 text-xs font-semibold font-body bg-tangelo/15 text-tangelo hover:bg-tangelo/25 transition-colors ${className}`}
    >
      <Bell size={13} />
      <span className="hidden sm:inline">{activando ? 'Activando…' : 'Activar avisos'}</span>
    </button>
  )
}
