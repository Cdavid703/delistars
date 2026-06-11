import { useState } from 'react'
import { useAuthStore } from '@/store/authStore'
import { toast } from 'sonner'

export default function Login() {
  const { login, loading } = useAuthStore()
  const [usuario, setUsuario] = useState('')
  const [password, setPassword] = useState('')

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!usuario.trim() || !password.trim()) {
      toast.error('Ingresa usuario y contraseña')
      return
    }
    try {
      await login(usuario.trim(), password)
    } catch (err: any) {
      toast.error(err.message || 'Error al iniciar sesión')
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-coal via-gray-900 to-coal px-4">
      <div className="w-full max-w-sm">
        <div className="text-center mb-8">
          <h1 className="text-4xl font-display font-bold text-cherry">DeliStars</h1>
          <p className="text-gray-400 text-sm mt-2">Panel de Administración</p>
        </div>

        <form onSubmit={handleSubmit} className="bg-white rounded-2xl shadow-card p-8 space-y-5">
          <div>
            <label htmlFor="usuario" className="block text-sm font-medium text-coal mb-1.5">
              Usuario
            </label>
            <input
              id="usuario"
              type="text"
              value={usuario}
              onChange={(e) => setUsuario(e.target.value)}
              className="w-full px-4 py-3 rounded-xl border border-gray-200 focus:border-cherry focus:ring-2 focus:ring-cherry/20 outline-none transition-all text-coal"
              placeholder="Tu usuario"
              autoComplete="username"
            />
          </div>

          <div>
            <label htmlFor="password" className="block text-sm font-medium text-coal mb-1.5">
              Contraseña
            </label>
            <input
              id="password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full px-4 py-3 rounded-xl border border-gray-200 focus:border-cherry focus:ring-2 focus:ring-cherry/20 outline-none transition-all text-coal"
              placeholder="••••••••"
              autoComplete="current-password"
            />
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full py-3 rounded-xl bg-gradient-hero text-white font-display font-semibold tracking-wide text-lg shadow-soft hover:opacity-90 transition-opacity disabled:opacity-50"
          >
            {loading ? 'Ingresando...' : 'Ingresar'}
          </button>
        </form>
      </div>
    </div>
  )
}
