import { useState } from 'react'
import { useAuth } from '../contexts/AuthContext'
import Logo from '../components/common/Logo'
import AccesoCuenta from '../components/common/AccesoCuenta'
import { LogoGoogle } from '../components/common/LogosMarca'
import { Star, ShoppingBag, UserRound } from 'lucide-react'

// Sin "continuar sin cuenta": para pedir hay que tener cuenta (decisión C6,
// Fase 4). El invitado antiguo con un pedido en curso lo sigue viendo y puede
// crear la cuenta ahí mismo sin perderlo (P-15).
export default function LoginPage() {
  const { login } = useAuth()
  const [loading, setLoading] = useState(false)
  const [error, setError]     = useState('')
  // Llega del menú con su carrito (o con ?entrar): la ventana de ingreso se abre
  // de una vez. Al entrar, domicilios lo lleva directo a completar el pedido.
  const [conCarrito] = useState(() => {
    try { return !!(localStorage.getItem('ds_cart_handoff') || localStorage.getItem('ds_cart_items')) } catch { return false }
  })
  const [acceso, setAcceso]   = useState(() => conCarrito || new URLSearchParams(window.location.search).has('entrar'))

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

  const busy = loading

  return (
    <div className="min-h-screen-safe flex flex-col items-center justify-center bg-gradient-to-br from-cherry via-tangelo to-mustard relative overflow-hidden px-4 py-8">
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
      <div className="relative z-10 w-full max-w-sm animate-scale-in">
        <div className="bg-cream rounded-3xl shadow-2xl p-8 flex flex-col items-center gap-6">
          {/* Logo */}
          <Logo variant="light" size="xl" />

          {/* Tagline */}
          <div className="text-center">
            <p className="font-script text-2xl text-cherry">¡Bienvenido!</p>
            <p className="font-body text-sm text-coal/60 mt-1">
              ¿Vas a pedir? Empieza desde el menú
            </p>
          </div>

          {/* CTA principal: ir al menú (entrada del cliente) */}
          <a href="/" className="btn-primary btn-lg w-full">
            <ShoppingBag size={20} />
            Ir al menú a pedir
          </a>

          {/* Divider */}
          <div className="w-full flex items-center gap-3">
            <div className="flex-1 h-px bg-coal/10" />
            <span className="font-body text-[11px] text-coal/40 uppercase tracking-wider">o</span>
            <div className="flex-1 h-px bg-coal/10" />
          </div>

          {/* Cliente con cuenta: Google, Microsoft o correo y contraseña */}
          <button onClick={() => setAcceso(true)} disabled={busy} className="btn-secondary btn-lg w-full">
            <UserRound size={20} />
            Entrar o crear cuenta
          </button>
          {acceso && (
            <AccesoCuenta titulo={conCarrito ? 'Entra para enviar tu pedido' : undefined}
              onCerrar={() => setAcceso(false)} onListo={() => setAcceso(false)} />
          )}

          {/* Login del equipo / acceso directo */}
          <button
            onClick={handleLogin}
            disabled={busy}
            className="w-full inline-flex items-center justify-center gap-3 bg-white text-coal font-body font-semibold text-sm px-5 py-3 rounded-full border border-coal/20 shadow-sm hover:bg-smoked/40 active:scale-[0.98] transition disabled:opacity-60"
          >
            <LogoGoogle />
            {loading ? 'Conectando…' : 'Soy del equipo · Entrar con Google'}
          </button>

          {/* Pedido hecho en la caja: se sigue con el código que manda la sede */}
          <a href="/domicilios/?codigo" className="font-body text-xs text-coal/60 underline underline-offset-2 hover:text-coal">
            Tengo un código de pedido
          </a>

          {error && (
            <p className="text-sm text-pepper font-body text-center">{error}</p>
          )}
        </div>
      </div>

      {/* Bottom brand text */}
      <p className="relative z-10 mt-6 font-display text-cream/60 tracking-widest text-sm">
        TASTY & COOL
      </p>
    </div>
  )
}
