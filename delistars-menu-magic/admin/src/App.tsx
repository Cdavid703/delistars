import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom'
import { QueryClientProvider, QueryClient } from '@tanstack/react-query'
import { Toaster } from 'sonner'
import { useAuthStore } from '@/store/authStore'
import Login from '@/pages/Login'
import Dashboard from '@/pages/Dashboard'
import Productos from '@/pages/Productos'
import Trabajadores from '@/pages/Trabajadores'
import Sedes from '@/pages/Sedes'
import Domicilios from '@/pages/Domicilios'
import Usuarios from '@/pages/Usuarios'
import Fidelizacion from '@/pages/Fidelizacion'
import Turnos from '@/pages/Turnos'
import Vacantes from '@/pages/Vacantes'
import Layout from '@/components/Layout'
import NotFound from '@/pages/NotFound'

const queryClient = new QueryClient()

function LoadingScreen() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-coal text-cream">
      <p className="font-display tracking-widest text-sm">CARGANDO…</p>
    </div>
  )
}

function App() {
  const { user, ready } = useAuthStore()

  if (!ready) return <LoadingScreen />

  return (
    <QueryClientProvider client={queryClient}>
      <Router basename="/admin">
        <Toaster position="top-right" />
        {!user ? (
          <Routes>
            <Route path="*" element={<Login />} />
          </Routes>
        ) : (
          <Routes>
            <Route path="/" element={<Layout />}>
              <Route index element={<Dashboard />} />
              <Route path="productos" element={<Productos />} />
              <Route path="sedes" element={<Sedes />} />
              <Route path="trabajadores" element={<Trabajadores />} />
              <Route path="domicilios" element={<Domicilios />} />
              <Route path="usuarios" element={<Usuarios />} />
              <Route path="fidelizacion" element={<Fidelizacion />} />
              <Route path="turnos" element={<Turnos />} />
              <Route path="vacantes" element={<Vacantes />} />
            </Route>
            <Route path="/404" element={<NotFound />} />
            <Route path="*" element={<Navigate to="/404" replace />} />
          </Routes>
        )}
      </Router>
    </QueryClientProvider>
  )
}

export default App
