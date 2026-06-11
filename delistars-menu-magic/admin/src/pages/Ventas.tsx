import { useEffect, useState, useRef } from 'react'
import { Loader, AlertCircle, ChevronDown, ChevronUp, Check, X } from 'lucide-react'
import { apiService, type Producto } from '../services/api'

interface DetalleVenta {
  id_detalle_venta: number
  id_producto: number
  nombre_producto: string
  cantidad_producto: number
  valor_total_x_producto: number
  producto?: Producto
  adiciones?: DetalleVenta[]
}

interface Venta {
  id_venta: number
  fecha_venta: string
  id_trabajador: number
  id_sede: number
  total_venta: number
  valor_domicilio?: number
  pedido_confirmado: boolean
  detalles?: DetalleVenta[]
}

const ADDON_CATEGORY_ID = 5

const buildProductMap = (productos: Producto[]) => {
  return productos.reduce<Record<number, Producto>>((acc, producto) => {
    acc[producto.id_producto] = producto
    return acc
  }, {})
}

const groupDetallesByProducto = (detalles: DetalleVenta[], productosMap: Record<number, Producto>) => {
  const grouped: DetalleVenta[] = []
  let currentPrincipal: DetalleVenta | null = null

  for (const detalle of detalles) {
    const producto = productosMap[detalle.id_producto]
    const esAdicion = producto?.id_categoria === ADDON_CATEGORY_ID

    if (!esAdicion) {
      currentPrincipal = {
        ...detalle,
        producto,
        adiciones: [],
      }
      grouped.push(currentPrincipal)
      continue
    }

    if (currentPrincipal) {
      currentPrincipal.adiciones = [...(currentPrincipal.adiciones || []), { ...detalle, producto }]
      continue
    }

    grouped.push({
      ...detalle,
      producto,
      adiciones: [],
    })
  }

  return grouped
}

const getDetalleTotal = (detalle: DetalleVenta) => {
  const adicionesTotal = (detalle.adiciones || []).reduce((sum, adicion) => sum + Number(adicion.valor_total_x_producto || 0), 0)
  return Number(detalle.valor_total_x_producto || 0) + adicionesTotal
}

