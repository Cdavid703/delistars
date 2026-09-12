import { useEffect, useMemo, useState } from 'react'
import { collection, onSnapshot, query, orderBy, limit } from 'firebase/firestore'
import { db } from '@/services/firebase'
import { type Order, DELIVERED_STATUSES, isToday, fmtCOP, fmtDateTime, statusInfo, statusLabel } from '@/lib/orders'
import { OrderDetailModal } from '@/components/OrderDetailModal'
import { PageTabs } from '@/components/PageTabs'
import Cuadre from './Cuadre'
import PedidosPorRevisar from './PedidosPorRevisar'

const uniq = (arr: (string | undefined)[]) =>
  Array.from(new Set(arr.filter(Boolean) as string[])).sort((a, b) => a.localeCompare(b))

const deliveryLabel = (m?: string) =>
  m === 'pickup' ? 'Recoge en sede' : 'Domicilio'

const todayStr = () => {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

// ¿El pedido cae dentro del rango [desde, hasta] (ambos inclusive)? Cada
// límite es opcional: solo-desde = de ese día en adelante; solo-hasta = hasta
// ese día; desde=hasta = un solo día.
const inRange = (o: Order, desde: string, hasta: string) => {
  if (!o.createdAt?.toDate) return false
  const t = o.createdAt.toDate().getTime()
  if (desde && t < new Date(desde + 'T00:00:00').getTime()) return false
  if (hasta && t > new Date(hasta + 'T23:59:59.999').getTime()) return false
  return true
}

function DomiciliosPedidos() {
  const [orders, setOrders] = useState<Order[]>([])
  // Rango de fecha: Hoy/Todo, o un rango desde–hasta (un solo día = desde==hasta).
  const [soloHoy, setSoloHoy] = useState(true)
  const [desde, setDesde] = useState('')
  const [hasta, setHasta] = useState('')
  const [sede, setSede] = useState('')
  const [fStatus, setFStatus] = useState('all')
  const [fDriver, setFDriver] = useState('all')
  const [fPayment, setFPayment] = useState('all')
  const [fSearch, setFSearch] = useState('')
  const [exporting, setExporting] = useState(false)
  const [selectedId, setSelectedId] = useState<string | null>(null)

  useEffect(() => {
    const q = query(collection(db, 'orders'), orderBy('createdAt', 'desc'), limit(500))
    return onSnapshot(q, (snap) => {
      setOrders(snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<Order, 'id'>) })))
    }, (err) => console.error('Error al leer pedidos:', err))
  }, [])

  const rangoActivo = !!(desde || hasta)

  // Base por fecha/sede → alimenta las opciones de los desplegables.
  // El rango desde–hasta manda sobre el toggle Hoy/Todo.
  const base = useMemo(() => orders.filter((o) => {
    if (rangoActivo) { if (!inRange(o, desde, hasta)) return false }
    else if (soloHoy && !isToday(o.createdAt)) return false
    if (sede && o.sedeName !== sede) return false
    return true
  }), [orders, soloHoy, rangoActivo, desde, hasta, sede])

  const sedes = useMemo(() => uniq(orders.map((o) => o.sedeName)), [orders])
  const statusOptions = useMemo(() => uniq(base.map((o) => o.status)), [base])
  const driverOptions = useMemo(() => uniq(base.map((o) => o.driverName)), [base])
  const paymentOptions = useMemo(() => uniq(base.map((o) => o.payment)), [base])

  const filtered = base.filter((o) => {
    if (fStatus !== 'all' && o.status !== fStatus) return false
    if (fDriver !== 'all' && (o.driverName || '') !== fDriver) return false
    if (fPayment !== 'all' && (o.payment || '') !== fPayment) return false
    if (fSearch.trim()) {
      const q = fSearch.toLowerCase().trim()
      const hay = [o.orderNumber, o.name, o.clientName, o.fullAddress, o.driverName, o.cashierName]
        .map((v) => String(v || '').toLowerCase())
      if (!hay.some((v) => v.includes(q))) return false
    }
    return true
  })

  const activeFilters =
    (fStatus !== 'all' ? 1 : 0) + (fDriver !== 'all' ? 1 : 0) +
    (fPayment !== 'all' ? 1 : 0) + (fSearch.trim() ? 1 : 0)
  const clearFilters = () => { setFStatus('all'); setFDriver('all'); setFPayment('all'); setFSearch('') }

  const entregados = filtered.filter((o) => DELIVERED_STATUSES.includes(o.status))
  const ingresos = entregados.reduce((s, o) => s + (o.totalPrice || 0), 0)
  const domicilios = entregados.reduce((s, o) => s + (o.deliveryPrice || 0), 0)

  const exportExcel = async () => {
    setExporting(true)
    try {
      const ExcelJS = (await import('exceljs')).default
      const wb = new ExcelJS.Workbook()
      wb.creator = 'DeliStars'
      wb.created = new Date()

      const ws = wb.addWorksheet('Pedidos', { views: [{ state: 'frozen', ySplit: 1 }] })
      ws.columns = [
        { header: 'Número', key: 'num', width: 10 },
        { header: 'Fecha', key: 'fecha', width: 12 },
        { header: 'Hora', key: 'hora', width: 8 },
        { header: 'Sede', key: 'sede', width: 20 },
        { header: 'Cliente', key: 'cliente', width: 22 },
        { header: 'Dirección', key: 'dir', width: 38 },
        { header: 'Entrega', key: 'entrega', width: 16 },
        { header: 'Método pago', key: 'pago', width: 14 },
        { header: 'Domicilio', key: 'domi', width: 12, style: { numFmt: '"$"#,##0' } },
        { header: 'Total', key: 'total', width: 14, style: { numFmt: '"$"#,##0' } },
        { header: 'Estado', key: 'estado', width: 18 },
        { header: 'Domiciliario', key: 'driver', width: 20 },
        { header: 'Cajero', key: 'cajero', width: 20 },
        { header: 'Productos', key: 'items', width: 50 },
      ]

      filtered.forEach((o) => {
        const d = o.createdAt?.toDate ? o.createdAt.toDate() : null
        ws.addRow({
          num: o.orderNumber || '',
          fecha: d ? d.toLocaleDateString('es-CO') : '',
          hora: d ? d.toLocaleTimeString('es-CO', { hour: '2-digit', minute: '2-digit' }) : '',
          sede: o.sedeName || '',
          cliente: o.name || o.clientName || '',
          dir: o.deliveryMode === 'pickup' ? 'Recoge en sede' : (o.fullAddress || ''),
          entrega: deliveryLabel(o.deliveryMode),
          pago: o.payment || '',
          domi: o.deliveryPrice || 0,
          total: o.totalPrice || 0,
          estado: statusLabel(o.status),
          driver: o.driverName || '',
          cajero: o.cashierName || '',
          items: o.items || '',
        })
      })

      const header = ws.getRow(1)
      header.font = { bold: true, color: { argb: 'FFFFFFFF' } }
      header.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1A1A1A' } }
      header.alignment = { vertical: 'middle' }
      header.height = 20
      ws.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: ws.columns.length } }

      const totalDomi = filtered.reduce((s, o) => s + (o.deliveryPrice || 0), 0)
      const totalVenta = filtered.reduce((s, o) => s + (o.totalPrice || 0), 0)
      const totalRow = ws.addRow({ cliente: `TOTAL (${filtered.length} pedidos)`, domi: totalDomi, total: totalVenta })
      totalRow.font = { bold: true }
      totalRow.getCell('domi').numFmt = '"$"#,##0'
      totalRow.getCell('total').numFmt = '"$"#,##0'

      // Hoja Resumen: por domiciliario y por método de pago
      const rs = wb.addWorksheet('Resumen')
      rs.addRow(['Resumen del reporte']).font = { bold: true, size: 14 }
      rs.addRow([])
      rs.addRow(['Sede', sede || 'Todas'])
      rs.addRow(['Rango', rangoActivo ? `${desde || '…'} a ${hasta || 'hoy'}` : (soloHoy ? 'Hoy' : 'Todo (últimos 500)')])
      rs.addRow(['Filtros activos', activeFilters])
      rs.addRow(['Pedidos (filtrados)', filtered.length])
      rs.addRow(['Total consolidado', totalVenta]).getCell(2).numFmt = '"$"#,##0'
      rs.addRow(['(−) Domicilios cobrados', totalDomi]).getCell(2).numFmt = '"$"#,##0'
      const netoRow = rs.addRow(['(=) Venta sin domicilios', totalVenta - totalDomi])
      netoRow.font = { bold: true }
      netoRow.getCell(2).numFmt = '"$"#,##0'
      rs.addRow([])

      const byDriver = Object.entries(filtered.reduce((acc, o) => {
        const k = o.driverName || 'Sin asignar'
        acc[k] = acc[k] || { count: 0, fees: 0, total: 0 }
        acc[k].count++; acc[k].fees += (o.deliveryPrice || 0); acc[k].total += (o.totalPrice || 0)
        return acc
      }, {} as Record<string, { count: number; fees: number; total: number }>))
      rs.addRow(['Por domiciliario', 'Pedidos', 'Domicilios', 'Total']).font = { bold: true }
      byDriver.forEach(([name, v]) => {
        const r = rs.addRow([name, v.count, v.fees, v.total])
        r.getCell(3).numFmt = '"$"#,##0'; r.getCell(4).numFmt = '"$"#,##0'
      })
      rs.addRow([])

      const byPay = Object.entries(filtered.reduce((acc, o) => {
        const k = o.payment || 'Sin especificar'
        acc[k] = acc[k] || { count: 0, total: 0 }
        acc[k].count++; acc[k].total += (o.totalPrice || 0)
        return acc
      }, {} as Record<string, { count: number; total: number }>))
      rs.addRow(['Por método de pago', 'Pedidos', 'Total']).font = { bold: true }
      byPay.forEach(([name, v]) => {
        const r = rs.addRow([name, v.count, v.total])
        r.getCell(3).numFmt = '"$"#,##0'
      })
      rs.getColumn(1).width = 26; rs.getColumn(2).width = 12; rs.getColumn(3).width = 14; rs.getColumn(4).width = 14

      const buf = await wb.xlsx.writeBuffer()
      const blob = new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      const rangoTag = rangoActivo ? `${desde || 'inicio'}_a_${hasta || 'hoy'}` : new Date().toISOString().slice(0, 10)
      a.download = `delistars-reporte-${sede ? sede.replace(/\s+/g, '-') + '-' : ''}${rangoTag}.xlsx`
      a.click()
      URL.revokeObjectURL(url)
    } finally {
      setExporting(false)
    }
  }

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-3 mb-6">
        <div>
          <h1 className="text-3xl sm:text-4xl font-display font-bold text-coal">Domicilios</h1>
          <p className="text-muted-fg mt-1">Pedidos y reportes</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <select value={sede} onChange={(e) => setSede(e.target.value)} className="border rounded px-2 py-1 text-sm">
            <option value="">Todas las sedes</option>
            {sedes.map((s) => <option key={s} value={s}>{s}</option>)}
          </select>
          <div className="flex items-center gap-1 text-sm">
            <span className="text-muted-fg text-xs">Desde</span>
            <input
              type="date"
              value={desde}
              max={hasta || todayStr()}
              onChange={(e) => setDesde(e.target.value)}
              className="border rounded px-2 py-1 text-sm"
              title="Fecha inicial del rango"
            />
            <span className="text-muted-fg text-xs">Hasta</span>
            <input
              type="date"
              value={hasta}
              min={desde || undefined}
              max={todayStr()}
              onChange={(e) => setHasta(e.target.value)}
              className="border rounded px-2 py-1 text-sm"
              title="Fecha final del rango (déjala igual a Desde para un solo día)"
            />
          </div>
          <button
            onClick={() => { setDesde(''); setHasta(''); setSoloHoy(true) }}
            className={`px-3 py-1 rounded text-sm font-medium ${!rangoActivo && soloHoy ? 'bg-primary text-white' : 'border text-coal'}`}
          >
            Hoy
          </button>
          <button
            onClick={() => { setDesde(''); setHasta(''); setSoloHoy(false) }}
            className={`px-3 py-1 rounded text-sm font-medium ${!rangoActivo && !soloHoy ? 'bg-primary text-white' : 'border text-coal'}`}
          >
            Todo
          </button>
          <button
            onClick={exportExcel}
            disabled={exporting || filtered.length === 0}
            className="px-3 py-1 rounded text-sm font-semibold bg-mint text-white disabled:opacity-50"
          >
            {exporting ? 'Generando…' : '⬇️ Excel'}
          </button>
        </div>
      </div>

      {/* Filtros */}
      <div className="bg-white border border-gray-200 rounded-lg p-3 mb-6 flex flex-col gap-2">
        <div className="flex items-center justify-between">
          <p className="text-sm font-semibold text-coal">
            Filtros {activeFilters > 0 && <span className="bg-cherry text-white text-xs rounded-full px-1.5 py-0.5 ml-1">{activeFilters}</span>}
          </p>
          {activeFilters > 0 && (
            <button onClick={clearFilters} className="text-xs text-cherry hover:underline">Limpiar</button>
          )}
        </div>
        <input
          type="text"
          placeholder="Buscar por número, cliente, dirección, domiciliario o cajero…"
          value={fSearch}
          onChange={(e) => setFSearch(e.target.value)}
          className="border rounded px-3 py-2 text-sm w-full"
        />
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
          <select value={fStatus} onChange={(e) => setFStatus(e.target.value)} className="border rounded px-2 py-1.5 text-sm">
            <option value="all">Todos los estados</option>
            {statusOptions.map((s) => <option key={s} value={s}>{statusLabel(s)}</option>)}
          </select>
          <select value={fPayment} onChange={(e) => setFPayment(e.target.value)} className="border rounded px-2 py-1.5 text-sm">
            <option value="all">Todos los pagos</option>
            {paymentOptions.map((p) => <option key={p} value={p}>{p}</option>)}
          </select>
          <select value={fDriver} onChange={(e) => setFDriver(e.target.value)} className="border rounded px-2 py-1.5 text-sm">
            <option value="all">Todos los domiciliarios</option>
            {driverOptions.map((d) => <option key={d} value={d}>{d}</option>)}
          </select>
        </div>
      </div>

      {/* Resumen: total consolidado y, aparte, cuánto queda al descontar los
          domicilios (el domicilio no es venta de producto). */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        <div className="bg-white border border-gray-200 rounded-lg p-4">
          <p className="text-sm text-muted-fg">Pedidos</p>
          <p className="text-2xl font-display font-bold text-coal">{filtered.length}</p>
        </div>
        <div className="bg-white border border-gray-200 rounded-lg p-4">
          <p className="text-sm text-muted-fg">Total consolidado</p>
          <p className="text-2xl font-display font-bold text-mint">{fmtCOP(ingresos)}</p>
          <p className="text-[11px] text-muted-fg mt-0.5">Entregados, con domicilio incluido</p>
        </div>
        <div className="bg-white border border-gray-200 rounded-lg p-4">
          <p className="text-sm text-muted-fg">− Domicilios cobrados</p>
          <p className="text-2xl font-display font-bold text-tangelo">{fmtCOP(domicilios)}</p>
          <p className="text-[11px] text-muted-fg mt-0.5">Valor que se descuenta abajo</p>
        </div>
        <div className="bg-mint/10 border-2 border-mint/40 rounded-lg p-4">
          <p className="text-sm text-coal font-semibold">= Venta sin domicilios</p>
          <p className="text-2xl font-display font-bold text-coal">{fmtCOP(ingresos - domicilios)}</p>
          <p className="text-[11px] text-muted-fg mt-0.5">Solo productos</p>
        </div>
      </div>

      {/* Lista de pedidos */}
      {filtered.length === 0 ? (
        <p className="text-muted-fg">No hay pedidos para el filtro seleccionado.</p>
      ) : (
        <div className="space-y-3">
          {filtered.map((o) => {
            const s = statusInfo(o.status)
            return (
              <button
                key={o.id}
                onClick={() => setSelectedId(o.id)}
                className="bg-white border border-gray-200 rounded-lg p-4 w-full text-left hover:border-primary/40 hover:shadow-sm"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="font-semibold text-coal">
                      {o.orderNumber && <span className="text-cherry mr-2">#{o.orderNumber}</span>}
                      {o.name || o.clientName || '—'}
                      {o.sedeName && <span className="text-xs text-muted-fg font-normal ml-2">{o.sedeName}</span>}
                    </p>
                    <p className="text-sm text-muted-fg truncate">
                      {o.deliveryMode === 'pickup' ? '🏪 Recoge en sede' : (o.fullAddress || '—')}
                    </p>
                    <p className="text-xs text-muted-fg mt-0.5">
                      {fmtDateTime(o.createdAt)} · {o.payment || '—'}
                      {o.driverName && <span> · 🛵 {o.driverName}</span>}
                    </p>
                  </div>
                  <div className="text-right shrink-0">
                    <span className={`px-3 py-1 rounded-full text-xs font-semibold ${s.cls}`}>{s.label}</span>
                    {(o.totalPrice || 0) > 0 && (
                      <p className="font-display text-lg text-coal mt-1">{fmtCOP(o.totalPrice)}</p>
                    )}
                  </div>
                </div>
              </button>
            )
          })}
        </div>
      )}

      {/* Detalle: ver todo, editar o eliminar el pedido */}
      {selectedId && (() => {
        const selected = orders.find((o) => o.id === selectedId)
        return selected
          ? <OrderDetailModal order={selected} onClose={() => setSelectedId(null)} />
          : null
      })()}
    </div>
  )
}

