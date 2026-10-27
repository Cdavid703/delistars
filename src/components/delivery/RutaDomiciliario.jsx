import { createPortal } from 'react-dom'
import {
  Banknote, Route, CheckCircle, MessageSquare, Menu, BookOpen, Calculator,
  Store, LogOut, X, ChevronRight, AlertTriangle,
} from 'lucide-react'
import { LogoGoogleMaps, LogoWaze } from '../common/LogosApps'
import RoleSwitcher from '../common/RoleSwitcher'
import BotonSilencio from '../common/BotonSilencio'
import BotonPushEquipo from '../common/BotonPushEquipo'
import { BotonCambiarEmpleado } from '../common/CambiarEmpleado'
import { BotonMisSesiones } from '../common/MisSesiones'
import { SEDES } from '../../services/roles'
import { cobroDe, fmt, nombreDe, ultimoDeCaja, urlNavegacion } from '../../utils/reparto'

// Piezas del panel del domiciliario (25 oct 2026): navegar, cobro, barra
// inferior (Mi ruta, Entregados, Caja y Más), «Más» y las notas de la caja.
// «Por recoger» y «En reparto» viven en AhoraDomiciliario.jsx (26 oct 2026).

const abrirNavegacion = (app, coords, texto) => window.open(urlNavegacion(app, coords, texto), '_blank')

export function BotonesNavegar({ coords, texto, oscuro = false, alto = 'min-h-[48px]' }) {
  const clase = `${alto} rounded-2xl font-body text-sm font-bold flex items-center justify-center gap-2 ${
    oscuro ? 'bg-white text-coal' : 'bg-white border border-coal/15 text-coal'}`
  return (
    <div className="grid grid-cols-2 gap-2">
      <button onClick={() => abrirNavegacion('maps', coords, texto)} className={clase}><LogoGoogleMaps size={20} /> Maps</button>
      <button onClick={() => abrirNavegacion('waze', coords, texto)} className={clase}><LogoWaze size={20} /> Waze</button>
    </div>
  )
}

/** Tarjeta de cobro: qué cobrar y, en efectivo, con qué paga y el cambio. */
export function TarjetaCobro({ order, grande = false }) {
  const c = cobroDe(order)
  if (!c.efectivo) {
    return (
      <div className={`rounded-2xl px-4 py-3 flex items-center gap-2.5 ${c.pendiente ? 'bg-mustard/20 text-coal' : 'bg-mint/[0.14] text-[#0E5E55]'}`}>
        {c.pendiente ? <AlertTriangle size={20} aria-hidden="true" /> : <CheckCircle size={20} aria-hidden="true" />}
        <p className="font-body text-sm font-bold flex-1">
          {c.pendiente ? 'Transferencia por verificar: no entregues hasta que la caja confirme' : `Ya pagó (${order.payment}): no cobres nada`}
        </p>
      </div>
    )
  }
  return (
    <div className="rounded-2xl bg-mustard text-coal px-4 py-3 flex flex-col gap-2">
      <div className="flex items-center gap-2.5">
        <Banknote size={22} aria-hidden="true" className="flex-shrink-0" />
        <div className="flex-1 min-w-0">
          <p className="font-body text-xs font-bold tracking-wide uppercase">Cobrar en efectivo{c.mixto ? ' (pago mixto)' : ''}</p>
          {!grande && (
            <p className="font-body text-xs">{c.exacto ? 'Paga exacto: no necesita cambio' : `Paga con ${fmt(c.billete)} · lleva ${fmt(c.cambio)} de cambio`}</p>
          )}
        </div>
        <span className={`font-display leading-none ${grande ? 'text-[34px]' : 'text-[28px]'}`}>{fmt(c.monto)}</span>
      </div>
      {grande && (c.exacto ? (
        <p className="font-body text-sm font-semibold">Paga exacto: no necesita cambio</p>
      ) : (
        <div className="flex gap-2">
          <span className="flex-1 rounded-xl bg-white/40 px-3 py-2 font-body text-xs"><b className="block">Te paga con</b>{fmt(c.billete)}</span>
          <span className="flex-1 rounded-xl bg-coal text-cream px-3 py-2 font-body text-xs"><b className="block">Lleva de cambio</b>{fmt(c.cambio)}</span>
        </div>
      ))}
    </div>
  )
}

