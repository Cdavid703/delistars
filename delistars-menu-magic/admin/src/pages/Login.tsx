import { useAuthStore } from '@/store/authStore'
import { toast } from 'sonner'
import logo from '@/assets/logo.svg'

export default function Login() {
  const { login, loading } = useAuthStore()

  const handleLogin = async () => {
    try {
      await login()
    } catch (err: any) {
      toast.error(err.message || 'Error al iniciar sesión')
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-coal via-gray-900 to-coal px-4">
      <div className="w-full max-w-sm">
        <div className="text-center mb-8 flex flex-col items-center">
          <div className="w-20 h-20 rounded-2xl bg-cream flex items-center justify-center mb-4 shadow-glow">
            <img src={logo} alt="DeliStars" className="w-14 h-14 object-contain" />
          </div>
          <h1 className="text-4xl font-display font-bold text-cherry">DeliStars</h1>
          <p className="text-gray-400 text-sm mt-2">Administración</p>
        </div>

        <div className="bg-white rounded-2xl shadow-card p-8 space-y-5 text-center">
          <p className="text-sm text-coal/70">
            Inicia sesión con tu cuenta de Google autorizada como administrador.
          </p>
          <button
            onClick={handleLogin}
            disabled={loading}
            className="w-full py-3 rounded-xl bg-gradient-hero text-white font-display font-semibold tracking-wide text-lg shadow-soft hover:opacity-90 transition-opacity disabled:opacity-50"
          >
            {loading ? 'Ingresando...' : 'Ingresar con Google'}
          </button>
        </div>
      </div>
    </div>
  )
}
