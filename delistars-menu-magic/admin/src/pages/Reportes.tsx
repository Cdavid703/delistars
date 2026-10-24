import { useEffect, useMemo, useState } from 'react'
import { collection, onSnapshot, query, orderBy, limit } from 'firebase/firestore'
import { FileSpreadsheet, FileText, Info, RefreshCw } from 'lucide-react'
import { db } from '@/services/firebase'
import { type Order, fmtCOP } from '@/lib/orders'
import { informeSemana, ultimasSemanas, etiquetaSemana, pesosPorKm, type FilaKm, type PedidoKm } from '@/lib/informeKm'
import { pedirReporte, periodo, tablasDe, exportarExcel, exportarPDF, pesos, SEDES, type Reporte, type Tabla } from '@/lib/reportes'

const DAY_MS = 24 * 60 * 60 * 1000

const Bar = ({ label, value, max, display, color = 'bg-primary' }: {
  label: string; value: number; max: number; display: string; color?: string
}) => (
  <div className="flex items-center gap-2 text-sm">
    <span className="w-24 shrink-0 text-right text-muted-fg text-xs">{label}</span>
    <div className="flex-1 bg-gray-100 rounded-full h-4 overflow-hidden">
      <div className={`${color} h-4 rounded-full transition-all`} style={{ width: `${max > 0 ? (value / max) * 100 : 0}%` }} />
    </div>
    <span className="w-28 shrink-0 text-xs text-coal font-medium">{display}</span>
  </div>
)

const Card = ({ title, subtitle, children }: { title: string; subtitle?: string; children: React.ReactNode }) => (
  <div className="bg-white border border-gray-200 rounded-lg p-4 min-w-0">
    <p className="font-display font-semibold text-coal">{title}</p>
    {subtitle && <p className="text-xs text-muted-fg mb-3">{subtitle}</p>}
    {!subtitle && <div className="mb-3" />}
    {children}
  </div>
)

const Kpi = ({ label, valor, nota, tono = 'text-coal' }: { label: string; valor: string; nota?: string; tono?: string }) => (
  <div className="bg-white border border-gray-200 rounded-lg p-4">
    <p className="text-sm text-muted-fg">{label}</p>
    <p className={`text-2xl font-display font-bold ${tono}`}>{valor}</p>
    {nota && <p className="text-xs text-muted-fg mt-0.5">{nota}</p>}
  </div>
)