const ICONOS_NAV = { ruta: Route, entregados: CheckCircle, caja: MessageSquare, mas: Menu }

/** Barra inferior. `cuentas`: { ruta, caja }. */
export function NavDomiciliario({ vista, setVista, cuentas = {} }) {
  const items = [
    ['ruta', 'Mi ruta'], ['entregados', 'Entregados'], ['caja', 'Caja'], ['mas', 'Más'],
  ]
  return (
    <nav aria-label="Domiciliario"
      className="fixed bottom-0 inset-x-0 z-[60] bg-white border-t border-coal/10 grid grid-cols-4 px-2 pt-1"
      style={{ paddingBottom: 'max(env(safe-area-inset-bottom), 8px)' }}>
      {items.map(([id, titulo]) => {
        const Icono = ICONOS_NAV[id]
        const activo = vista === id
        const n = cuentas[id] || 0
        return (
          <button key={id} onClick={() => setVista(id)} aria-current={activo ? 'page' : undefined}
            className={`relative min-h-[58px] flex flex-col items-center justify-center gap-1 font-body text-[11px] font-bold ${activo ? 'text-[#C8261D]' : 'text-coal/60'}`}>
            <Icono size={22} aria-hidden="true" />
            {titulo}
            {n > 0 && (
              <span className="absolute top-1.5 right-[22%] min-w-[18px] h-[18px] px-1 rounded-full bg-[#C8261D] text-white text-[10px] flex items-center justify-center">{n > 9 ? '9+' : n}</span>
            )}
          </button>
        )
      })}
    </nav>
  )
}

/** «Más»: lo que se usa poco. Queda abierta mientras sale «Mis sesiones». */
export function HojaMas({ user, sede, allRoles = [], onCerrar, onManual, onCuadre, onCambiarSede, onVolverSede, logout }) {
  const fila = 'min-h-[56px] w-full flex items-center gap-3.5 px-4 text-left font-body text-[15px] font-semibold text-coal'
  return createPortal(
    <div className="fixed inset-0 z-[105] bg-coal/50 flex items-end sm:items-center justify-center animate-fade-in"
      onClick={(e) => { if (e.target === e.currentTarget) onCerrar() }}>
      <div className="bg-cream w-full max-w-lg rounded-t-[28px] sm:rounded-[28px] max-h-[88dvh] overflow-y-auto px-4 pt-4 animate-sheet-up flex flex-col gap-3"
        style={{ paddingBottom: 'max(env(safe-area-inset-bottom), 20px)' }}>
        <div className="flex items-center justify-between px-1">
          <div>
            <p className="font-display text-4xl tracking-wide text-coal leading-none normal-case">Más</p>
            <p className="font-body text-xs text-coal/60 mt-1">
              {[user?.displayName || user?.email, sede && (sede.id === 'all' ? 'Ambas sedes' : sede.name)].filter(Boolean).join(' · ')}
            </p>
          </div>
          <button onClick={onCerrar} className="btn-icon" aria-label="Cerrar"><X size={20} aria-hidden="true" /></button>
        </div>

        <section className="grid grid-cols-2 gap-2">
          {Object.values(SEDES).map((s) => (
            <button key={s.id} onClick={() => { onCerrar(); onVolverSede(s.id) }}
              className="min-h-[64px] rounded-2xl bg-white border border-coal/10 px-3 flex flex-col items-start justify-center gap-0.5 text-left">
              <span className="font-body text-[11px] font-bold text-coal/55 uppercase tracking-wide">Volver a</span>
              <span className="font-body text-sm font-bold text-coal">{s.name}</span>
            </button>
          ))}
        </section>

        <section className="bg-white rounded-2xl border border-coal/10 overflow-hidden divide-y divide-coal/10">
          <button onClick={() => { onCerrar(); onCuadre() }} className={fila}><Calculator size={20} className="text-[#C8261D]" aria-hidden="true" /> Cuadre de turno</button>
          <button onClick={() => { onCerrar(); onManual() }} className={fila}><BookOpen size={20} className="text-[#C8261D]" aria-hidden="true" /> Manual del domiciliario</button>
          <button onClick={() => { onCerrar(); onCambiarSede() }} className={fila}>
            <Store size={20} className="text-[#C8261D]" aria-hidden="true" />
            <span className="flex-1">Cambiar de sede</span>
            <ChevronRight size={18} className="text-coal/40" aria-hidden="true" />
          </button>
          <div className={fila}>
            <span className="flex-1">Sonido y avisos al celular</span>
            <BotonSilencio />
            <BotonPushEquipo email={user?.email} rol="driver" sedeId={sede?.id} />
          </div>
          {allRoles.length > 1 && (
            <div className={fila}>
              <span className="flex-1">Ver como</span>
              <RoleSwitcher />
            </div>
          )}
          <BotonMisSesiones variante="menu" className={`${fila} [&>svg]:w-5 [&>svg]:h-5 [&>svg]:text-[#C8261D]`} />
          <BotonCambiarEmpleado variante="menu" className={`${fila} [&>svg]:w-5 [&>svg]:h-5 [&>svg]:text-[#C8261D]`} antes={onCerrar} />
        </section>

        <button onClick={logout} className="btn-secondary w-full rounded-2xl">
          <LogOut size={18} aria-hidden="true" /> Cerrar sesión
        </button>
      </div>
    </div>,
    document.body,
  )
}

