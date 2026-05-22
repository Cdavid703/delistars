import { useState, useRef, useEffect } from 'react'
import { ChevronDown, ShieldCheck, Calculator, Bike, ShoppingBag } from 'lucide-react'
import { useAuth } from '../../contexts/AuthContext'
import { ROLES } from '../../services/roles'

const ROLE_META = {
  [ROLES.ADMIN]:   { label: 'Admin',        Icon: ShieldCheck, pill: 'bg-cherry/15 text-cherry' },
  [ROLES.CASHIER]: { label: 'Cajero',       Icon: Calculator,  pill: 'bg-tangelo/15 text-tangelo' },
  [ROLES.DRIVER]:  { label: 'Domiciliario', Icon: Bike,        pill: 'bg-mint/15 text-mint' },
  [ROLES.CLIENT]:  { label: 'Cliente',      Icon: ShoppingBag, pill: 'bg-coal/10 text-coal/60' },
}

export default function RoleSwitcher({ variant = 'light' }) {
  const { role, allRoles, effectiveRole, setViewingAs } = useAuth()
  const [open, setOpen] = useState(false)
  const ref = useRef(null)

  useEffect(() => {
    const handler = e => { if (ref.current && !ref.current.contains(e.target)) setOpen(false) }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  if (allRoles.length <= 1) return null

  const current = ROLE_META[effectiveRole] || ROLE_META[ROLES.CLIENT]
  const { Icon: CurrentIcon } = current

  const switchTo = targetRole => {
    setViewingAs(targetRole === role ? null : targetRole)
    setOpen(false)
  }

  const btnCls = variant === 'dark'
    ? 'btn-icon flex items-center gap-1 px-2 text-cream/70 hover:text-cream hover:bg-cream/10'
    : 'btn-icon flex items-center gap-1 px-2 text-coal/60 hover:text-cherry'

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen(v => !v)}
        className={btnCls}
        title="Cambiar rol"
      >
        <CurrentIcon size={18} />
        <span className="font-body text-xs font-semibold hidden sm:inline">{current.label}</span>
        <ChevronDown size={12} className={`transition-transform duration-150 ${open ? 'rotate-180' : ''}`} />
      </button>

      {open && (
        <div className="absolute right-0 top-full mt-2 z-50 bg-cream rounded-2xl shadow-xl border border-coal/10 overflow-hidden min-w-[170px] animate-fade-in">
          <p className="px-4 pt-3 pb-1 font-body text-[10px] uppercase tracking-widest text-coal/40 font-semibold">Cambiar a</p>
          {allRoles.map(r => {
            const meta = ROLE_META[r]
            if (!meta) return null
            const { Icon, label, pill } = meta
            const isActive = effectiveRole === r
            return (
              <button
                key={r}
                onClick={() => switchTo(r)}
                className={`w-full flex items-center gap-3 px-4 py-2.5 text-left transition-colors hover:bg-smoked/60 ${isActive ? 'bg-smoked/40' : ''}`}
              >
                <span className={`flex items-center justify-center w-7 h-7 rounded-full flex-shrink-0 ${pill}`}>
                  <Icon size={14} />
                </span>
                <span className="font-body text-sm font-semibold text-coal">{label}</span>
                {isActive && <span className="ml-auto w-2 h-2 rounded-full bg-cherry flex-shrink-0" />}
              </button>
            )
          })}
          <div className="h-2" />
        </div>
      )}
    </div>
  )
}
