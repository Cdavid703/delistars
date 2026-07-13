// Barra de pestañas reutilizable para agrupar vistas dentro de una misma
// sección del panel (p. ej. Domicilios + Cuadre, Clientes + Calificaciones).
type Tab = { key: string; label: string }

export function PageTabs({ tabs, active, onChange }: {
  tabs: Tab[]
  active: string
  onChange: (key: string) => void
}) {
  return (
    <div className="flex gap-1 border-b border-gray-200 mb-6 overflow-x-auto">
      {tabs.map((t) => (
        <button
          key={t.key}
          onClick={() => onChange(t.key)}
          className={`px-4 py-2.5 text-sm font-medium -mb-px border-b-2 whitespace-nowrap transition-colors ${
            active === t.key
              ? 'border-primary text-primary'
              : 'border-transparent text-muted-fg hover:text-coal'
          }`}
        >
          {t.label}
        </button>
      ))}
    </div>
  )
}
