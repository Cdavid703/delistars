import { useAuth } from './contexts/AuthContext'
import LoginPage         from './pages/LoginPage'
import SedeSelectionPage from './pages/SedeSelectionPage'
import RoleChoicePage    from './pages/RoleChoicePage'
import CashierPanel      from './components/cashier/CashierPanel'
import DeliveryPanel     from './components/delivery/DeliveryPanel'
import ClientPanel       from './components/client/ClientPanel'
import AdminPanel        from './components/admin/AdminPanel'
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

export default function App() {
  const { user, role, effectiveRole, viewingAs, sede, loading } = useAuth()

  if (loading) return <LoadingScreen />

  if (!user) return <LoginPage />
  if (!sede) return <SedeSelectionPage />
  if (role !== ROLES.CLIENT && viewingAs === undefined) return <RoleChoicePage />

  const view = effectiveRole || role

  if (view === ROLES.ADMIN)   return <AdminPanel />
  if (view === ROLES.CASHIER) return <CashierPanel />
  if (view === ROLES.DRIVER)  return <DeliveryPanel />
  return <ClientPanel />
}