function TablaReporte({ t }: { t: Tabla }) {
  return (
    <Card title={t.titulo}>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-xs text-muted-fg border-b border-gray-200">
              {t.columnas.map((c, i) => <th key={c} className={`py-1.5 px-2 font-medium ${i ? 'text-right' : ''}`}>{c}</th>)}
            </tr>
          </thead>
          <tbody>
            {t.filas.map((f, i) => (
              <tr key={i} className="border-b border-gray-100 last:border-0">
                {f.map((c, j) => <td key={j} className={`py-1.5 px-2 ${j ? 'text-right tabular-nums' : 'text-coal whitespace-pre'}`}>{c}</td>)}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Card>
  )
}

// Reportes aprobados (especificación §16.3): los calcula el servidor con los
// filtros de fecha (Bogotá) y sede; Excel y PDF salen con los mismos filtros.
function ReportesAprobados() {
  const [{ desde, hasta }, setRango] = useState(() => periodo('7'))
  const [sede, setSede] = useState('')
  const [rep, setRep] = useState<Reporte | null>(null)
  const [cargando, setCargando] = useState(false)
  const [error, setError] = useState('')
  const [exportando, setExportando] = useState('')
  const [verFormulas, setVerFormulas] = useState(false)
  const [vuelta, setVuelta] = useState(0)

  useEffect(() => {
    let vivo = true
    setCargando(true); setError('')
    pedirReporte(desde, hasta, sede)
      .then((r) => { if (vivo) setRep(r) })
      .catch((e) => { if (vivo) { setRep(null); setError(e.message) } })
      .finally(() => { if (vivo) setCargando(false) })
    return () => { vivo = false }
  }, [desde, hasta, sede, vuelta])

  const tablas = useMemo(() => (rep ? tablasDe(rep) : []), [rep])
  const grupos = useMemo(() => [...new Set(tablas.map((t) => t.grupo))], [tablas])
  const exportar = async (cual: 'excel' | 'pdf') => {
    if (!rep) return
    setExportando(cual)
    try { await (cual === 'excel' ? exportarExcel(rep) : exportarPDF(rep)) } finally { setExportando('') }
  }
  const atajos: [Parameters<typeof periodo>[0], string][] = [['hoy', 'Hoy'], ['ayer', 'Ayer'], ['7', '7 días'], ['30', '30 días'], ['mes', 'Este mes'], ['mesPasado', 'Mes pasado']]
  const f = rep?.financiero
  const maxDia = Math.max(1, ...(rep?.demanda.porFecha.map((d) => d.ventas) ?? [0]))
  const horas = rep?.demanda.porHora.filter((h) => h.pedidos) ?? []
  const maxHora = Math.max(1, ...horas.map((h) => h.pedidos))

  return (
    <div className="flex flex-col gap-6">
      <div className="bg-white border border-gray-200 rounded-lg p-4 flex flex-col gap-3">
        <div className="flex flex-wrap gap-2">
          {atajos.map(([k, l]) => {
            const p = periodo(k)
            const activo = p.desde === desde && p.hasta === hasta
            return (
              <button key={k} onClick={() => setRango(p)}
                className={`px-3 py-1.5 rounded-full text-sm border ${activo ? 'bg-coal text-white border-coal' : 'border-gray-300 text-coal hover:bg-gray-50'}`}>{l}</button>
            )
          })}
        </div>
        <div className="flex flex-wrap items-end gap-3">
          <label className="text-xs text-muted-fg flex flex-col gap-1">Desde
            <input type="date" value={desde} max={hasta} onChange={(e) => e.target.value && setRango({ desde: e.target.value, hasta })}
              className="border border-gray-300 rounded-md px-2 py-1.5 text-sm text-coal" />
          </label>
          <label className="text-xs text-muted-fg flex flex-col gap-1">Hasta
            <input type="date" value={hasta} min={desde} onChange={(e) => e.target.value && setRango({ desde, hasta: e.target.value })}
              className="border border-gray-300 rounded-md px-2 py-1.5 text-sm text-coal" />
          </label>
          <label className="text-xs text-muted-fg flex flex-col gap-1">Sede
            <select value={sede} onChange={(e) => setSede(e.target.value)} className="border border-gray-300 rounded-md px-2 py-1.5 text-sm text-coal">
              <option value="">Las dos sedes</option>
              {Object.entries(SEDES).map(([id, n]) => <option key={id} value={id}>{n}</option>)}
            </select>
          </label>
          <button onClick={() => setVuelta((n) => n + 1)} disabled={cargando} className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md border border-gray-300 text-sm text-coal hover:bg-gray-50 disabled:opacity-50">
            <RefreshCw size={14} className={cargando ? 'animate-spin' : ''} aria-hidden="true" /> Actualizar
          </button>
          <div className="flex gap-2 ml-auto">
            <button onClick={() => exportar('excel')} disabled={!rep || !!exportando} className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-mint text-white text-sm disabled:opacity-50">
              <FileSpreadsheet size={15} aria-hidden="true" /> {exportando === 'excel' ? 'Preparando…' : 'Excel'}
            </button>
            <button onClick={() => exportar('pdf')} disabled={!rep || !!exportando} className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-coal text-white text-sm disabled:opacity-50">
              <FileText size={15} aria-hidden="true" /> {exportando === 'pdf' ? 'Preparando…' : 'PDF'}
            </button>
          </div>
        </div>
        {error && <p className="text-sm text-red-600">{error}</p>}
        {rep?.avisos.map((a) => <p key={a} className="text-xs text-muted-fg">{a}</p>)}
      </div>

      {!rep && cargando && <p className="text-sm text-muted-fg">Armando el reporte…</p>}

      {rep && f && (
        <div className={`flex flex-col gap-6 transition-opacity ${cargando ? 'opacity-50' : ''}`}>
          <div className="grid grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-4">
            <Kpi label="Ventas" valor={pesos(f.ventas.total)} nota={`${f.pedidos.entregados} pedidos entregados`} tono="text-mint" />
            <Kpi label="Ticket promedio" valor={pesos(f.ventas.ticketPromedio)} />
            <Kpi label="Domicilios cobrados" valor={pesos(f.ventas.domicilios)} tono="text-tangelo" />
            <Kpi label="Cancelados y rechazados" valor={String(f.pedidos.cancelados + f.pedidos.rechazados)} nota={`de ${f.pedidos.total} recibidos`} />
            <Kpi label="Cobros pendientes" valor={pesos(f.pendientes.efectivoPorCuadrar.monto + f.pendientes.transferenciasSinVerificar.monto)}
              nota={`${f.pendientes.efectivoPorCuadrar.pedidos + f.pendientes.transferenciasSinVerificar.pedidos} pedidos`} tono={f.pendientes.efectivoPorCuadrar.pedidos + f.pendientes.transferenciasSinVerificar.pedidos ? 'text-tangelo' : 'text-coal'} />
            <Kpi label="Diferencias sin resolver" valor={String(f.cuadres.diferenciasSinResolver)} nota={`neto ${pesos(f.cuadres.diferenciaNeta)}`} tono={f.cuadres.diferenciasSinResolver ? 'text-red-600' : 'text-coal'} />
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <Card title="Ventas por día" subtitle="Pedidos entregados, por la fecha en que se pidieron">
              {rep.demanda.porFecha.length === 0 ? <p className="text-sm text-muted-fg">Sin ventas en el período.</p> : (
                <div className="space-y-1.5">{rep.demanda.porFecha.map((d) => <Bar key={d.fecha} label={d.fecha.slice(5)} value={d.ventas} max={maxDia} display={`${fmtCOP(d.ventas)} (${d.pedidos})`} />)}</div>
              )}
            </Card>
            <Card title="Horas pico" subtitle="Pedidos entregados según la hora en que se pidieron">
              {horas.length === 0 ? <p className="text-sm text-muted-fg">Sin datos.</p> : (
                <div className="space-y-1.5">{horas.map((h) => <Bar key={h.hora} label={`${h.hora}:00`} value={h.pedidos} max={maxHora} display={`${h.pedidos} pedido${h.pedidos !== 1 ? 's' : ''}`} color="bg-mustard" />)}</div>
              )}
            </Card>
          </div>

          {grupos.map((g) => (
            <section key={g} className="flex flex-col gap-3">
              <h2 className="font-display text-lg font-semibold text-coal">{g}</h2>
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 items-start">
                {tablas.filter((t) => t.grupo === g).map((t) => <TablaReporte key={t.titulo} t={t} />)}
              </div>
            </section>
          ))}

          <div className="bg-white border border-gray-200 rounded-lg p-4">
            <button onClick={() => setVerFormulas((v) => !v)} className="flex items-center gap-2 text-sm font-medium text-coal">
              <Info size={15} aria-hidden="true" /> Cómo se calcula
            </button>
            {verFormulas && <ul className="mt-2 list-disc pl-5 text-xs text-muted-fg space-y-1">{rep.formulas.map((x) => <li key={x}>{x}</li>)}</ul>}
          </div>
        </div>
      )}
    </div>
  )
}

export default function Reportes() {
  // Pedidos recientes: solo para el embudo y los kilómetros de la semana.
  const [orders, setOrders] = useState<Order[]>([])
  const [days] = useState(14)
  useEffect(() => {
    const q = query(collection(db, 'orders'), orderBy('createdAt', 'desc'), limit(500))
    return onSnapshot(q, (snap) => {
      setOrders(snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<Order, 'id'>) })))
    }, (err) => console.error('Error al leer pedidos:', err))
  }, [])

  // Embudo: eventos "llegó al checkout" que escribe la app de domicilios.
  const [funnel, setFunnel] = useState<{ at?: { toDate?: () => Date } }[]>([])
  useEffect(() => {
    const q = query(collection(db, 'metrics_funnel'), orderBy('at', 'desc'), limit(2000))
    return onSnapshot(q, (snap) => setFunnel(snap.docs.map((d) => d.data() as { at?: { toDate?: () => Date } })), () => {})
  }, [])

  // Carritos que llegaron al checkout vs pedidos que el CLIENTE envió (los del
  // cajero se excluyen: no pasan por el checkout del cliente). Sin filtro de
  // sede: el embudo se mide global.
  const funnelStats = useMemo(() => {
    const cutoff = Date.now() - days * DAY_MS
    const checkouts = funnel.filter((e) => {
      const d = e.at?.toDate?.()
      return !!d && d.getTime() >= cutoff
    }).length
    const clientOrders = orders.filter((o) => {
      if ((o as unknown as { cashierId?: string }).cashierId) return false
      const d = o.createdAt?.toDate?.()
      return !!d && d.getTime() >= cutoff
    }).length
    const abandoned = Math.max(0, checkouts - clientOrders)
    const rate = checkouts > 0 ? Math.round((abandoned / checkouts) * 100) : null
    return { checkouts, clientOrders, abandoned, rate }
  }, [funnel, orders, days])

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-3xl sm:text-4xl font-display font-bold text-coal">Reportes</h1>
        <p className="text-muted-fg mt-1">Ventas, tiempos, productos, demanda, clientes, domicilios, cancelaciones y reclamos, con fechas de Bogotá.</p>
      </div>
      <ReportesAprobados />

      <h2 className="font-display text-lg font-semibold text-coal mt-10 mb-3">Otros</h2>
      {/* Embudo de carritos: checkout iniciado vs pedido enviado (todas las sedes) */}
      <div className="bg-white border border-gray-200 rounded-lg p-4 mb-6">
        <div className="flex flex-wrap items-center gap-x-6 gap-y-1">
          <p className="text-sm font-display font-semibold text-coal">🛒 Embudo de pedidos <span className="font-normal text-muted-fg">(todas las sedes)</span></p>
          <p className="text-sm text-muted-fg">Llegaron al checkout: <span className="font-bold text-coal">{funnelStats.checkouts}</span></p>
          <p className="text-sm text-muted-fg">Enviaron pedido: <span className="font-bold text-mint">{funnelStats.clientOrders}</span></p>
          <p className="text-sm text-muted-fg">
            Abandono:{' '}
            {funnelStats.rate === null
              ? <span className="text-muted-fg">sin datos aún</span>
              : <span className={`font-bold ${funnelStats.rate > 40 ? 'text-red-600' : 'text-coal'}`}>{funnelStats.abandoned} ({funnelStats.rate}%)</span>}
          </p>
        </div>
        <p className="text-xs text-muted-fg mt-1">Se mide desde que el cliente llega con su carrito al paso de dirección. Los datos se acumulan desde el 10 de julio de 2026.</p>
      </div>

      <KmSemana orders={orders} sede="" />
    </div>
  )
}

