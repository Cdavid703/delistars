import { useEffect, useState, useRef } from 'react'
import { apiService } from '../services/api'

const Dashboard = () => {
  const [totalVentas, setTotalVentas] = useState<number>(0)
  const [startDate, setStartDate] = useState<string | undefined>(undefined)
  const [endDate, setEndDate] = useState<string | undefined>(undefined)
  const [loadingTotal, setLoadingTotal] = useState(false)
  const [valorDomicilio, setValorDomicilio] = useState<number>(0)
  const [loadingDomicilio, setLoadingDomicilio] = useState(false)
  const [productCount, setProductCount] = useState<number>(0)
  const [ventasCount, setVentasCount] = useState<number>(0)
  const [loadingCount, setLoadingCount] = useState(false)

  const stats = [
    { label: 'Ventas Totales', value: totalVentas, icon: '💰', color: 'bg-primary' },
    { label: 'Órdenes', value: ventasCount, icon: '📦', color: 'bg-tangelo' },
    { label: 'Productos', value: productCount, icon: '🍔', color: 'bg-mustard' },
    { label: 'Valor Domicilio', value: valorDomicilio, icon: '🏠', color: 'bg-mint' },
  ]

  const formatCurrency = (n: number) => {
    return new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', minimumFractionDigits: 0 }).format(n)
  }

  // Ventas paginadas (infinite scroll)
  const [ventasList, setVentasList] = useState<any[]>([])
  const [page, setPage] = useState(0)
  const limit = 10
  const [loadingVentas, setLoadingVentas] = useState(false)
  const [hasMore, setHasMore] = useState(true)
  const sentinelRef = useRef<HTMLDivElement | null>(null)

  const formatPrecio = (precio: number | string): string => {
    const numPrecio = typeof precio === 'string' ? parseFloat(precio) : precio
    return new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', minimumFractionDigits: 0 }).format(numPrecio).replace('$', '').trim()
  }

  const formatFecha = (fecha: string): string => {
    return new Date(fecha).toLocaleString('es-CO', {
      year: 'numeric', month: 'short', day: '2-digit', hour: '2-digit', minute: '2-digit',
    })
  }

  const fetchVentasPage = async (p: number, reset = false, confirmed = true) => {
    try {
      setLoadingVentas(true)
      const offset = p * limit
      const data = await apiService.getVentas(startDate, endDate, limit, offset, confirmed)
      if (reset) {
        setVentasList(data)
      } else {
        setVentasList((prev) => [...prev, ...data])
      }
      if (!data || data.length < limit) setHasMore(false)
    } catch (err) {
      console.error('Error fetching ventas page:', err)
    } finally {
      setLoadingVentas(false)
    }
  }

  const fetchTotal = async (s?: string, e?: string, confirmed = true) => {
    try {
      setLoadingTotal(true)
      const res = await apiService.getVentasSummary(s, e, confirmed)
      setTotalVentas(res.total || 0)
    } catch (err) {
      console.error('Error fetching total ventas:', err)
    } finally {
      setLoadingTotal(false)
    }
  }

  const fetchDomicilio = async (s?: string, e?: string, confirmed = true) => {
    try {
      setLoadingDomicilio(true)
      const res = await apiService.getValorDomiciliosSummary(s, e, confirmed)
      setValorDomicilio(res.total || 0)
    } catch (err) {
      console.error('Error fetching valor_domicilio:', err)
    } finally {
      setLoadingDomicilio(false)
    }
  }

  const fetchProductCount = async () => {
    try {
      const prods = await apiService.getProductos()
      setProductCount(Array.isArray(prods) ? prods.length : 0)
    } catch (err) {
      console.error('Error fetching productos count:', err)
    }
  }

  const fetchCount = async (s?: string, e?: string, confirmed = true) => {
    try {
      setLoadingCount(true)
      const res = await apiService.getVentasCount(s, e, confirmed)
      setVentasCount(res.count || 0)
    } catch (err) {
      console.error('Error fetching ventas count:', err)
    } finally {
      setLoadingCount(false)
    }
  }

  useEffect(() => {
    fetchTotal()
    fetchDomicilio()
    fetchProductCount()
    fetchCount()
    // initial ventas
    setPage(0)
    setHasMore(true)
    fetchVentasPage(0, true)
  }, [])

  // When filters change, reset list and fetch
  useEffect(() => {
    setPage(0)
    setHasMore(true)
    fetchTotal(startDate, endDate)
    fetchDomicilio(startDate, endDate)
    fetchCount(startDate, endDate)
    fetchVentasPage(0, true)
  }, [startDate, endDate])

  // load more when page increments (except initial page 0 already loaded)
  useEffect(() => {
    if (page === 0) return
    fetchVentasPage(page)
  }, [page])

  // IntersectionObserver for infinite scroll
  useEffect(() => {
    if (!sentinelRef.current) return
    const obs = new IntersectionObserver((entries) => {
      const first = entries[0]
      if (first.isIntersecting && !loadingVentas && hasMore) {
        setPage((p) => p + 1)
      }
    }, { root: null, rootMargin: '200px', threshold: 0.1 })
    obs.observe(sentinelRef.current)
    return () => obs.disconnect()
  }, [sentinelRef.current, loadingVentas, hasMore])

  return (
    <div>
      <div className="mb-8">
        <h1 className="text-4xl font-display font-bold text-coal">Dashboard</h1>
        <p className="text-muted-fg mt-1">Bienvenido al panel de administración</p>
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-4 mb-8">
        {stats.map((stat) => (
          <div
            key={stat.label}
            className="bg-white border border-gray-200 rounded-lg p-6 hover:shadow-card transition-shadow"
          >
            <div className="flex items-start justify-between">
              <div>
                <p className="text-sm font-medium text-muted-fg mb-1">{stat.label}</p>
                <p className="text-3xl font-display font-bold text-coal">
                  {stat.label === 'Ventas Totales' ? (
                    loadingTotal ? 'Cargando...' : formatCurrency(stat.value as number)
                  ) : stat.label === 'Valor Domicilio' ? (
                    loadingDomicilio ? 'Cargando...' : formatCurrency(stat.value as number)
                  ) : stat.label === 'Órdenes' ? (
                    loadingCount ? 'Cargando...' : new Intl.NumberFormat('es-CO').format(stat.value as number)
                  ) : (
                    stat.value
                  )}
                </p>
              </div>
              <div className={`${stat.color} text-white rounded-lg p-3 text-xl`}>
                {stat.icon}
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Filtro por fecha */}
      <div className="mt-6 mb-8 bg-white border border-gray-200 rounded-lg p-4 flex items-center gap-4">
        <div className="flex items-center gap-2">
          <label className="text-sm text-muted-fg">Desde</label>
          <input type="date" value={startDate || ''} onChange={(e) => setStartDate(e.target.value || undefined)} className="border rounded px-2 py-1" />
        </div>
        <div className="flex items-center gap-2">
          <label className="text-sm text-muted-fg">Hasta</label>
          <input type="date" value={endDate || ''} onChange={(e) => setEndDate(e.target.value || undefined)} className="border rounded px-2 py-1" />
        </div>
        <div className="flex items-center gap-2 ml-auto">
          <button onClick={() => { const today = new Date().toISOString().slice(0,10); setStartDate(today); setEndDate(undefined); fetchTotal(today); fetchDomicilio(today); }} className="bg-primary text-white px-3 py-1 rounded">Hoy</button>
          <button onClick={() => { setStartDate(undefined); setEndDate(undefined); fetchTotal(); fetchDomicilio(); }} className="border px-3 py-1 rounded">Limpiar</button>
          <button onClick={() => { fetchTotal(startDate, endDate); fetchDomicilio(startDate, endDate); }} className="bg-primary/90 text-white px-3 py-1 rounded">Aplicar</button>
        </div>
      </div>

      {/* Charts Section */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 bg-white border border-gray-200 rounded-lg p-6">
          <h2 className="text-xl font-display font-semibold text-coal mb-4">Ventas Recientes</h2>
            <div className="space-y-3">
              {ventasList.length === 0 && !loadingVentas ? (
                <div className="text-center text-muted-fg py-6">No hay ventas para el rango seleccionado</div>
              ) : (
                ventasList.map((venta) => (
                  <div key={venta.id_venta} className="flex items-center justify-between py-3 border-b border-gray-100 last:border-0">
                    <div>
                      <p className="font-medium text-coal">Pedido #{venta.id_venta}</p>
                      <p className="text-sm text-muted-fg">{formatFecha(venta.fecha_venta)}</p>
                    </div>
                    <div className="text-right">
                      <p className="font-semibold text-primary">${formatPrecio(venta.total_venta)}</p>
                      <p className="text-xs text-muted-fg">Domicilio: <span className="font-medium text-coal">${formatPrecio(venta.valor_domicilio || 0)}</span></p>
                    </div>
                  </div>
                ))
              )}

              {loadingVentas && (
                <div className="text-center py-3">Cargando...</div>
              )}

              <div ref={sentinelRef} />
            </div>
        </div>

        <div className="bg-white border border-gray-200 rounded-lg p-6">
          <h2 className="text-xl font-display font-semibold text-coal mb-4">Acciones Rápidas</h2>
          <div className="space-y-3">
            <button className="w-full bg-primary hover:bg-primary-dark text-white font-medium py-2.5 px-4 rounded-lg transition-colors">
              + Nuevo Producto
            </button>
            <button className="w-full border border-primary text-primary hover:bg-primary/5 font-medium py-2.5 px-4 rounded-lg transition-colors">
              Ver Todas las Ventas
            </button>
            <button className="w-full border border-gray-300 text-coal hover:bg-gray-50 font-medium py-2.5 px-4 rounded-lg transition-colors">
              Gestionar Empleados
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

export default Dashboard
