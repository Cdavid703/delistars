import { useState, useEffect } from 'react'
import { useAuth } from './contexts/AuthContext'
import LoginPage            from './pages/LoginPage'
import SedeSelectionPage    from './pages/SedeSelectionPage'
import RoleChoicePage       from './pages/RoleChoicePage'
import CashierPanel         from './components/cashier/CashierPanel'
import DeliveryPanel        from './components/delivery/DeliveryPanel'
import ClientPanel          from './components/client/ClientPanel'
import AdminPanel           from './components/admin/AdminPanel'
import InstallPromptBanner  from './components/common/InstallPromptBanner'
import { ROLES } from './services/roles'

function LoadingScreen() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-cherry to-tangelo">
      <div className="flex flex-col items-center gap-4">
        <div className="w-12 h-12 border-4 border-cream/30 border-t-cream rounded-full animate-spin" />
        <p className="font-display text-cream tracking-widest text-sm">CARGANDO…</p>
      </div>
    </div>
  )
}

function OfflineBanner() {
  const [offline, setOffline] = useState(!navigator.onLine)
  useEffect(() => {
    const on  = () => setOffline(false)
    const off = () => setOffline(true)
    window.addEventListener('online',  on)
    window.addEventListener('offline', off)
    return () => { window.removeEventListener('online', on); window.removeEventListener('offline', off) }
  }, [])
  if (!offline) return null
  return (
    <div className="fixed top-0 left-0 right-0 z-[200] bg-coal text-cream flex items-center justify-center gap-2 py-2 px-4 text-sm font-body font-semibold">
      <span>📡</span> Sin conexión — los datos pueden no estar actualizados
    </div>
  )
}

export default function App() {
  const { user, role, effectiveRole, viewingAs, sede, loading } = useAuth()

  if (loading) return <LoadingScreen />

  if (!user) return <LoginPage />
  if (!sede) return <SedeSelectionPage />
  if (role !== ROLES.CLIENT && viewingAs === undefined) return <RoleChoicePage />

  const view = effectiveRole || role

  return (
    <>
      <OfflineBanner />
      <InstallPromptBanner />
      {view === ROLES.ADMIN   && <AdminPanel />}
      {view === ROLES.CASHIER && <CashierPanel />}
      {view === ROLES.DRIVER  && <DeliveryPanel />}
      {view !== ROLES.ADMIN && view !== ROLES.CASHIER && view !== ROLES.DRIVER && <ClientPanel />}
    </>
  )
}
