import { useState } from 'react'
import { useAuth } from '../contexts/AuthContext'
import Logo from '../components/common/Logo'
import { Globe, Star, UserX } from 'lucide-react'

export default function LoginPage() {
  const { login, loginGuest } = useAuth()
  const [loading,      setLoading]      = useState(false)
  const [loadingGuest, setLoadingGuest] = useState(false)
  const [error, setError]               = useState('')

  const handleLogin = async () => {
    setLoading(true)
    setError('')
    try {
      await login()
    } catch (err) {
      if (err.code !== 'auth/popup-closed-by-user') {
        setError('Error al iniciar sesión. Intenta de nuevo.')
      }
    } finally {
      setLoading(false)
    }
  }

  const handleGuest = async () => {
    setLoadingGuest(true)
    setError('')
    try {
      await loginGuest()
    } catch {
      setError('No se pudo continuar como invitado. Intenta de nuevo.')
    } finally {
      setLoadingGuest(false)
    }
  }

  const busy = loading || loadingGuest

  return (
    <div className="min-h-screen-safe flex flex-col items-center justify-center bg-gradient-to-br from-cherry via-tangelo to-mustard relative overflow-hidden">
      {/* Background decoration */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        {[...Array(6)].map((_, i) => (
          <Star
            key={i}
            className="absolute text-cream/10"
            style={{
              width:  `${40 + i * 20}px`,
              height: `${40 + i * 20}px`,
              top:    `${10 + i * 15}%`,
              left:   `${5 + i * 16}%`,
              transform: `rotate(${i * 30}deg)`,
            }}
          />
        ))}
      </div>

      {/* Card */}
      <div className="relative z-10 w-full max-w-sm mx-4 animate-scale-in">
        <div className="bg-cream rounded-3xl shadow-2xl p-8 flex flex-col items-center gap-6">
          {/* Logo */}
          <Logo variant="light" size="xl" />

          {/* Tagline */}
          <div className="text-center">
            <p className="font-script text-2xl text-cherry">¡Bienvenido!</p>
            <p className="font-body text-sm text-coal/60 mt-1">
              Plataforma de domicilios
            </p>
          </div>

          {/* Divider */}
          <div className="w-full h-px bg-coal/10" />

          {/* Sign in button */}
          <button
            onClick={handleLogin}
            disabled={busy}
            className="btn-primary btn-lg w-full"
          >
            <Globe size={20} />
            {loading ? 'Conectando…' : 'Entrar con Google'}
          </button>

          {/* Guest button */}
          <button
            onClick={handleGuest}
            disabled={busy}
            className="btn-secondary btn-lg w-full"
          >
            <UserX size={20} />
            {loadingGuest ? 'Entrando…' : 'Continuar sin cuenta'}
          </button>

          {error && (
            <p className="text-sm text-pepper font-body text-center">{error}</p>
          )}

          <p className="font-body text-xs text-coal/40 text-center">
            Personal DeliStars: inicia con tu cuenta de Google.<br />
            Clientes: puedes entrar sin cuenta.
          </p>
        </div>
      </div>

      {/* Bottom brand text */}
      <p className="relative z-10 mt-6 font-display text-cream/60 tracking-widest text-sm">
        TASTY & COOL
      </p>
    </div>
  )
}