// ─── Kilómetros de la semana ────────────────────────────────────────────────
// Distancia por calle (Google) que guarda cada pedido. Sirve para pagarle
// justo al domiciliario y para ver qué zonas dejan menos por km.
function TablaKm({ titulo, filas }: { titulo: string; filas: FilaKm[] }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="text-left text-xs text-muted-fg border-b border-gray-200">
            <th className="py-1.5 pr-2 font-medium">{titulo}</th>
            <th className="py-1.5 px-2 font-medium text-right">Entregas</th>
            <th className="py-1.5 px-2 font-medium text-right">Km (ida)</th>
            <th className="py-1.5 px-2 font-medium text-right">Domicilio cobrado</th>
            <th className="py-1.5 pl-2 font-medium text-right">$/km</th>
          </tr>
        </thead>
        <tbody>
          {filas.map((f) => {
            const pk = pesosPorKm(f)
            return (
              <tr key={f.clave} className="border-b border-gray-100 last:border-0">
                <td className="py-1.5 pr-2 text-coal">{f.clave}</td>
                <td className="py-1.5 px-2 text-right">{f.entregas}</td>
                <td className="py-1.5 px-2 text-right">
                  {f.conKm ? f.km.toFixed(1) : '—'}
                  {f.conKm > 0 && f.conKm < f.entregas && (
                    <span className="text-[10px] text-muted-fg"> ({f.conKm} con km)</span>
                  )}
                </td>
                <td className="py-1.5 px-2 text-right">{fmtCOP(f.domicilio)}</td>
                <td className="py-1.5 pl-2 text-right">{pk === null ? '—' : fmtCOP(pk)}</td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}

function KmSemana({ orders, sede }: { orders: Order[]; sede: string }) {
  const semanas = useMemo(() => ultimasSemanas(4), [])
  const [idx, setIdx] = useState(0)
  const inf = useMemo(() => informeSemana(orders as PedidoKm[], semanas[idx], sede), [orders, semanas, idx, sede])
  const pk = pesosPorKm(inf.total)
  return (
    <Card title="Kilómetros de la semana" subtitle="Distancia por calle de cada domicilio entregado (de ida; con el regreso es cerca del doble)">
      <div className="flex flex-wrap items-center gap-3 mb-4">
        <select className="border border-gray-300 rounded-md px-2 py-1 text-sm" value={idx}
          onChange={(e) => setIdx(Number(e.target.value))}>
          {semanas.map((l, i) => <option key={l.getTime()} value={i}>Semana del {etiquetaSemana(l)}</option>)}
        </select>
        <span className="text-sm text-coal">
          <strong>{inf.total.entregas}</strong> domicilios · <strong>{inf.total.km.toFixed(1)} km</strong>
          {' '}· {fmtCOP(inf.total.domicilio)} cobrado{pk !== null && <> · {fmtCOP(pk)}/km</>}
        </span>
      </div>
      {inf.total.entregas === 0 ? (
        <p className="text-sm text-muted-fg">No hay domicilios entregados esa semana.</p>
      ) : (
        <div className="flex flex-col gap-5">
          {inf.total.conKm < inf.total.entregas && (
            <p className="text-xs text-muted-fg">
              {inf.total.entregas - inf.total.conKm} domicilio(s) sin distancia por calle (de antes del 9 de octubre,
              sin pin, o con precio de la caja): no suman km.
            </p>
          )}
          <TablaKm titulo="Domiciliario" filas={inf.porDomiciliario} />
          <TablaKm titulo="Barrio" filas={inf.porBarrio.slice(0, 15)} />
        </div>
      )}
    </Card>
  )
}
