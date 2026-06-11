import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom'
import { QueryClientProvider, QueryClient } from '@tanstack/react-query'
import { Toaster } from 'sonner'
import { useAuthStore } from '@/store/authStore'
import Login from '@/pages/Login'
import Dashboard from '@/pages/Dashboard'
import Productos from '@/pages/Productos'
import Ventas from '@/pages/Ventas'
import Trabajadores from '@/pages/Trabajadores'
import Sedes from '@/pages/Sedes'
import Layout from '@/components/Layout'
import NotFound from '@/pages/NotFound'

const queryClient = new QueryClient()

function App() {
  const { user } = useAuthStore()

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
              <Route path="ventas" element={<Ventas />} />
              <Route path="trabajadores" element={<Trabajadores />} />
              <Route path="sedes" element={<Sedes />} />
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