const Ventas = () => {
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [expandedVentaId, setExpandedVentaId] = useState<number | null>(null)
  const [loadingDetalles, setLoadingDetalles] = useState<number | null>(null)
  const [confirmingId, setConfirmingId] = useState<number | null>(null)
  const [cancelingId, setCancelingId] = useState<number | null>(null)

  // Date filters and paginated list (infinite scroll)
  const [startDate, setStartDate] = useState<string | undefined>(undefined)
  const [endDate, setEndDate] = useState<string | undefined>(undefined)
  const [ventasList, setVentasList] = useState<Venta[]>([])
  const [page, setPage] = useState(0)
  const limit = 10
  const [loadingVentas, setLoadingVentas] = useState(false)
  const [hasMore, setHasMore] = useState(true)
  const sentinelRef = useRef<HTMLDivElement | null>(null)
  const [productMap, setProductMap] = useState<Record<number, Producto>>({})

  useEffect(() => {
    const loadProducts = async () => {
      try {
        const productos = await apiService.getProductos()
        setProductMap(buildProductMap(productos))
      } catch (err) {
        console.error('Error loading products:', err)
      }
    }

    loadProducts()
  }, [])

  const fetchVentasPage = async (p: number, reset = false) => {
    try {
      setLoadingVentas(true)
      setError(null)
      const offset = p * limit
      const ventasData = await apiService.getVentas(startDate, endDate, limit, offset)
      if (reset) setVentasList(ventasData)
      else setVentasList((prev) => [...prev, ...ventasData])
      if (!ventasData || ventasData.length < limit) setHasMore(false)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error al cargar ventas')
      console.error('Error:', err)
    } finally {
      setLoadingVentas(false)
      setLoading(false)
    }
  }

  useEffect(() => {
    // initial load
    setPage(0)
    setHasMore(true)
    setLoading(true)
    fetchVentasPage(0, true)
  }, [])

  // when filters change, reset and fetch
  useEffect(() => {
    setPage(0)
    setHasMore(true)
    fetchVentasPage(0, true)
  }, [startDate, endDate])

  // fetch when page increments
  useEffect(() => {
    if (page === 0) return
    fetchVentasPage(page)
  }, [page])

  // infinite scroll observer
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

  const handleExpandVenta = async (venta: Venta) => {
    if (expandedVentaId === venta.id_venta) {
      setExpandedVentaId(null)
      return
    }

    try {
      setLoadingDetalles(venta.id_venta)
      const ventaDetalles = await apiService.getVentaById(venta.id_venta)
      const productosMap = Object.keys(productMap).length > 0 ? productMap : buildProductMap(await apiService.getProductos())
      if (Object.keys(productMap).length === 0) {
        setProductMap(productosMap)
      }
      const detallesAgrupados = groupDetallesByProducto(ventaDetalles.detalles || [], productosMap)
      setVentasList(prevVentas =>
        prevVentas.map(v =>
          v.id_venta === venta.id_venta ? { ...v, detalles: detallesAgrupados } : v
        )
      )
      setExpandedVentaId(venta.id_venta)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error al cargar detalles')
      console.error('Error:', err)
    } finally {
      setLoadingDetalles(null)
    }
  }

  const handleConfirmarPedido = async (id: number) => {
    try {
      setConfirmingId(id)
      await apiService.confirmarPedido(id)
      setVentasList(prevVentas =>
        prevVentas.map(v =>
          v.id_venta === id ? { ...v, pedido_confirmado: true } : v
        )
      )
      setError(null)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error al confirmar pedido')
      console.error('Error:', err)
    } finally {
      setConfirmingId(null)
    }
  }

  const handleCancelarPedido = async (id: number) => {
    try {
      setCancelingId(id)
      await apiService.cancelarPedido(id)
      setVentasList(prevVentas =>
        prevVentas.map(v =>
          v.id_venta === id ? { ...v, pedido_confirmado: false } : v
        )
      )
      setError(null)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error al cancelar pedido')
      console.error('Error:', err)
    } finally {
      setCancelingId(null)
    }
  }

  const formatPrecio = (precio: number | string): string => {
    const numPrecio = typeof precio === 'string' ? parseInt(precio, 10) : precio
    return new Intl.NumberFormat('es-CO', { maximumFractionDigits: 0 }).format(numPrecio)
  }

  const formatFecha = (fecha: string): string => {
    return new Date(fecha).toLocaleString('es-CO', {
      year: 'numeric',
      month: 'short',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    })
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-96">
        <div className="flex flex-col items-center gap-2">
          <Loader className="w-8 h-8 animate-spin text-primary" />
          <p className="text-muted-fg">Cargando ventas...</p>
        </div>
      </div>
    )
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-4xl font-display font-bold text-coal">Gestión de Ventas</h1>
          <p className="text-muted-fg mt-1">Historial y seguimiento de pedidos</p>
        </div>
        <div className="flex items-center gap-3">
          <label className="text-sm text-muted-fg">Desde</label>
          <input type="date" value={startDate || ''} onChange={(e) => setStartDate(e.target.value || undefined)} className="border rounded px-2 py-1" />
          <label className="text-sm text-muted-fg">Hasta</label>
          <input type="date" value={endDate || ''} onChange={(e) => setEndDate(e.target.value || undefined)} className="border rounded px-2 py-1" />
          <button onClick={() => { setStartDate(new Date().toISOString().slice(0,10)); setEndDate(undefined); }} className="bg-primary text-white px-3 py-1 rounded">Hoy</button>
          <button onClick={() => { setStartDate(undefined); setEndDate(undefined); }} className="border px-3 py-1 rounded">Limpiar</button>
        </div>
      </div>

      {error ? (
        <div className="bg-red-50 border border-red-200 rounded-lg p-4 flex items-center gap-3 mb-4">
          <AlertCircle className="w-5 h-5 text-red-600" />
          <div>
            <p className="font-medium text-red-900">Error</p>
            <p className="text-red-700 text-sm">{error}</p>
          </div>
        </div>
      ) : null}

      {ventasList.length === 0 ? (
        <div className="bg-white border border-gray-200 rounded-lg p-8 text-center">
          <div className="text-6xl mb-4">📋</div>
          <p className="text-lg font-medium text-coal mb-2">No hay ventas registradas</p>
          <p className="text-muted-fg">Los pedidos aparecerán aquí</p>
        </div>
      ) : (
        <div className="space-y-4">
          {ventasList.map((venta) => (
            <div key={venta.id_venta} className="bg-white border border-gray-200 rounded-lg overflow-hidden">
              {/* Encabezado del Pedido */}
              <div className="p-4">
                <div className="flex items-center justify-between">
                  <div className="flex-1">
                    <div className="flex items-center gap-4">
                      <button
                        onClick={() => handleExpandVenta(venta)}
                        className="text-primary hover:text-primary-dark transition-colors"
                      >
                        {loadingDetalles === venta.id_venta ? (
                          <Loader className="w-5 h-5 animate-spin" />
                        ) : expandedVentaId === venta.id_venta ? (
                          <ChevronUp className="w-5 h-5" />
                        ) : (
                          <ChevronDown className="w-5 h-5" />
                        )}
                      </button>
                      <div>
                        <h3 className="font-semibold text-coal text-lg">Pedido #{venta.id_venta}</h3>
                        <p className="text-sm text-muted-fg">{formatFecha(venta.fecha_venta)}</p>
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center gap-4">
                    <div className="text-right">
                      <p className="text-2xl font-bold text-primary">$ {formatPrecio(venta.total_venta)}</p>
                      <p className="text-sm text-muted-fg">Domicilio: <span className="font-semibold">$ {formatPrecio(venta.valor_domicilio || 0)}</span></p>
                      <div
                        className={`inline-block px-3 py-1 rounded-full text-xs font-semibold ${
                          venta.pedido_confirmado
                            ? 'bg-green-100 text-green-700'
                            : 'bg-yellow-100 text-yellow-700'
                        }`}
                      >
                        {venta.pedido_confirmado ? '✓ Confirmado' : '⏳ Pendiente'}
                      </div>
                    </div>

                    <div className="flex gap-2">
                      {!venta.pedido_confirmado && (
                        <button
                          onClick={() => handleConfirmarPedido(venta.id_venta)}
                          disabled={confirmingId === venta.id_venta}
                          className="flex items-center justify-center gap-1 bg-green-600 hover:bg-green-700 text-white font-medium py-2 px-3 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                          {confirmingId === venta.id_venta ? (
                            <Loader className="w-4 h-4 animate-spin" />
                          ) : (
                            <Check className="w-4 h-4" />
                          )}
                          Confirmar
                        </button>
                      )}
                      {venta.pedido_confirmado && (
                        <button
                          onClick={() => handleCancelarPedido(venta.id_venta)}
                          disabled={cancelingId === venta.id_venta}
                          className="flex items-center justify-center gap-1 bg-red-600 hover:bg-red-700 text-white font-medium py-2 px-3 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                          {cancelingId === venta.id_venta ? (
                            <Loader className="w-4 h-4 animate-spin" />
                          ) : (
                            <X className="w-4 h-4" />
                          )}
                          Cancelar
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              </div>

              {/* Detalles del Pedido (Expandible) */}
              {expandedVentaId === venta.id_venta && venta.detalles && (
                <div className="border-t border-gray-200 bg-[#f8efe1] p-4">
                  <h4 className="font-semibold text-coal mb-4">Detalle del pedido</h4>
                  <div className="space-y-3">
                    {venta.detalles.map((detalle) => (
                      <div key={detalle.id_detalle_venta} className="flex gap-3 rounded-2xl border border-[#efe2cf] bg-[#fcf7ef] p-3 shadow-sm">
                        <div className="h-20 w-20 shrink-0 overflow-hidden rounded-xl bg-[#ead9be]">
                          {detalle.producto?.image_url1 ? (
                            <img
                              src={detalle.producto.image_url1}
                              alt={detalle.nombre_producto}
                              className="h-full w-full object-cover"
                            />
                          ) : (
                            <div className="flex h-full w-full items-center justify-center text-xl">🍔</div>
                          )}
                        </div>

                        <div className="min-w-0 flex-1">
                          <div className="flex items-start justify-between gap-3">
                            <div className="min-w-0">
                              <p className="truncate text-lg font-extrabold uppercase tracking-tight text-coal">
                                {detalle.nombre_producto || `Producto #${detalle.id_producto}`}
                              </p>
                              <p className="text-sm text-muted-fg">Cantidad: {detalle.cantidad_producto}</p>
                            </div>

                            <p className="shrink-0 text-right text-lg font-extrabold text-red-500">
                              $ {formatPrecio(getDetalleTotal(detalle))}
                            </p>
                          </div>

                          <div className="mt-2 space-y-1 text-sm text-coal/80">
                            <p className="font-medium text-muted-fg">Producto principal</p>
                            <p className="text-sm text-muted-fg">
                              Base: $ {formatPrecio(detalle.valor_total_x_producto)}
                            </p>
                            {detalle.adiciones && detalle.adiciones.length > 0 ? (
                              <p className="text-sm text-muted-fg">
                                + {detalle.adiciones.map((adicion) => adicion.nombre_producto || `Adición #${adicion.id_producto}`).join(', ')}
                              </p>
                            ) : (
                              <p className="text-sm text-muted-fg">Sin adiciones</p>
                            )}

                            {detalle.adiciones && detalle.adiciones.length > 0 ? (
                              <p className="text-sm font-semibold text-coal">
                                Total con adiciones: $ {formatPrecio(getDetalleTotal(detalle))}
                              </p>
                            ) : (
                              <p className="text-sm font-semibold text-coal">
                                Total: $ {formatPrecio(getDetalleTotal(detalle))}
                              </p>
                            )}
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          ))}
          {loadingVentas && (
            <div className="text-center py-3">Cargando más ventas...</div>
          )}
          <div ref={sentinelRef} />
        </div>
      )}
    </div>
  )
}

export default Ventas
