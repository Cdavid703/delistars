import { useState, useRef, useEffect, useMemo } from 'react'
import { MapPin, Search, X, Check, Pencil } from 'lucide-react'

// Selector de barrio.
//
// Antes era un <input list="datalist">: en iPhone casi no muestra sugerencias y
// cada quien escribía como podía — en producción aparecieron 96 formas de
// escribir 35 barrios ("Calasanz", "Calazans", "Calanzans"). Como el precio del
// domicilio depende del barrio, esa variedad rompe el cálculo.
//
// Reglas que pidió el negocio:
//   · Lista para escoger, con buscador (35 barrios son muchos para deslizar).
//   · NUNCA bloquear: si el barrio del cliente no está, puede escribirlo.
//   · Que el cliente pueda seguir aunque no sepa bien su barrio.

const norm = (s) => String(s || '')
  .normalize('NFD').replace(/[̀-ͯ]/g, '')
  .toLowerCase().trim()

// Errores de escritura vistos en pedidos reales: si el cliente escribe la
// variante, igual encuentra el barrio bueno en la lista.
const ALIAS = {
  calazans: 'calasanz', calanzans: 'calasanz', calazanz: 'calasanz',
  'juan 23': 'juan xxiii', 'juan23': 'juan xxiii',
  alcazares: 'los alcazares',
  'sta monica': 'santa monica', 'sta rosa': 'santa rosa de lima',
  americas: 'la america',
}

const expandir = (q) => {
  const n = norm(q)
  return ALIAS[n] ? [n, ALIAS[n]] : [n]
}

export default function BarrioPicker({ value, onChange, barrios = [], className = '' }) {
  const [abierto, setAbierto] = useState(false)
  const [busqueda, setBusqueda] = useState('')
  const [escribiendo, setEscribiendo] = useState(false)
  const [otroTexto, setOtroTexto] = useState('')
  const buscadorRef = useRef(null)

  useEffect(() => {
    if (abierto && !escribiendo) buscadorRef.current?.focus()
  }, [abierto, escribiendo])

  const filtrados = useMemo(() => {
    const términos = expandir(busqueda)
    if (!términos[0]) return barrios
    return barrios.filter(b => {
      const nb = norm(b)
      return términos.some(t => nb.includes(t))
    })
  }, [busqueda, barrios])

  // El barrio elegido no está en la lista: se escribió a mano.
  const esPersonalizado = !!value && !barrios.some(b => norm(b) === norm(value))

  const cerrar = () => {
    setAbierto(false)
    setBusqueda('')
    setEscribiendo(false)
    setOtroTexto('')
  }

  const elegir = (b) => { onChange(b); cerrar() }

  const guardarOtro = () => {
    const t = otroTexto.trim()
    if (!t) return
    onChange(t)
    cerrar()
  }

  return (
    <div className={className}>
      <button
        type="button"
        onClick={() => setAbierto(true)}
        className="input-field w-full flex items-center gap-2 text-left"
      >
        <MapPin size={15} className="text-coal/40 flex-shrink-0" />
        <span className={`flex-1 truncate ${value ? 'text-coal' : 'text-coal/40'}`}>
          {value || 'Escoge tu barrio'}
        </span>
        {esPersonalizado && (
          <span className="text-[10px] font-bold uppercase tracking-wider text-mint flex-shrink-0">
            escrito
          </span>
        )}
      </button>

      {abierto && (
        <div
          className="fixed inset-0 z-[120] flex items-end sm:items-center justify-center bg-coal/50 backdrop-blur-sm"
          onClick={e => { if (e.target === e.currentTarget) cerrar() }}
        >
          <div className="bg-cream w-full max-w-md rounded-t-3xl sm:rounded-3xl max-h-[85dvh] flex flex-col overflow-hidden">
            <div className="px-5 py-4 border-b border-coal/10 flex items-center justify-between flex-shrink-0">
              <p className="font-display text-lg text-coal tracking-wide">Tu barrio</p>
              <button type="button" onClick={cerrar} className="btn-icon text-coal/50">
                <X size={20} />
              </button>
            </div>

            {!escribiendo ? (
              <>
                <div className="px-5 pt-4 pb-2 flex-shrink-0">
                  <div className="relative">
                    <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-coal/35" />
                    <input
                      ref={buscadorRef}
                      className="input-field w-full pl-9"
                      value={busqueda}
                      onChange={e => setBusqueda(e.target.value)}
                      placeholder="Buscar barrio…"
                      autoComplete="off"
                    />
                  </div>
                </div>

                <div className="flex-1 overflow-y-auto px-5 pb-2 scroll-custom">
                  {filtrados.length > 0 ? (
                    <div className="flex flex-col">
                      {filtrados.map(b => (
                        <button
                          key={b}
                          type="button"
                          onClick={() => elegir(b)}
                          className="flex items-center gap-2 py-2.5 px-2 -mx-2 rounded-xl text-left hover:bg-smoked/60 transition-colors"
                        >
                          <span className="flex-1 font-body text-sm text-coal">{b}</span>
                          {norm(b) === norm(value) && <Check size={16} className="text-mint flex-shrink-0" />}
                        </button>
                      ))}
                    </div>
                  ) : (
                    <div className="py-6 text-center">
                      <p className="font-body text-sm text-coal/50">
                        No encontramos “{busqueda}” en la lista.
                      </p>
                      <p className="font-body text-xs text-coal/40 mt-1">
                        No hay problema: puedes escribirlo tú.
                      </p>
                    </div>
                  )}
                </div>

                {/* Salida siempre disponible: el cliente nunca queda atrapado */}
                <div className="px-5 py-4 border-t border-coal/10 flex-shrink-0">
                  <button
                    type="button"
                    onClick={() => { setEscribiendo(true); setOtroTexto(busqueda || value || '') }}
                    className="btn-secondary w-full"
                  >
                    <Pencil size={15} /> Mi barrio no está en la lista
                  </button>
                </div>
              </>
            ) : (
              <div className="p-5 flex flex-col gap-3">
                <p className="font-body text-sm text-coal/60">
                  Escribe el nombre de tu barrio. Lo tendremos en cuenta para próximos pedidos.
                </p>
                <input
                  className="input-field w-full"
                  value={otroTexto}
                  onChange={e => setOtroTexto(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); guardarOtro() } }}
                  placeholder="Nombre del barrio"
                  autoComplete="off"
                  autoFocus
                />
                <div className="flex gap-2">
                  <button type="button" onClick={guardarOtro} disabled={!otroTexto.trim()}
                    className="btn-primary flex-1 disabled:opacity-40">
                    Usar este barrio
                  </button>
                  <button type="button" onClick={() => setEscribiendo(false)} className="btn-secondary px-4">
                    Volver
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