// Sección "Domicilios" del panel: agrupa los pedidos, el cuadre de caja y los
// pedidos que quedaron abiertos (antes eran ítems separados del menú lateral,
// y la alerta de atascados vivía en el Resumen, donde no se podía gestionar).
export default function Domicilios() {
  const [tab, setTab] = useState('pedidos')
  const [porRevisar, setPorRevisar] = useState(0)

  // Contador para el badge de la pestaña: pedidos que siguen abiertos.
  useEffect(() => {
    const q = query(collection(db, 'orders'), orderBy('createdAt', 'desc'), limit(500))
    return onSnapshot(q, (snap) => {
      const abiertos = snap.docs.filter((d) =>
        ['pending', 'quoted', 'assigned', 'accepted', 'preparing', 'in_transit', 'arrived']
          .includes((d.data() as Order).status))
      setPorRevisar(abiertos.length)
    }, () => {})
  }, [])

  return (
    <div>
      <PageTabs
        tabs={[
          { key: 'pedidos', label: '🛵 Domicilios' },
          { key: 'cuadre',  label: '💵 Cuadre de caja' },
          { key: 'revisar', label: `⚠️ Por revisar${porRevisar > 0 ? ` (${porRevisar})` : ''}` },
        ]}
        active={tab}
        onChange={setTab}
      />
      {tab === 'pedidos' ? <DomiciliosPedidos />
        : tab === 'cuadre' ? <Cuadre />
        : <PedidosPorRevisar />}
    </div>
  )
}
