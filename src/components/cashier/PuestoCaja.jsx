import { Volume2, VolumeX } from 'lucide-react'

// Franja del aparato principal de la caja (Fase 6). Ver hooks/usePuestoCaja.js.
export default function PuestoCaja({ puesto }) {
  if (!puesto?.disponible || puesto.cargando) return null
  const { esPrincipal, principalActivo, principalNombre, hayPrincipal, hacerPrincipal } = puesto
  if (esPrincipal) {
    return (
      <div className="mx-4 mt-2 flex items-center gap-2 font-body text-xs text-mint">
        <Volume2 size={14} /> Este aparato es el principal: aquí suenan los pedidos nuevos.
      </div>
    )
  }
  if (principalActivo) {
    return (
      <div className="mx-4 mt-2 flex items-center justify-between gap-2 font-body text-xs text-coal/55">
        <span className="flex items-center gap-2"><VolumeX size={14} /> Suena el aparato principal ({principalNombre}). Aquí solo ves los avisos.</span>
        <button onClick={hacerPrincipal} className="underline underline-offset-2 whitespace-nowrap">Usar este</button>
      </div>
    )
  }
  return (
    <div className="mx-4 mt-2 bg-tangelo/15 border border-tangelo/50 rounded-2xl px-4 py-3 flex items-center justify-between gap-3">
      <p className="font-body text-xs text-coal leading-snug">
        {hayPrincipal
          ? <>🔔 El aparato principal ({principalNombre}) se desconectó. Mientras tanto suenan todos.</>
          : <>🔔 Elige un aparato principal: solo ese sonará con los pedidos nuevos. Mientras tanto suenan todos.</>}
      </p>
      <button onClick={hacerPrincipal} className="btn-primary btn-sm whitespace-nowrap">Usar este como principal</button>
    </div>
  )
}
