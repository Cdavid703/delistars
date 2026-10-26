import { useState, useEffect, lazy, Suspense } from 'react'
import { useAuth } from './contexts/AuthContext'
import LoginPage            from './pages/LoginPage'
import SedeSelectionPage    from './pages/SedeSelectionPage'
import RoleChoicePage       from './pages/RoleChoicePage'
import InstallPromptBanner  from './components/common/InstallPromptBanner'
import AvisoVersion         from './components/common/AvisoVersion'
import { AvisoCambioEmpleado } from './components/common/CambiarEmpleado'
import { ROLES, SEDES } from './services/roles'
import { recordarCampanaDeUrl } from './utils/campana'

// Cada panel de rol se carga por separado: un cliente no descarga el código del
// cajero ni del domiciliario (y viceversa), aligerando la carga inicial.
const CashierPanel  = lazy(() => import('./components/cashier/CashierPanel'))
const DeliveryPanel = lazy(() => import('./components/delivery/DeliveryPanel'))
const ClientPanel   = lazy(() => import('./components/client/ClientPanel'))
const SeguirConCodigo = lazy(() => import('./pages/SeguirConCodigo'))
const RecibePedido    = lazy(() => import('./pages/RecibePedido'))
const RecorridoPedido = lazy(() => import('./pages/RecorridoPedido'))

// ?codigo=K7QM-4ZP9 (o ?codigo vacío): seguir un pedido de caja con su código
// privado, con o sin cuenta (Fase 4, P-16).
const codigoEnUrl = new URLSearchParams(window.location.search).get('codigo')

// ?recibe=<token>: quien recibe un pedido para otra persona lo sigue sin cuenta (§7.3).
const recibeEnUrl = new URLSearchParams(window.location.search).get('recibe')

// ?recorrido=<orderId>: recorrido de una entrega, solo administración (§12.1).
const recorridoEnUrl = new URLSearchParams(window.location.search).get('recorrido')

// ?campana=<id> (notificación de Mercadeo con destino «Mis premios»): se
// cuenta la apertura y se recuerda 24 h para atribuir el pedido (§17.4).
recordarCampanaDeUrl()

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

// Estado de la conexión (especificación §21.1). Sin internet: lo que se ve
// puede estar desactualizado y nada se confirma (ni queda en cola para después);
// lo que estaba escribiendo se conserva. Al volver: revisar antes de seguir.
function OfflineBanner() {
  const [offline, setOffline] = useState(!navigator.onLine)
  const [desde, setDesde] = useState(navigator.onLine ? null : Date.now())
  const [volvio, setVolvio] = useState(false)
  useEffect(() => {
    let t = null
    const on  = () => { setOffline(false); setVolvio(true); clearTimeout(t); t = setTimeout(() => setVolvio(false), 9000) }
    const off = () => { setOffline(true); setVolvio(false); setDesde(Date.now()) }
    window.addEventListener('online',  on)
    window.addEventListener('offline', off)
    return () => { window.removeEventListener('online', on); window.removeEventListener('offline', off); clearTimeout(t) }
  }, [])
  if (offline) {
    const hora = desde ? new Date(desde).toLocaleTimeString('es-CO', { hour: 'numeric', minute: '2-digit' }) : ''
    return (
      <div role="status" className="fixed top-0 left-0 right-0 z-[200] bg-coal text-cream px-4 py-2 text-center font-body text-sm">
        <p className="font-semibold">📡 Sin conexión{hora ? ` desde las ${hora}` : ''}: lo que ves puede estar desactualizado.</p>
        <p className="text-xs text-cream/80">No se puede enviar, confirmar, pagar, entregar ni cuadrar hasta que vuelva. Lo que estabas escribiendo se conserva.</p>
      </div>
    )
  }
  if (volvio) {
    return (
      <div role="status" className="fixed top-0 left-0 right-0 z-[200] bg-mint text-cream px-4 py-2 text-center font-body text-sm font-semibold">
        ✅ Volvió la conexión. Revisa los datos antes de seguir: pueden haber cambiado precios, disponibilidad o estados.
      </div>
    )
  }
  return null
}

export default function App() {
  const { user, role, effectiveRole, viewingAs, sede, selectSede, loading } = useAuth()

  useEffect(() => {
    if (!user || sede) return
    try {
      // Sede del carrito entregado por el menú, del borrador en curso o —si
      // esos caducaron y el pedido se rescata— del carrito del menú. Así el
      // cliente no tiene que volver a elegir sede.
      const handoff = JSON.parse(localStorage.getItem('ds_cart_handoff') || 'null')
      const draft   = JSON.parse(localStorage.getItem('ds_order_draft') || 'null')
      const cart    = JSON.parse(localStorage.getItem('ds_cart_items') || 'null')
      // …o la del pedido de caja que acaba de guardar en su cuenta con el código.
      const sedeId  = handoff?.sedeId || draft?.sedeId || cart?.sedeId || sessionStorage.getItem('ds_sede_pedido')
      if (sedeId && SEDES[sedeId]) selectSede(SEDES[sedeId])
    } catch (_) {}
  }, [user, sede])

  // No necesita sesión: se muestra sin esperar a que cargue la cuenta.
  if (recibeEnUrl) {
    return (
      <Suspense fallback={<LoadingScreen />}>
        <RecibePedido token={recibeEnUrl} />
      </Suspense>
    )
  }

  if (loading) return <LoadingScreen />

  if (recorridoEnUrl) {
    if (!user) return <LoginPage />
    return (
      <Suspense fallback={<LoadingScreen />}>
        <RecorridoPedido orderId={recorridoEnUrl} />
      </Suspense>
    )
  }

  if (codigoEnUrl !== null) {
    return (
      <Suspense fallback={<LoadingScreen />}>
        <SeguirConCodigo codigoInicial={codigoEnUrl} />
      </Suspense>
    )
  }

  if (!user) return <LoginPage />
  if (!sede) return <SedeSelectionPage />
  if (role !== ROLES.CLIENT && viewingAs === undefined) return <RoleChoicePage />

  const view = effectiveRole || role

  return (
    <>
      <OfflineBanner />
      <AvisoCambioEmpleado />
      <AvisoVersion />
      <InstallPromptBanner />
      <Suspense fallback={<LoadingScreen />}>
        {view === ROLES.ADMIN   && <AdminRedirect />}
        {view === ROLES.CASHIER && <CashierPanel />}
        {view === ROLES.DRIVER  && <DeliveryPanel />}
        {view !== ROLES.ADMIN && view !== ROLES.CASHIER && view !== ROLES.DRIVER && <ClientPanel />}
      </Suspense>
    </>
  )
}
