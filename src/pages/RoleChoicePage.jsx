import { useAuth } from '../contexts/AuthContext'
import Logo from '../components/common/Logo'
import { ROLES } from '../services/roles'
import { ShieldCheck, Receipt, Bike, ShoppingBag } from 'lucide-react'

const ROLE_INFO = {
  [ROLES.ADMIN]:   { icon: ShieldCheck, label: 'Panel Admin',        color: 'bg-coal text-cream',   desc: 'Gestión completa de la plataforma' },
  [ROLES.CASHIER]: { icon: Receipt,     label: 'Panel Cajero',       color: 'bg-cherry text-cream', desc: 'Gestión de pedidos y domicilios' },
  [ROLES.DRIVER]:  { icon: Bike,        label: 'Panel Domiciliario', color: 'bg-mint text-cream',   desc: 'Mis entregas del día' },
  [ROLES.CLIENT]:  { icon: ShoppingBag, label: 'Ver como cliente',   color: 'bg-mustard text-coal', desc: 'Vista de seguimiento de pedidos' },
}

export default function RoleChoicePage() {
  const { user, allRoles, setViewingAs } = useAuth()

  return (
    <div className="min-h-screen-safe flex flex-col items-center justify-center bg-gradient-soft px-4">
      <div className="w-full max-w-sm animate-fade-in">
        <div className="flex flex-col items-center gap-3 mb-8">
          <Logo variant="light" size="md" />
          <p className="font-body text-coal/60 text-sm text-center">
            Hola <span className="font-semibold text-cherry">{user?.displayName?.split(' ')[0]}</span>,
            ¿cómo deseas ingresar hoy?
          </p>
        </div>

        <div className="flex flex-col gap-3">
          {allRoles.map((r) => {
            const info = ROLE_INFO[r]
            if (!info) return null
            const Icon = info.icon
            return (
              <button
                key={r}
                onClick={() => {
                  // El admin va al panel nuevo (/admin/); no fijamos viewingAs
                  // para no quedar atrapados redirigiendo en cada visita.
                  if (r === ROLES.ADMIN) { window.location.replace('/admin/'); return }
                  setViewingAs(r === allRoles[0] ? null : r)
                }}
                className={`w-full flex items-center gap-4 p-4 rounded-2xl ${info.color} shadow-card hover:-translate-y-0.5 transition-all duration-200 active:scale-95`}
              >
                <div className="w-12 h-12 rounded-full bg-white/20 flex items-center justify-center flex-shrink-0">
                  <Icon size={22} />
                </div>
                <div className="text-left">
                  <p className="font-display text-xl tracking-wide leading-tight">{info.label}</p>
                  <p className="font-body text-sm opacity-75">{info.desc}</p>
                </div>
              </button>
            )
          })}
        </div>
      </div>
    </div>
  )
}
