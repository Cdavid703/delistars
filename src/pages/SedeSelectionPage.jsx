import { useState } from 'react'
import { useAuth } from '../contexts/AuthContext'
import Logo from '../components/common/Logo'
import { SEDES } from '../services/roles'
import { MapPin, ChevronRight, LogOut } from 'lucide-react'

export default function SedeSelectionPage() {
  const { user, role, selectSede, logout } = useAuth()
  const [selected, setSelected] = useState(null)
  const [loading,  setLoading]  = useState(false)

  const handleConfirm = () => {
    if (!selected) return
    setLoading(true)
    selectSede(SEDES[selected])
  }

  const roleLabel = {
    admin:   '👑 Administrador',
    cashier: '🧾 Cajero',
    driver:  '🚴 Domiciliario',
    client:  '🛍️ Cliente',
  }[role] || 'Cliente'

  return (
    <div className="min-h-screen-safe flex flex-col items-center justify-center bg-gradient-soft px-4 py-8">
      <div className="w-full max-w-sm animate-fade-in">
        {/* Header */}
        <div className="flex flex-col items-center gap-4 mb-8">
          <Logo variant="light" size="lg" />
          <div className="text-center">
            <p className="font-body font-semibold text-coal/70 text-sm">
              Hola, <span className="text-cherry">{user?.displayName?.split(' ')[0]}</span>
            </p>
            <p className="font-body text-xs text-coal/50 mt-0.5">{roleLabel}</p>
          </div>
        </div>

        {/* Title */}
        <h2 className="font-display text-2xl text-coal text-center tracking-widest mb-2">
          Selecciona tu sede
        </h2>
        <p className="font-body text-sm text-coal/50 text-center mb-6">
          ¿Desde cuál sede estás trabajando hoy?
        </p>

        {/* Sede options */}
        <div className="flex flex-col gap-3 mb-6">
          {Object.values(SEDES).map((sede) => (
            <button
              key={sede.id}
              onClick={() => setSelected(sede.id)}
              className={`w-full text-left card hover-lift transition-all duration-200 border-2 ${
                selected === sede.id
                  ? 'border-cherry shadow-soft'
                  : 'border-transparent hover:border-cherry/20'
              }`}
            >
              <div className="flex items-center gap-3">
                <div className={`w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0 transition-colors ${
                  selected === sede.id ? 'bg-cherry text-cream' : 'bg-smoked text-coal/50'
                }`}>
                  <MapPin size={18} />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-display text-lg text-coal tracking-wide">{sede.name}</p>
                  <p className="font-body text-xs text-coal/50 truncate">{sede.address}</p>
                </div>
                {selected === sede.id && (
                  <div className="w-5 h-5 rounded-full bg-cherry flex items-center justify-center">
                    <div className="w-2 h-2 rounded-full bg-cream" />
                  </div>
                )}
              </div>
            </button>
          ))}
        </div>

        {/* Confirm button */}
        <button
          onClick={handleConfirm}
          disabled={!selected || loading}
          className="btn-primary w-full btn-lg"
        >
          {loading ? 'Cargando…' : 'Continuar'}
          <ChevronRight size={20} />
        </button>

        {/* Logout */}
        <button
          onClick={logout}
          className="w-full mt-4 flex items-center justify-center gap-2 text-sm text-coal/40 hover:text-coal/70 font-body transition-colors"
        >
          <LogOut size={14} />
          Cerrar sesión
        </button>
      </div>
    </div>
  )
}
