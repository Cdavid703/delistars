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
export default function BotonSilencio({ className = '', oscuro = false }) {
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

  // Bloqueado es un aviso, no un interruptor: se muestra con palabras para que
  // nadie tenga que adivinar qué significa el icono. Los otros dos estados son
  // un botón de icono más, del mismo tamaño que los vecinos del encabezado.
  if (bloqueado) {
    return (
      <button
        onClick={alternar}
        title="El navegador tiene el sonido bloqueado — toca para activarlo"
        className={`btn btn-sm gap-1.5 rounded-full bg-pepper text-cream font-semibold ${className}`}
      >
        <VolumeX size={14} aria-hidden="true" />
        Sonido
      </button>
    )
  }

  return (
    <button
      onClick={alternar}
      title={silenciado ? 'Los avisos están en silencio — toca para activarlos' : 'Avisos activos — toca para probar o silenciar'}
      aria-label={silenciado ? 'Activar los avisos' : 'Silenciar los avisos'}
      className={`btn-icon ${
        oscuro ? `text-cream hover:bg-cream/10 ${silenciado ? 'opacity-60' : ''}`
        : silenciado ? 'text-coal/40 hover:bg-coal/5' : 'text-mint hover:bg-mint/10'
      } ${className}`}
    >
      {silenciado ? <VolumeX size={18} aria-hidden="true" /> : <Volume2 size={18} aria-hidden="true" />}
    </button>
  )
}