/** «Caja»: las notas con la caja de todos sus pedidos, lo más nuevo arriba. */
export function VistaCaja({ pedidos, vistos, onAbrir }) {
  const conNotas = pedidos
    .filter((o) => o.comments?.length)
    .map((o) => {
      const ultimo = [...o.comments].sort((a, b) => (b.ts || 0) - (a.ts || 0))[0]
      return { o, ultimo, nuevo: ultimoDeCaja(o) > (vistos[o.id] || 0) }
    })
    .sort((a, b) => (b.ultimo.ts || 0) - (a.ultimo.ts || 0))
  if (!conNotas.length) {
    return (
      <div className="flex flex-col items-center gap-3 py-16 px-6 text-center">
        <MessageSquare size={32} className="text-coal/25" aria-hidden="true" />
        <p className="font-body text-coal/50">Aquí llegan las notas de la caja sobre tus pedidos. Para escribirle, abre el pedido.</p>
      </div>
    )
  }
  return (
    <div className="mx-4 mt-1 bg-white rounded-[18px] border border-coal/10 overflow-hidden divide-y divide-coal/[0.08]">
      {conNotas.map(({ o, ultimo, nuevo }) => (
        <button key={o.id} onClick={() => onAbrir(o)} className="w-full text-left px-4 py-3 flex items-center gap-3 min-h-[64px]">
          <span className="flex-1 min-w-0">
            <span className="flex items-center gap-1.5">
              {o.orderNumber && <span className="font-display text-lg leading-none text-[#C8261D]">#{o.orderNumber}</span>}
              <span className="font-body text-sm font-bold truncate">{nombreDe(o)}</span>
            </span>
            <span className={`block font-body text-xs truncate mt-0.5 ${nuevo ? 'text-coal font-semibold' : 'text-coal/60'}`}>
              {ultimo.role === 'cashier' ? 'Caja' : 'Tú'}: «{ultimo.text}»
            </span>
          </span>
          <span className="flex flex-col items-end gap-1 flex-shrink-0">
            <span className="font-body text-[11px] text-coal/50">{ultimo.ts ? new Date(ultimo.ts).toLocaleTimeString('es-CO', { hour: 'numeric', minute: '2-digit' }) : ''}</span>
            {nuevo && <span className="w-2.5 h-2.5 rounded-full bg-[#C8261D]" aria-label="Nuevo" />}
          </span>
        </button>
      ))}
    </div>
  )
}
