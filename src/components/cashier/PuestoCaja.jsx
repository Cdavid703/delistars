import { Volume2, VolumeX, Bell } from 'lucide-react'
import ChipEstado from './ChipEstado'

// Aparato principal de la caja (Fase 6): solo ese suena. Ver hooks/usePuestoCaja.js.
// Una etiqueta: verde si suena aquí, gris si suena en otro, naranja si no hay
// principal conectado (mientras tanto suenan todos, para no perder pedidos).
export default function PuestoCaja({ puesto }) {
  if (!puesto?.disponible || puesto.cargando) return null
  const { esPrincipal, principalActivo, principalNombre, hayPrincipal, hacerPrincipal } = puesto
  if (esPrincipal) {
    return <ChipEstado tono="bien" icono={Volume2} texto="Los pedidos nuevos suenan aquí" />
  }
  if (principalActivo) {
    return (
      <ChipEstado tono="neutro" icono={VolumeX} texto={`Suenan en ${principalNombre}`}
        titulo="Aquí solo ves los avisos" accion={{ texto: 'Que suene aquí', onClick: hacerPrincipal }} />
    )
  }
  return (
    <ChipEstado tono="atencion" icono={Bell}
      texto={hayPrincipal ? 'El aparato principal se desconectó' : 'Sin aparato principal'}
      titulo={`${hayPrincipal ? `El aparato principal (${principalNombre}) se desconectó. ` : ''}Mientras no haya uno conectado suenan todos. Elige uno: solo ese sonará con los pedidos nuevos.`}
      accion={{ texto: 'Usar este', onClick: hacerPrincipal }} />
  )
}
