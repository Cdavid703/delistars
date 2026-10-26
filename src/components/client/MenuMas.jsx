import { useState } from 'react'
import { createPortal } from 'react-dom'
import {
  UserRound, Gift, MapPin, Bell, HelpCircle, Store, Moon, Smartphone, LogOut, X,
  UtensilsCrossed, ShoppingBag, Star, MoreHorizontal,
} from 'lucide-react'
import { LogoWhatsApp, LogoInstagram, LogoFacebook, LogoTikTok } from '../common/LogosApps'
import CampanaAvisos from '../common/CampanaAvisos'
import AddressBook from './AddressBook'

// «Más» y la barra inferior del cliente (rediseño aprobado el 25 oct 2026).
// Reúne lo que antes eran íconos sueltos en el encabezado: cuenta, premios,
// direcciones, avisos, ayuda, soporte, sede, modo oscuro, instalar y salir.

const REDES = [
  { Icon: LogoInstagram, label: 'Instagram', href: 'https://www.instagram.com/delistars.med' },
  { Icon: LogoFacebook, label: 'Facebook', href: 'https://www.facebook.com/delistars.med/' },
  { Icon: LogoTikTok, label: 'TikTok', href: 'https://www.tiktok.com/@delistars.med' },
]

/** Barra inferior: Menú, Pedidos, Premios, Más. `actual`: 'pedidos' | 'mas'. */
export function NavCliente({ actual = 'pedidos', onPedidos, onPremios, onMas }) {
  const item = (activo) => `flex flex-col items-center justify-center gap-1 font-body text-[11px] font-semibold min-h-[56px] ${activo ? 'text-cherry' : 'text-coal/60'}`
  return (
    <nav aria-label="Navegación principal"
      className="fixed bottom-0 inset-x-0 z-[110] bg-white border-t border-coal/10 grid grid-cols-4 px-2 pt-1"
      style={{ paddingBottom: 'max(env(safe-area-inset-bottom), 6px)' }}>
      <a href="/" className={item(false)}><UtensilsCrossed size={22} aria-hidden="true" /> Menú</a>
      <button onClick={onPedidos} aria-current={actual === 'pedidos' ? 'page' : undefined} className={item(actual === 'pedidos')}>
        <ShoppingBag size={22} aria-hidden="true" /> Pedidos
      </button>
      <button onClick={onPremios} className={item(false)}><Star size={22} aria-hidden="true" /> Premios</button>
      <button onClick={onMas} aria-current={actual === 'mas' ? 'page' : undefined} className={item(actual === 'mas')}>
        <MoreHorizontal size={22} aria-hidden="true" /> Más
      </button>
    </nav>
  )
}

function Atajo({ onClick, href, icono, titulo, badge }) {
  const clase = 'relative min-h-[92px] rounded-2xl bg-white border border-coal/10 flex flex-col items-center justify-center gap-2 px-1.5 py-2.5 text-coal'
  const dentro = (
    <>
      {icono}
      <span className="font-body text-xs font-semibold text-center leading-tight">{titulo}</span>
      {badge > 0 && <span className="absolute top-2 right-2.5 min-w-[20px] h-5 px-1 rounded-full bg-cherry text-white font-body text-[11px] font-bold flex items-center justify-center">{badge > 9 ? '9+' : badge}</span>}
    </>
  )
  return href
    ? <a href={href} target="_blank" rel="noreferrer" className={clase}>{dentro}</a>
    : <button onClick={onClick} className={clase}>{dentro}</button>
}

function Interruptor({ activo, onChange, etiqueta }) {
  return (
    <button role="switch" aria-checked={activo} aria-label={etiqueta} onClick={() => onChange(!activo)}
      className={`relative w-[52px] h-8 rounded-full flex-shrink-0 transition-colors ${activo ? 'bg-mint' : 'bg-coal/25'}`}>
      <span className={`absolute top-1 w-6 h-6 rounded-full bg-cream shadow transition-[left] ${activo ? 'left-6' : 'left-1'}`} style={{ backgroundColor: '#FFFFFF' }} />
    </button>
  )
}

