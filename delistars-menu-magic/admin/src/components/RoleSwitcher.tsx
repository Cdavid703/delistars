import { useEffect, useRef, useState } from 'react'
import { ChevronDown, ShieldCheck, Calculator, Bike, ShoppingBag } from 'lucide-react'
import type { User } from 'firebase/auth'
import { useAllRoles, ROLES, type RoleName } from '@/hooks/useAllRoles'

const ROLE_META: Record<RoleName, { label: string; Icon: typeof ShieldCheck; pill: string }> = {
  [ROLES.ADMIN]:   { label: 'Admin',        Icon: ShieldCheck, pill: 'bg-primary/15 text-primary' },
  [ROLES.CASHIER]: { label: 'Cajero',       Icon: Calculator,  pill: 'bg-amber-500/15 text-amber-600' },
  [ROLES.DRIVER]:  { label: 'Domiciliario', Icon: Bike,        pill: 'bg-emerald-500/15 text-emerald-600' },
  [ROLES.CLIENT]:  { label: 'Cliente',      Icon: ShoppingBag, pill: 'bg-gray-200 text-gray-600' },
}

// Persiste la elección en localStorage con la MISMA clave que usa AuthContext
// en la app de domicilios (comparten dominio/origen), así al navegar allá ya
// respeta el rol elegido sin quedar atrapado en el panel de admin.
function persistViewingAs(uid: string, role: RoleName) {
  localStorage.setItem(`viewingAs_${uid}`, role)
}

export function RoleSwitcher({ user }: { user: User | null }) {
  const allRoles = useAllRoles(user)
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  if (!user || allRoles.length <= 1) return null

  const goTo = (target: RoleName) => {
    if (!user) return
    setOpen(false)
    if (target === ROLES.ADMIN) return // ya estamos en el admin
    persistViewingAs(user.uid, target)
    window.location.href = target === ROLES.CLIENT ? '/' : '/domicilios/'
  }

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen((v) => !v)}
        className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-medium text-coal hover:bg-gray-100 transition-colors"
        title="Entrar a otro panel"
      >
        <ShieldCheck className="w-4 h-4" />
        <span className="hidden sm:inline">Mis paneles</span>
        <ChevronDown className={`w-3.5 h-3.5 transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>

      {open && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
          <div className="absolute right-0 mt-2 w-56 z-50 bg-white border border-gray-200 rounded-xl shadow-lg overflow-hidden">
            <p className="px-4 pt-3 pb-1.5 text-[10px] uppercase tracking-widest text-gray-400 font-semibold">
              Entrar como
            </p>
            {allRoles.map((r) => {
              const meta = ROLE_META[r]
              const isOwn = r === ROLES.ADMIN
              return (
                <button
                  key={r}
                  onClick={() => goTo(r)}
                  className="w-full flex items-center gap-3 px-4 py-2.5 text-left hover:bg-gray-50 transition-colors"
                >
                  <span className={`flex items-center justify-center w-7 h-7 rounded-full flex-shrink-0 ${meta.pill}`}>
                    <meta.Icon className="w-3.5 h-3.5" />
                  </span>
                  <span className="text-sm font-medium text-coal">{meta.label}</span>
                  {isOwn && <span className="ml-auto text-[10px] text-gray-400">actual</span>}
                </button>
              )
            })}
          </div>
        </>
      )}
    </div>
  )
}
