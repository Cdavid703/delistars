import { useEffect, useState } from 'react'

// Aviso de versión nueva (igual que en domicilios, src/components/common/
// AvisoVersion.jsx). Una pestaña abierta sigue con el código viejo hasta que se
// recarga; cada build escribe su id en version.json (vite.config.ts) y aquí se
// compara con el id con el que se cargó el panel. No recarga solo: podría cortar
// algo a medio editar (un horario, un producto, una campaña).
const ACTUAL = import.meta.env.VITE_BUILD_ID as string | undefined
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
        const { build } = (await r.json()) as { build?: string }
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
    <div className="fixed top-0 left-0 right-0 z-[100] bg-mustard text-coal flex items-center justify-center gap-3 py-2 px-4 text-sm font-semibold shadow-md">
      <span>✨ Hay una versión nueva del panel</span>
      <button
        onClick={() => window.location.reload()}
        className="bg-coal text-cream rounded-full px-4 py-1 text-xs font-semibold hover:opacity-90"
      >
        Actualizar
      </button>
    </div>
  )
}
