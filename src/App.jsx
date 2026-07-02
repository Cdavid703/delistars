import { useState, useEffect } from 'react'
import { useAuth } from './contexts/AuthContext'
import LoginPage            from './pages/LoginPage'
import SedeSelectionPage    from './pages/SedeSelectionPage'
import RoleChoicePage       from './pages/RoleChoicePage'
import CashierPanel         from './components/cashier/CashierPanel'
import DeliveryPanel        from './components/delivery/DeliveryPanel'
import ClientPanel          from './components/client/ClientPanel'
import InstallPromptBanner  from './components/common/InstallPromptBanner'
import { ROLES, SEDES } from './services/roles'

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

// El admin viejo embebido se retiró: el rol admin va siempre al admin nuevo
// (/admin/). La sesión se comparte (mismo proyecto Firebase y dominio).
function AdminRedirect() {
  useEffect(() => { window.location.replace('/admin/') }, [])
  return <LoadingScreen />
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
  const { user, role, effectiveRole, viewingAs, sede, selectSede, loading } = useAuth()

  useEffect(() => {
    if (!user || sede) return
    try {
      // Sede del carrito entregado por el menú, o del borrador de pedido en
      // curso (para que una recarga a mitad del formulario no mande al
      // cliente a elegir sede otra vez).
      const handoff = JSON.parse(localStorage.getItem('ds_cart_handoff') || 'null')
      const draft   = JSON.parse(localStorage.getItem('ds_order_draft') || 'null')
      const sedeId  = handoff?.sedeId || draft?.sedeId
      if (sedeId && SEDES[sedeId]) selectSede(SEDES[sedeId])
    } catch (_) {}
  }, [user, sede])

  if (loading) return <LoadingScreen />

  if (!user) return <LoginPage />
  if (!sede) return <SedeSelectionPage />
  if (role !== ROLES.CLIENT && viewingAs === undefined) return <RoleChoicePage />

  const view = effectiveRole || role

  return (
    <>
      <OfflineBanner />
      <InstallPromptBanner />
      {view === ROLES.ADMIN   && <AdminRedirect />}
      {view === ROLES.CASHIER && <CashierPanel />}
      {view === ROLES.DRIVER  && <DeliveryPanel />}
      {view !== ROLES.ADMIN && view !== ROLES.CASHIER && view !== ROLES.DRIVER && <ClientPanel />}
    </>
  )
}
