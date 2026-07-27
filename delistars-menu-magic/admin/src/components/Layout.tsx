import { Outlet, Link, useLocation } from 'react-router-dom'
import { Menu, X, LogOut } from 'lucide-react'
import { useState } from 'react'
import { useAuthStore } from '@/store/authStore'
import { RoleSwitcher } from '@/components/RoleSwitcher'
import logo from '@/assets/logo.svg'

const Layout = () => {
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const location = useLocation()
  const { user, logout } = useAuthStore()

  const navItems = [
    { label: 'Resumen', path: '/', icon: '📊' },
    { label: 'Productos', path: '/productos', icon: '🍔' },
    { label: 'Sedes', path: '/sedes', icon: '📍' },
    { label: 'Domicilios', path: '/domicilios', icon: '🛵' },
    { label: 'Reportes', path: '/reportes', icon: '📈' },
    { label: 'Clientes', path: '/clientes', icon: '👤' },
    { label: 'Empleados', path: '/usuarios', icon: '🧑‍🍳' },
    { label: 'Correo', path: '/correo', icon: '✉️' },
    { label: 'Turnos', path: '/turnos', icon: '🗓️' },
    { label: 'Vacantes', path: '/vacantes', icon: '📋' },
  ]

  const isActive = (path: string) => location.pathname === path

  return (
    <div className="flex h-screen bg-white">
      {/* Sidebar */}
      <aside
        className={`${
          sidebarOpen ? 'translate-x-0' : '-translate-x-full'
        } fixed left-0 top-0 z-40 h-full w-64 bg-coal text-white transition-transform duration-300 ease-in-out lg:static lg:translate-x-0`}
      >
        {/* Logo Section */}
        <div className="border-b border-gray-700 p-6 flex items-center gap-3">
          <div className="w-11 h-11 rounded-xl bg-cream flex items-center justify-center shrink-0 shadow-soft">
            <img src={logo} alt="DeliStars" className="w-8 h-8 object-contain" />
          </div>
          <div>
            <h1 className="text-2xl font-display font-bold text-primary leading-none">DeliStars</h1>
            <p className="text-[11px] text-gray-400 mt-1 uppercase tracking-wider">Panel de Administración</p>
          </div>
        </div>

        {/* Navigation */}
        <nav className="space-y-1 px-4 py-6">
          {navItems.map((item) => (
            <Link
              key={item.path}
              to={item.path}
              onClick={() => setSidebarOpen(false)}
              className={`flex items-center gap-3 rounded-lg px-4 py-3 text-sm font-medium transition-colors ${
                isActive(item.path)
                  ? 'bg-primary text-white shadow-soft'
                  : 'text-gray-300 hover:bg-gray-800 hover:text-white'
              }`}
            >
              <span className="text-lg">{item.icon}</span>
              {item.label}
            </Link>
          ))}
        </nav>

        {/* Logout Button */}
        <div className="absolute bottom-0 left-0 right-0 border-t border-gray-700 p-4">
          <button onClick={logout} className="w-full flex items-center gap-3 rounded-lg px-4 py-3 text-sm font-medium text-gray-300 hover:bg-gray-800 hover:text-primary transition-colors">
            <LogOut className="w-4 h-4" />
            Cerrar Sesión
          </button>
        </div>
      </aside>

      {/* Overlay */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 z-30 bg-black/50 lg:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* Main content */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {/* Header */}
        <header className="border-b border-gray-200 bg-white">
          <div className="flex items-center justify-between px-4 py-4 sm:px-6">
            <button
              onClick={() => setSidebarOpen(!sidebarOpen)}
              className="lg:hidden inline-flex items-center justify-center p-2 rounded-lg text-coal hover:bg-gray-100"
            >
              {sidebarOpen ? <X className="w-6 h-6" /> : <Menu className="w-6 h-6" />}
            </button>
            
            <div className="flex-1 hidden sm:flex items-center gap-4 ml-4">
              <h2 className="text-lg font-display font-semibold text-coal">
                {navItems.find(item => isActive(item.path))?.label || 'Dashboard'}
              </h2>
            </div>
            
            <div className="flex items-center gap-4">
              <RoleSwitcher user={user} />
              <div className="hidden sm:flex flex-col items-end">
                <p className="text-sm font-semibold text-coal">
                  {user?.displayName || 'Administrador'}
                </p>
                <p className="text-xs text-muted-fg">{user?.email}</p>
              </div>
              <div className="w-10 h-10 rounded-full bg-primary/20 flex items-center justify-center overflow-hidden">
                {user?.photoURL ? (
                  <img src={user.photoURL} alt="" className="w-full h-full object-cover" />
                ) : (
                  <span className="text-primary font-bold">
                    {(user?.displayName || user?.email || 'A')[0].toUpperCase()}
                  </span>
                )}
              </div>
            </div>
          </div>
        </header>

        {/* Page content */}
        <main className="flex-1 overflow-auto bg-gray-50">
          <div className="p-4 sm:p-6">
            <Outlet />
          </div>
        </main>
      </div>
    </div>
  )
}

export default Layout
