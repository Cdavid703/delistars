import { motion, AnimatePresence, LayoutGroup, MotionConfig } from 'motion/react'
import { Inbox, CircleCheck, ChefHat, PackageCheck, Bike } from 'lucide-react'
import OrderCard from './OrderCard'
import { minutosEnEtapa, porAsignar } from '../../utils/tableroCaja'
import { etapaDe } from '../../utils/etapas'

// Tablero de la caja en pantallas anchas (computador): una columna por etapa,
// de izquierda a derecha como avanza el pedido. Arriba de cada columna, el que
// más lleva esperando. Cuando un pedido avanza, su tarjeta se desliza a la
// columna siguiente (Motion, con layoutId); con «reducir movimiento» del
// sistema, solo cambia de lugar.
const COLUMNAS = [
  { id: 'nuevos', titulo: 'Nuevos', etapas: ['enviado'], icono: Inbox, vacia: 'Sin pedidos nuevos' },
  { id: 'confirmados', titulo: 'Confirmados', etapas: ['confirmado'], icono: CircleCheck, vacia: 'Nada por preparar' },
  { id: 'cocina', titulo: 'En cocina', etapas: ['en_preparacion'], icono: ChefHat, vacia: 'Cocina libre' },
  { id: 'listos', titulo: 'Listos', etapas: ['listo'], icono: PackageCheck, vacia: 'Nada esperando' },
  { id: 'reparto', titulo: 'En camino', etapas: ['en_camino', 'llego'], icono: Bike, vacia: 'Nadie en la calle' },
]

const RESORTE = { type: 'spring', stiffness: 420, damping: 38, mass: 0.8 }

// `abiertoId`: el pedido abierto en el panel de la derecha se marca en rojo.
export default function TableroCaja({ orders, ahora, unreadChatMap, onAbrir, onToggleFacturado, onAsignar, abiertoId = null }) {
  const porColumna = Object.fromEntries(COLUMNAS.map((c) => [c.id, []]))
  for (const o of orders) {
    const { etapa } = etapaDe(o)
    const col = COLUMNAS.find((c) => c.etapas.includes(etapa))
    if (col) porColumna[col.id].push(o)
  }
  for (const id of Object.keys(porColumna)) {
    porColumna[id].sort((a, b) => (minutosEnEtapa(b, ahora) ?? 0) - (minutosEnEtapa(a, ahora) ?? 0))
  }

  return (
    <MotionConfig reducedMotion="user">
      <LayoutGroup>
        <div className="grid grid-cols-5 gap-3 h-full min-h-0">
          {COLUMNAS.map((c) => {
            const lista = porColumna[c.id]
            const Icono = c.icono
            // Confirmados: cuántos domicilios esperan que la caja les asigne domiciliario.
            const sinDomi = c.id === 'confirmados' ? lista.filter(porAsignar).length : 0
            return (
              <section key={c.id} className="flex flex-col min-h-0 rounded-2xl bg-coal/[0.035]" aria-label={c.titulo}>
                <header className="flex items-center gap-2 px-3 pt-3 pb-2">
                  <Icono size={16} className="text-coal/45" aria-hidden="true" />
                  <h2 className="font-display text-lg tracking-wide text-coal leading-none">{c.titulo}</h2>
                  {sinDomi > 0 && (
                    <span className="inline-flex items-center gap-1 rounded-full bg-tangelo/15 px-2 py-0.5 font-body text-[11px] font-semibold text-coal" title="Domicilios sin domiciliario">
                      <Bike size={11} className="text-tangelo" aria-hidden="true" /> {sinDomi} por asignar
                    </span>
                  )}
                  <motion.span key={lista.length} initial={{ scale: 0.6, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} transition={RESORTE}
                    className={`ml-auto min-w-[24px] h-6 px-2 rounded-full flex items-center justify-center font-body text-xs font-bold tabular ${
                      lista.length ? (c.id === 'nuevos' ? 'bg-cherry text-cream' : 'bg-coal text-cream') : 'bg-coal/10 text-coal/40'}`}>
                    {lista.length}
                  </motion.span>
                </header>
                <div className="flex-1 min-h-0 overflow-y-auto scroll-custom px-2 pb-3 flex flex-col gap-2.5">
                  <AnimatePresence initial={false} mode="popLayout">
                    {lista.map((o) => (
                      <motion.div key={o.id} layout layoutId={o.id}
                        initial={{ opacity: 0, y: 12, scale: 0.98 }}
                        animate={{ opacity: 1, y: 0, scale: 1 }}
                        exit={{ opacity: 0, scale: 0.96, transition: { duration: 0.15 } }}
                        transition={RESORTE}
                        className={o.id === abiertoId ? 'rounded-2xl ring-2 ring-cherry ring-offset-2 ring-offset-cream' : ''}>
                        <OrderCard tablero order={o} ahora={ahora} unreadCount={unreadChatMap[o.id] || 0}
                          onClick={() => onAbrir(o)} onToggleFacturado={() => onToggleFacturado(o)} onAsignar={() => onAsignar(o)} />
                      </motion.div>
                    ))}
                  </AnimatePresence>
                  {lista.length === 0 && (
                    <p className="mx-1 mt-1 rounded-xl border border-dashed border-coal/15 px-3 py-6 text-center font-body text-xs text-coal/40">{c.vacia}</p>
                  )}
                </div>
              </section>
            )
          })}
        </div>
      </LayoutGroup>
    </MotionConfig>
  )
}
