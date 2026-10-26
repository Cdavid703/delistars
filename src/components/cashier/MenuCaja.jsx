import {
  LayoutGrid, Calculator, CircleCheck, AlertTriangle, PackageX, Navigation, Users, BookOpen, MapPin, LogOut, Banknote,
} from 'lucide-react'
import RoleSwitcher from '../common/RoleSwitcher'
import { BotonCambiarEmpleado } from '../common/CambiarEmpleado'
import { BotonMisSesiones } from '../common/MisSesiones'

// Menú lateral de la caja en computador (rediseño aprobado el 25 oct 2026).
// Reúne las secciones (antes pestañas) y las herramientas (antes botones del
// encabezado). En tablet y celular la caja sigue con su encabezado y pestañas.

const SECCIONES = [
  { id: 'active', titulo: 'Activos', Icono: LayoutGrid },
  { id: 'cuadre', titulo: 'Cuadre', Icono: Banknote },
  { id: 'completed', titulo: 'Entregados', Icono: CircleCheck },
  { id: 'reclamos', titulo: 'Reclamos', Icono: AlertTriangle },
]

export default function MenuCaja({ tab, setTab, cuentas = {}, acciones = {}, user, sede, logout, antesDeCambiar, className = '' }) {
  const item = 'min-h-[44px] w-full flex items-center gap-3 px-3 rounded-xl font-body text-sm font-semibold text-left transition-colors'
  const herramienta = 'min-h-[40px] w-full flex items-center gap-3 px-3 rounded-xl font-body text-[13px] font-medium text-left text-[#D8CCB8] hover:bg-white/5'
  const nombre = user?.displayName || user?.email?.split('@')[0] || 'Caja'
  const iniciales = nombre.split(/\s+/).filter(Boolean).slice(0, 2).map((p) => p[0]).join('').toUpperCase()
  return (
    <aside className={`w-60 flex-shrink-0 bg-[#262626] text-[#F4E7D0] flex-col gap-5 px-3.5 pt-5 pb-4 overflow-y-auto ${className}`}>
      <div className="px-2 flex flex-col gap-2">
        <p className="font-display text-[34px] leading-none tracking-wider normal-case">DELI<span className="text-[#FF6B5E]">★</span>STARS</p>
        <button onClick={acciones.sede} className="self-start flex items-center gap-1.5 rounded-full bg-white/10 px-3 py-1.5 font-body text-xs font-semibold" title="Cambiar de sede">
          <MapPin size={13} aria-hidden="true" /> {sede?.name || 'Elegir sede'}
        </button>
      </div>

      <nav aria-label="Caja" className="flex flex-col gap-1">
        {SECCIONES.map(({ id, titulo, Icono }) => {
          const activo = tab === id
          const n = cuentas[id] || 0
          return (
            <button key={id} onClick={() => setTab(id)} aria-current={activo ? 'page' : undefined}
              className={`${item} ${activo ? 'bg-white/[0.12] text-white' : 'text-[#E9DDC8] hover:bg-white/5'}`}>
              <Icono size={18} aria-hidden="true" />
              <span className="flex-1">{titulo}</span>
              {n > 0 && (
                <span className={`min-w-[22px] h-[22px] px-1.5 rounded-full flex items-center justify-center text-xs font-bold ${id === 'cuadre' ? 'bg-mustard text-coal' : 'bg-[#C8261D] text-white'}`}>{n}</span>
              )}
            </button>
          )
        })}
      </nav>

      <div className="h-px bg-white/10" />

      <nav aria-label="Herramientas" className="flex flex-col gap-0.5">
        <button onClick={acciones.cuadreTurno} className={herramienta}><Calculator size={17} aria-hidden="true" /> Cuadre de turno</button>
        <button onClick={acciones.agotados} className={herramienta}><PackageX size={17} aria-hidden="true" /> Agotados</button>
        <button onClick={acciones.mapa} className={herramienta}><Navigation size={17} aria-hidden="true" /> Mapa de domiciliarios</button>
        <button onClick={acciones.domiciliarios} className={herramienta}><Users size={17} aria-hidden="true" /> Domiciliarios</button>
        <button onClick={acciones.manual} className={herramienta}><BookOpen size={17} aria-hidden="true" /> Manual</button>
        <BotonMisSesiones variante="menu" className={herramienta} />
      </nav>

      <div className="mt-auto rounded-2xl bg-white/[0.07] p-3 flex flex-col gap-2.5">
        <div className="flex items-center gap-2.5">
          <span className="w-9 h-9 rounded-full bg-[#F4E7D0] text-[#262626] font-display text-lg flex items-center justify-center flex-shrink-0">{iniciales || 'DS'}</span>
          <span className="min-w-0">
            <span className="block font-body text-[13px] font-bold truncate">{nombre}</span>
            <span className="block font-body text-[11px] text-[#C9BDAB]">Caja{sede?.name ? ` · ${sede.name}` : ''}</span>
          </span>
          <span className="ml-auto"><RoleSwitcher variant="dark" /></span>
        </div>
        <div className="grid grid-cols-2 gap-1.5">
          <BotonCambiarEmpleado variante="menu" antes={antesDeCambiar}
            className="min-h-[36px] rounded-xl border border-white/20 font-body text-[11px] font-semibold flex items-center justify-center gap-1 px-1" />
          <button onClick={logout} className="min-h-[36px] rounded-xl border border-white/20 font-body text-[11px] font-semibold flex items-center justify-center gap-1">
            <LogOut size={13} aria-hidden="true" /> Salir
          </button>
        </div>
      </div>
    </aside>
  )
}
