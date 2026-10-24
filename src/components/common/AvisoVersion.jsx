import { Sparkles } from 'lucide-react'
import { useEffect, useState } from 'react'

// Aviso de versión nueva. Una pestaña abierta (o la app instalada) sigue con el
// código viejo hasta que se recarga: la caja podía trabajar horas sin los
// cambios publicados. Cada build escribe su id en version.json (vite.config.js);
// aquí se compara con el id con el que se cargó la página y, si cambió, se
// ofrece recargar. No recarga solo: podría cortar un pedido a medio escribir.
const ACTUAL = import.meta.env.VITE_BUILD_ID
const CADA_MS = 3 * 60 * 1000

export default function AvisoVersion() {
  const [nueva, setNueva] = useState(false)

  useEffect(() => {
    if (!ACTUAL || import.meta.env.DEV) return
    let vivo = true
    const revisar = async () => {
      try {
        const r = await fetch(`${import.meta.env.BASE_URL}version.json?t=${Date.now()}`, { cache: 'no-store' })
        if (!r.ok) return
        const { build } = await r.json()
        if (vivo && build && build !== ACTUAL) setNueva(true)
      } catch { /* sin red: se revisa en la próxima vuelta */ }
    }
    const alVolver = () => { if (document.visibilityState === 'visible') revisar() }
    const id = setInterval(revisar, CADA_MS)
    document.addEventListener('visibilitychange', alVolver)
    window.addEventListener('online', revisar)
    revisar()
    return () => {
      vivo = false
      clearInterval(id)
      document.removeEventListener('visibilitychange', alVolver)
      window.removeEventListener('online', revisar)
    }
  }, [])

  if (!nueva) return null
  return (
    <div className="fixed top-0 left-0 right-0 z-[199] bg-mustard text-coal flex items-center justify-center gap-3 py-2 px-4 text-sm font-body font-semibold shadow-md">
      <Sparkles size={16} className="flex-shrink-0" aria-hidden="true" />
      <span>Hay una versión nueva de DeliStars</span>
      <button
        onClick={() => window.location.reload()}
        className="btn btn-sm bg-coal text-cream text-xs px-4"
      >
        Actualizar
      </button>
    </div>
  )
}
