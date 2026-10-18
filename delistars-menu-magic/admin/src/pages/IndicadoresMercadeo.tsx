import { useEffect, useMemo, useState } from 'react'
import { collection, onSnapshot, query, where } from 'firebase/firestore'
import { db } from '@/services/firebase'
import { fmtCOP } from '@/lib/orders'

// Indicadores de Mercadeo: SOLO números agregados (decisión C3 del 18 oct 2026,
// especificación §17.1). Los calcula el scheduler por día y sede en
// mercadeo/indicadores/dias/{yyyy-mm-dd}; aquí no se lee ningún pedido.
interface SedeDia {
  pedidos: number; ventas: number; cancelados: number; rechazados: number
  domicilios: number; recoger: number; porHora: number[]; productos: Record<string, number>
}
interface Dia { fecha: string; sedes: Record<string, SedeDia>; embudo: { checkouts: number; pedidosCliente: number } }

const SEDES = [{ id: '', nombre: 'Ambas sedes' }, { id: 'santa_lucia', nombre: 'Santa Lucía' }, { id: 'santa_teresita', nombre: 'Santa Teresita' }]
const n = (v: number) => v.toLocaleString('es-CO')

/** 'yyyy-mm-dd' de hace `dias` días, en hora de Colombia. */
const fechaHace = (dias: number) => new Date(Date.now() - 5 * 3600e3 - dias * 864e5).toISOString().slice(0, 10)
const etiquetaDia = (f: string) => new Date(`${f}T12:00:00-05:00`).toLocaleDateString('es-CO', { weekday: 'short', day: 'numeric' })

const Barra = ({ etiqueta, valor, max, texto }: { etiqueta: string; valor: number; max: number; texto: string }) => (
  <div className="flex items-center gap-2 text-sm">
    <span className="w-28 shrink-0 text-right text-muted-fg text-xs truncate">{etiqueta}</span>
    <div className="flex-1 bg-gray-100 rounded-full h-4 overflow-hidden">
      <div className="bg-primary h-4 rounded-full" style={{ width: `${max > 0 ? (valor / max) * 100 : 0}%` }} />
    </div>
    <span className="w-24 shrink-0 text-xs text-coal font-medium">{texto}</span>
  </div>
)

const Tarjeta = ({ titulo, valor, nota }: { titulo: string; valor: string; nota?: string }) => (
  <div className="bg-white border border-gray-200 rounded-lg p-4">
    <p className="text-xs text-muted-fg">{titulo}</p>
    <p className="text-2xl font-display font-bold text-coal mt-1">{valor}</p>
    {nota && <p className="text-[11px] text-muted-fg mt-0.5">{nota}</p>}
  </div>
)

const Bloque = ({ titulo, sub, children }: { titulo: string; sub?: string; children: React.ReactNode }) => (
  <div className="bg-white border border-gray-200 rounded-lg p-4">
    <p className="font-display font-semibold text-coal">{titulo}</p>
    <p className="text-xs text-muted-fg mb-3">{sub}</p>
    {children}
  </div>
)

