import { useState } from 'react'
import { ArrowLeftRight, Check } from 'lucide-react'
import { useAuth } from '../../contexts/AuthContext'

// «Cambiar de empleado» (especificación §6.3): en un aparato compartido, quien
// toma el puesto entra con SU cuenta de Google y la sesión anterior se cierra
// en este aparato. El aparato sigue en su sede (y en la caja, si es el
// principal o el que imprime). Si cancelan la ventana de Google, no cambia nada.

/**
 * Botón. `antes()` (sin esperar) corre al tocar (ej. cerrar el pedido abierto
 * para que no quede tomado a nombre de quien se va). `variante`: 'icono'
 * (encabezado de la caja) o 'menu' (menú del domiciliario).
 */
export function BotonCambiarEmpleado({ antes, variante = 'icono', className = '' }) {
  const { cambiarDeEmpleado } = useAuth()
  const [ocupado, setOcupado] = useState(false)
  const cambiar = async () => {
    setOcupado(true)
    try {
      // Sin esperas antes de abrir Google: Safari (iPad) bloquea la ventana si
      // no se abre en el mismo toque. `antes` va sin await.
      antes?.()
      const r = await cambiarDeEmpleado()
      if (r.mismo) window.alert('Elegiste la misma cuenta: sigues tú.')
    } catch (err) {
      window.alert(err?.code === 'auth/popup-blocked'
        ? 'El navegador bloqueó la ventana de Google. Permite ventanas emergentes para este sitio e intenta de nuevo.'
        : 'No se pudo cambiar de empleado. Revisa la conexión e intenta de nuevo.')
    } finally { setOcupado(false) }
  }
  if (variante === 'menu') {
    return (
      <button onClick={cambiar} disabled={ocupado} className={className}>
        <ArrowLeftRight size={16} aria-hidden="true" /> {ocupado ? 'Esperando a Google…' : 'Cambiar de empleado'}
      </button>
    )
  }
  return (
    <button onClick={cambiar} disabled={ocupado} title="Cambiar de empleado: entra otra persona con su cuenta"
      className={`btn-icon flex items-center gap-1 px-2 w-auto min-w-11 ${className}`}>
      <ArrowLeftRight size={20} aria-hidden="true" />
      <span className="font-body text-xs font-semibold hidden xl:inline">{ocupado ? 'Esperando…' : 'Cambiar empleado'}</span>
    </button>
  )
}

/** Aviso de unos segundos: «Ahora está Laura en este aparato». */
export function AvisoCambioEmpleado() {
  const { avisoCambio } = useAuth()
  if (!avisoCambio) return null
  return (
    <div role="status" className="fixed top-3 left-1/2 -translate-x-1/2 z-[210] bg-mint text-cream rounded-full shadow-xl px-4 py-2 font-body text-sm font-semibold flex items-center gap-2 animate-fade-in">
      <Check size={16} aria-hidden="true" /> Ahora está {avisoCambio} en este aparato
    </div>
  )
}
