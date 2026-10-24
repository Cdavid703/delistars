import { Bike } from 'lucide-react'
import useTurnosDomiciliarios, { TEXTO_TURNO } from '../../hooks/useTurnosDomiciliarios'

// Quién está en turno (Fase 5). Los domicilios que la caja confirma se le
// asignan solos a quien esté en turno; si no hay nadie, quedan para asignar a mano.
const COLOR = { activo: 'bg-mint/15 text-mint border-mint/40', pausa: 'bg-mustard/20 text-coal border-mustard/50', fuera: 'bg-coal/5 text-coal/60 border-coal/15' }

export default function EstadoDomiciliarios({ sedeId }) {
  const turnos = useTurnosDomiciliarios(sedeId)
  const lista = Object.entries(turnos)
  const nadie = !lista.some(([, t]) => t.estado === 'activo')
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      <Bike size={14} className="text-coal/50 flex-shrink-0" aria-hidden="true" />
      {lista.map(([email, t]) => (
        <span key={email} className={`font-body text-xs font-semibold px-2.5 py-1 rounded-full border ${COLOR[t.estado] || COLOR.fuera}`}>
          {t.nombre.split(' ')[0]} · {TEXTO_TURNO[t.estado] || 'Fuera de turno'}
        </span>
      ))}
      {nadie && (
        <span className="font-body text-xs text-tangelo">
          {lista.length ? 'Nadie en turno: ' : 'Ningún domiciliario ha iniciado turno: '}los domicilios quedan para asignar a mano.
        </span>
      )}
    </div>
  )
}