export default function MenuMas({
  user, sede, tema, setTema, onCerrar, onCuenta, onPremios, onAyuda, onCambiarSede, onSalir, onAbrirPedido,
  puedeInstalar, onInstalar,
}) {
  const [direcciones, setDirecciones] = useState(false)
  const conCuenta = !!user && !user.isAnonymous
  const icono = (Icon) => <Icon size={26} className="text-cherry" aria-hidden="true" />
  const fila = 'min-h-[60px] w-full flex items-center gap-3.5 px-4 py-2.5 text-left text-coal'

  return createPortal(
    <div className="fixed inset-0 z-[105] bg-cream overflow-y-auto animate-fade-in" style={{ paddingBottom: 96 }}>
      <div className="max-w-lg mx-auto px-4 pt-6 flex flex-col gap-4">
        <div className="flex items-end justify-between px-1">
          <h1 className="font-display text-5xl tracking-wide text-coal leading-none normal-case">Más</h1>
          <div className="flex items-center gap-2">
            {user?.displayName && <p className="font-body text-xs text-coal/60 truncate max-w-[10rem]">{user.displayName}</p>}
            <button onClick={onCerrar} className="btn-icon" aria-label="Cerrar"><X size={20} aria-hidden="true" /></button>
          </div>
        </div>

        <section className="grid grid-cols-3 gap-2.5">
          {conCuenta && <Atajo onClick={onCuenta} icono={icono(UserRound)} titulo="Mi cuenta" />}
          <Atajo onClick={onPremios} icono={icono(Gift)} titulo="Mis premios" />
          <Atajo onClick={() => setDirecciones(true)} icono={icono(MapPin)} titulo="Direcciones" />
          {conCuenta && (
            <CampanaAvisos destinos={[user.uid]} onAbrirPedido={(id) => { onCerrar(); onAbrirPedido?.(id) }}
              boton={({ abrir, pendientes }) => <Atajo onClick={abrir} icono={icono(Bell)} titulo="Avisos" badge={pendientes} />} />
          )}
          <Atajo onClick={onAyuda} icono={icono(HelpCircle)} titulo="Ayuda" />
          {sede?.whatsapp && (
            <Atajo href={`https://wa.me/${sede.whatsapp}?text=${encodeURIComponent(`Hola DeliStars ${sede.name}! Necesito ayuda.`)}`}
              icono={<LogoWhatsApp size={28} />} titulo="Soporte por WhatsApp" />
          )}
        </section>

        <section className="bg-white rounded-2xl border border-coal/10 overflow-hidden divide-y divide-coal/10">
          <button onClick={onCambiarSede} className={fila}>
            <Store size={22} className="text-cherry flex-shrink-0" aria-hidden="true" />
            <span className="flex-1 min-w-0">
              <span className="block font-body text-[15px] font-semibold">Sede</span>
              <span className="block font-body text-xs text-coal/60 truncate">{sede?.name || 'Sin elegir'}</span>
            </span>
            <span className="font-body text-sm font-semibold text-cherry">Cambiar</span>
          </button>
          <div className={fila}>
            <Moon size={22} className="text-cherry flex-shrink-0" aria-hidden="true" />
            <span className="flex-1 min-w-0">
              <span className="block font-body text-[15px] font-semibold">Modo oscuro</span>
              <span className="block font-body text-xs text-coal/60">{tema === 'oscuro' ? 'Activado en este aparato' : 'Para usarla de noche'}</span>
            </span>
            <Interruptor activo={tema === 'oscuro'} onChange={(v) => setTema(v ? 'oscuro' : 'claro')} etiqueta="Modo oscuro" />
          </div>
          {puedeInstalar && (
            <button onClick={onInstalar} className={fila}>
              <Smartphone size={22} className="text-cherry flex-shrink-0" aria-hidden="true" />
              <span className="flex-1 min-w-0">
                <span className="block font-body text-[15px] font-semibold">Instalar la app</span>
                <span className="block font-body text-xs text-coal/60">Ábrela directo desde tu pantalla de inicio</span>
              </span>
            </button>
          )}
        </section>

        <section className="flex items-center justify-between px-1">
          <p className="font-body text-sm font-semibold text-coal/60">Síguenos</p>
          <div className="flex gap-2.5">
            {REDES.map(({ Icon, label, href }) => (
              <a key={label} href={href} target="_blank" rel="noreferrer" aria-label={label}
                className="w-11 h-11 rounded-xl bg-white border border-coal/10 flex items-center justify-center">
                <Icon size={22} oscuro={tema === 'oscuro'} />
              </a>
            ))}
          </div>
        </section>

        <button onClick={onSalir} className="btn-secondary w-full rounded-2xl">
          <LogOut size={18} aria-hidden="true" /> {conCuenta ? 'Cerrar sesión' : 'Salir'}
        </button>
      </div>

      {direcciones && (
        <div className="fixed inset-0 z-[115] bg-coal/50 backdrop-blur-sm flex items-end sm:items-center justify-center"
          onClick={(e) => { if (e.target === e.currentTarget) setDirecciones(false) }}>
          <div className="bg-cream w-full max-w-lg rounded-t-3xl sm:rounded-3xl max-h-[88dvh] overflow-y-auto p-5 animate-sheet-up">
            <div className="flex items-center justify-between mb-3">
              <p className="font-display text-2xl tracking-wide text-coal normal-case">Mis direcciones</p>
              <button onClick={() => setDirecciones(false)} className="btn-icon" aria-label="Cerrar"><X size={20} aria-hidden="true" /></button>
            </div>
            <AddressBook user={user} sede={sede} currentAddress="" onSelect={() => {}} />
          </div>
        </div>
      )}
    </div>,
    document.body,
  )
}