export default function IndicadoresMercadeo() {
  const [dias, setDias] = useState(14)
  const [sede, setSede] = useState('')
  const [datos, setDatos] = useState<Dia[] | null>(null)

  useEffect(() => onSnapshot(
    query(collection(db, 'mercadeo', 'indicadores', 'dias'), where('fecha', '>=', fechaHace(dias - 1))),
    (s) => setDatos(s.docs.map((d) => d.data() as Dia).sort((a, b) => a.fecha.localeCompare(b.fecha))),
    () => setDatos([]),
  ), [dias])

  const r = useMemo(() => {
    const sedesDe = (d: Dia) => (sede ? [d.sedes?.[sede]] : Object.values(d.sedes || {})).filter(Boolean) as SedeDia[]
    const porDia = Array.from({ length: dias }, (_, i) => fechaHace(dias - 1 - i)).map((f) => {
      const d = datos?.find((x) => x.fecha === f)
      const s = d ? sedesDe(d) : []
      return { fecha: f, pedidos: s.reduce((t, x) => t + x.pedidos, 0), ventas: s.reduce((t, x) => t + x.ventas, 0) }
    })
    const todos = (datos ?? []).flatMap(sedesDe)
    const sum = (k: keyof SedeDia) => todos.reduce((t, x) => t + (x[k] as number), 0)
    const porHora = Array(24).fill(0).map((_, h) => todos.reduce((t, x) => t + (x.porHora?.[h] || 0), 0))
    const prod: Record<string, number> = {}
    for (const x of todos) for (const [k, v] of Object.entries(x.productos || {})) prod[k] = (prod[k] || 0) + v
    const porSede = SEDES.slice(1).map((s) => {
      const lista = (datos ?? []).map((d) => d.sedes?.[s.id]).filter(Boolean) as SedeDia[]
      return { nombre: s.nombre, pedidos: lista.reduce((t, x) => t + x.pedidos, 0), ventas: lista.reduce((t, x) => t + x.ventas, 0) }
    })
    const checkouts = (datos ?? []).reduce((t, d) => t + (d.embudo?.checkouts || 0), 0)
    const pedidosCliente = (datos ?? []).reduce((t, d) => t + (d.embudo?.pedidosCliente || 0), 0)
    return {
      porDia, porHora, porSede, checkouts, pedidosCliente,
      pedidos: sum('pedidos'), ventas: sum('ventas'), cancelados: sum('cancelados') + sum('rechazados'),
      domicilios: sum('domicilios'), recoger: sum('recoger'),
      top: Object.entries(prod).sort((a, b) => b[1] - a[1]).slice(0, 10),
    }
  }, [datos, dias, sede])

  const maxDia = Math.max(...r.porDia.map((d) => d.ventas), 0)
  const maxHora = Math.max(...r.porHora, 0)
  const maxProd = r.top[0]?.[1] ?? 0
  const maxSede = Math.max(...r.porSede.map((s) => s.ventas), 0)
  const abandono = r.checkouts > 0 ? Math.max(0, Math.round(((r.checkouts - r.pedidosCliente) / r.checkouts) * 100)) : null

  return (
    <div>
      <div className="flex flex-wrap items-end justify-between gap-3 mb-6">
        <div>
          <h1 className="text-3xl sm:text-4xl font-display font-bold text-coal">Indicadores</h1>
          <p className="text-muted-fg mt-1">Ventas y pedidos de las sedes (solo cifras totales, sin datos de clientes)</p>
        </div>
        <div className="flex gap-2">
          <select className="border border-gray-300 rounded-md px-2 py-1.5 text-sm" value={dias} onChange={(e) => setDias(Number(e.target.value))}>
            {[7, 14, 30, 90].map((d) => <option key={d} value={d}>Últimos {d} días</option>)}
          </select>
          <select className="border border-gray-300 rounded-md px-2 py-1.5 text-sm" value={sede} onChange={(e) => setSede(e.target.value)}>
            {SEDES.map((s) => <option key={s.id} value={s.id}>{s.nombre}</option>)}
          </select>
        </div>
      </div>

      {datos === null ? (
        <p className="text-sm text-muted-fg">Cargando…</p>
      ) : (
        <div className="flex flex-col gap-5">
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            <Tarjeta titulo="Pedidos entregados" valor={n(r.pedidos)} nota={`${n(r.domicilios)} domicilios · ${n(r.recoger)} recoger`} />
            <Tarjeta titulo="Ventas" valor={fmtCOP(r.ventas)} />
            <Tarjeta titulo="Ticket promedio" valor={r.pedidos ? fmtCOP(Math.round(r.ventas / r.pedidos)) : '—'} />
            <Tarjeta titulo="Cancelados o rechazados" valor={n(r.cancelados)} />
          </div>

          <Bloque titulo="Ventas por día" sub="Pedidos entregados (hora de Colombia)">
            <div className="flex flex-col gap-1.5">
              {r.porDia.map((d) => <Barra key={d.fecha} etiqueta={etiquetaDia(d.fecha)} valor={d.ventas} max={maxDia} texto={`${fmtCOP(d.ventas)} · ${d.pedidos}`} />)}
            </div>
          </Bloque>

          <div className="grid lg:grid-cols-2 gap-5">
            {!sede && (
              <Bloque titulo="Comparación entre sedes" sub="Ventas del período">
                <div className="flex flex-col gap-1.5">
                  {r.porSede.map((s) => <Barra key={s.nombre} etiqueta={s.nombre} valor={s.ventas} max={maxSede} texto={`${fmtCOP(s.ventas)} · ${s.pedidos}`} />)}
                </div>
              </Bloque>
            )}
            <Bloque titulo="Horas pico" sub="Pedidos entregados según la hora en que se pidieron">
              <div className="flex flex-col gap-1">
                {r.porHora.map((v, h) => v > 0 ? <Barra key={h} etiqueta={`${h % 12 || 12} ${h < 12 ? 'a. m.' : 'p. m.'}`} valor={v} max={maxHora} texto={n(v)} /> : null)}
                {maxHora === 0 && <p className="text-sm text-muted-fg">Sin pedidos en el período.</p>}
              </div>
            </Bloque>
            <Bloque titulo="Productos más vendidos" sub="Unidades (leído del detalle de cada pedido)">
              <div className="flex flex-col gap-1.5">
                {r.top.map(([nombre, v]) => <Barra key={nombre} etiqueta={nombre} valor={v} max={maxProd} texto={`${n(v)} u.`} />)}
                {r.top.length === 0 && <p className="text-sm text-muted-fg">Sin datos.</p>}
              </div>
            </Bloque>
            <Bloque titulo="Embudo de compra" sub="Carritos que llegaron al checkout vs. pedidos hechos por clientes (ambas sedes)">
              <p className="text-sm text-coal">
                <strong>{n(r.checkouts)}</strong> llegaron al checkout · <strong>{n(r.pedidosCliente)}</strong> pedidos
                {abandono !== null && <> · <strong>{abandono}%</strong> no terminó</>}
              </p>
            </Bloque>
          </div>
        </div>
      )}
    </div>
  )
}
