import { Gift, Phone } from 'lucide-react'
import { LogoWhatsApp } from './LogosApps'
import { pagaQuienRecibe, primerNombre } from '../../utils/destinatario'

// Pedido para otra persona (§7.3) en la caja y el domiciliario: los dos
// contactos identificados, sin reemplazar un teléfono por el otro. A quien
// recibe se le avisa la llegada; a quien pidió, las dudas del pedido o del pago.

const waDe = (tel) => {
  const d = String(tel || '').replace(/\D/g, '')
  return d.length >= 10 ? `57${d.slice(-10)}` : d
}

function Contacto({ titulo, nombre, telefono, para }) {
  return (
    <div className="flex flex-col gap-1">
      <p className="font-body text-[11px] font-bold uppercase tracking-wider text-coal/45">{titulo}</p>
      <p className="font-body text-sm font-semibold text-coal">{nombre || '—'}</p>
      {para && <p className="font-body text-xs text-coal/55">{para}</p>}
      {telefono && (
        <div className="flex flex-wrap items-center gap-2 mt-0.5">
          <a href={`tel:${telefono}`} className="flex items-center gap-1.5 text-cherry font-body text-sm font-semibold">
            <Phone size={14} aria-hidden="true" /> {telefono}
          </a>
          <a href={`https://wa.me/${waDe(telefono)}`} target="_blank" rel="noreferrer"
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-[#25D366]/10 border border-[#25D366]/30 text-[#25D366] font-body text-xs font-semibold hover:bg-[#25D366]/20 transition-colors">
            <LogoWhatsApp size={15} /> WhatsApp de {primerNombre(nombre) || 'contacto'}
          </a>
        </div>
      )}
    </div>
  )
}

/** `rol`: 'caja' o 'domiciliario' (cambia a quién se le dice qué). */
export default function ContactosParaOtro({ order, rol = 'caja' }) {
  const d = order?.destinatario
  if (!d?.nombre) return null
  const quienPidio = order.name || order.clientName
  const pagaRecibe = pagaQuienRecibe(order)
  return (
    <div className="bg-mustard/10 border-2 border-mustard/40 rounded-2xl p-4 flex flex-col gap-3">
      <p className="font-display text-base tracking-wide text-coal flex items-center gap-2">
        <Gift size={17} className="text-mustard" aria-hidden="true" /> Para otra persona
      </p>
      <Contacto titulo="Lo recibe" nombre={d.nombre} telefono={d.telefono}
        para={rol === 'domiciliario' ? 'Avísale a esta persona cuando llegues.' : 'A esta persona se le entrega.'} />
      <Contacto titulo="Lo pidió" nombre={quienPidio} telefono={rol === 'caja' ? null : order.phone}
        para="Para dudas del pedido o del pago." />
      <p className={`font-body text-sm font-semibold rounded-xl px-3 py-2 ${pagaRecibe ? 'bg-cherry/10 text-cherry' : 'bg-mint/10 text-mint'}`}>
        {pagaRecibe
          ? `Paga ${primerNombre(d.nombre)}, en efectivo al recibir`
          : `Paga ${primerNombre(quienPidio) || 'quien pidió'}${order.payment ? ` por ${order.payment}` : ''}: a ${primerNombre(d.nombre)} no se le cobra`}
      </p>
    </div>
  )
}
