import { useState, useEffect } from 'react'
import { Volume2, VolumeX } from 'lucide-react'
import { estaSilenciado, setSilenciado, audioListo, despertarAudio, sonar } from '../../utils/sonidos'

// Silenciar / activar los avisos, y de paso arreglar el caso que más duele:
// que el navegador tenga el audio bloqueado y la persona no se entere.
//
// Tres estados posibles:
//   · Bloqueado por el navegador → aviso rojo llamativo, hay que tocar para
//     desbloquear. Es el que hizo que la caja se perdiera pedidos.
//   · Silenciado por la persona  → lo apagó a propósito.
//   · Sonando                    → todo bien; al tocarlo suena de prueba.
export default function BotonSilencio({ className = '' }) {
  const [silenciado, setSil] = useState(estaSilenciado)
  const [listo, setListo]    = useState(audioListo)

  // El navegador puede suspender el audio en cualquier momento (pantalla
  // bloqueada, pestaña al fondo) sin avisarle a la aplicación, así que se
  // revisa cada 2 s en vez de confiar en un evento.
  useEffect(() => {
    const id = setInterval(() => setListo(audioListo()), 2000)
    return () => clearInterval(id)
  }, [])

  const alternar = async () => {
    if (!silenciado && !listo) {
      // Está bloqueado: el toque cuenta como gesto y lo desbloquea.
      await despertarAudio()
      setListo(audioListo())
      sonar('aceptado')
      return
    }
    const nuevo = !silenciado
    setSilenciado(nuevo)
    setSil(nuevo)
    if (!nuevo) { await despertarAudio(); setListo(audioListo()); sonar('aceptado') }
  }

  const bloqueado = !silenciado && !listo

  return (
    <button
      onClick={alternar}
      title={
        bloqueado ? 'El navegador tiene el sonido bloqueado — toca para activarlo'
        : silenciado ? 'Los avisos están en silencio — toca para activarlos'
        : 'Avisos activos — toca para probar o silenciar'
      }
      className={`flex items-center gap-1.5 rounded-full px-2.5 py-1.5 text-xs font-semibold font-body transition-colors ${
        bloqueado ? 'bg-pepper/15 text-pepper animate-pulse'
        : silenciado ? 'bg-coal/10 text-coal/50'
        : 'bg-mint/15 text-mint'
      } ${className}`}
    >
      {bloqueado || silenciado ? <VolumeX size={13} /> : <Volume2 size={13} />}
      <span className="hidden sm:inline">
        {bloqueado ? 'Activar sonido' : silenciado ? 'Silenciado' : 'Sonido'}
      </span>
    </button>
  )
}
