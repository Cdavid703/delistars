import { useEffect, useState } from 'react'
import { Loader, AlertCircle, Plus, X, Edit, Trash2 } from 'lucide-react'
import { apiService, type Producto, type Categoria } from '../services/api'

const Productos = () => {
  const [productos, setProductos] = useState<Producto[]>([])
  const [categorias, setCategorias] = useState<Categoria[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false)
  const [isEditModalOpen, setIsEditModalOpen] = useState(false)
  const [isSaving, setIsSaving] = useState(false)
  const [selectedProducto, setSelectedProducto] = useState<Producto | null>(null)
  const [isDeleteConfirmOpen, setIsDeleteConfirmOpen] = useState(false)
  const [productoToDelete, setProductoToDelete] = useState<Producto | null>(null)
  const [deleteConfirmText, setDeleteConfirmText] = useState('')
  const [isCreateCategoriaModalOpen, setIsCreateCategoriaModalOpen] = useState(false)
  const [newCategoriaName, setNewCategoriaName] = useState('')
  const [formData, setFormData] = useState({
    nombre_producto: '',
    descripcion_producto: '',
    precio_venta: '',
    id_categoria: '',
    image_url1: '',
    image_url2: ''
  })

  const fetchData = async () => {
    try {
      setLoading(true)
      setError(null)
      const [productosData, categoriasData] = await Promise.all([
        apiService.getProductos(),
        apiService.getCategories()
      ])
      setProductos(productosData)
      setCategorias(categoriasData)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error al cargar datos')
      console.error('Error:', err)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchData()
  }, [])

  const getNombreCategoria = (id: number): string => {
    const categoria = categorias.find(c => c.id_categoria === id)
    return categoria?.nombre_categoria || `Categoría ${id}`
  }

  const formatPrecio = (precio: number | string): string => {
    const numPrecio = typeof precio === 'string' ? parseInt(precio, 10) : precio
    return new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', minimumFractionDigits: 0 }).format(numPrecio).replace('$', '').trim()
  }

  const handleCreateClick = () => {
    setFormData({
      nombre_producto: '',
      descripcion_producto: '',
      precio_venta: '',
      id_categoria: '',
      image_url1: '',
      image_url2: ''
    })
    setError(null)
    setIsCreateModalOpen(true)
  }

  const handleCloseModal = () => {
    setIsCreateModalOpen(false)
    setFormData({
      nombre_producto: '',
      descripcion_producto: '',
      precio_venta: '',
      id_categoria: '',
      image_url1: '',
      image_url2: ''
    })
    setError(null)
  }

  const handleFormChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => {
    const { name, value } = e.target
    setFormData(prev => ({
      ...prev,
      [name]: value
    }))
  }

  const validateForm = (): string[] => {
    const errors: string[] = []
    if (!formData.nombre_producto || formData.nombre_producto.trim() === '') {
      errors.push('El nombre es requerido')
    }
    if (!formData.descripcion_producto || formData.descripcion_producto.trim() === '') {
      errors.push('La descripción es requerida')
    }
    if (!formData.precio_venta || formData.precio_venta.trim() === '') {
      errors.push('El precio es requerido')
    }
    if (Number(formData.precio_venta) <= 0) {
      errors.push('El precio debe ser mayor a 0')
    }
    if (!formData.id_categoria || formData.id_categoria.trim() === '') {
      errors.push('La categoría es requerida')
    }
    return errors
  }

  const handleCreateProducto = async () => {
    try {
      const validationErrors = validateForm()
      if (validationErrors.length > 0) {
        setError(validationErrors.join(', '))
        return
      }

      setIsSaving(true)
      const newProducto = await apiService.createProducto({
        nombre_producto: formData.nombre_producto,
        descripcion_producto: formData.descripcion_producto,
        precio_venta: Number(formData.precio_venta),
        id_categoria: Number(formData.id_categoria),
        image_url1: formData.image_url1 || undefined,
        image_url2: formData.image_url2 || undefined
      })
      
      setProductos(prevProductos => [...prevProductos, newProducto])
      handleCloseModal()
      setError(null)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error al crear el producto')
      console.error('Error:', err)
    } finally {
      setIsSaving(false)
    }
  }

  const handleOpenEditModal = (producto: Producto) => {
    setSelectedProducto(producto)
    setFormData({
      nombre_producto: producto.nombre_producto,
      descripcion_producto: producto.descripcion_producto,
      precio_venta: producto.precio_venta.toString(),
      id_categoria: producto.id_categoria.toString(),
      image_url1: producto.image_url1 || '',
      image_url2: producto.image_url2 || ''
    })
    setError(null)
    setIsEditModalOpen(true)
  }

  const handleCloseEditModal = () => {
    setIsEditModalOpen(false)
    setSelectedProducto(null)
    setFormData({
      nombre_producto: '',
      descripcion_producto: '',
      precio_venta: '',
      id_categoria: '',
      image_url1: '',
      image_url2: ''
    })
    setError(null)
  }

  const handleUpdateProducto = async () => {
    if (!selectedProducto) return

    try {
      const validationErrors = validateForm()
      if (validationErrors.length > 0) {
        setError(validationErrors.join(', '))
        return
      }

      setIsSaving(true)
      await apiService.updateProducto(selectedProducto.id_producto, {
        nombre_producto: formData.nombre_producto,
        descripcion_producto: formData.descripcion_producto,
        precio_venta: Number(formData.precio_venta),
        id_categoria: Number(formData.id_categoria),
        image_url1: formData.image_url1 || undefined,
        image_url2: formData.image_url2 || undefined
      })
      
      // Actualizar el estado con los datos editados inmediatamente
      const productoActualizado: Producto = {
        ...selectedProducto,
        nombre_producto: formData.nombre_producto,
        descripcion_producto: formData.descripcion_producto,
        precio_venta: Number(formData.precio_venta),
        id_categoria: Number(formData.id_categoria),
        image_url1: formData.image_url1 || undefined,
        image_url2: formData.image_url2 || undefined
      }
      
      setProductos(prevProductos => 
        prevProductos.map(p => p.id_producto === selectedProducto.id_producto ? productoActualizado : p)
      )
      handleCloseEditModal()
      setError(null)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error al actualizar el producto')
      console.error('Error:', err)
    } finally {
      setIsSaving(false)
    }
  }

  const handleOpenDeleteConfirm = (producto: Producto) => {
    setProductoToDelete(producto)
    setDeleteConfirmText('')
    setIsDeleteConfirmOpen(true)
    setError(null)
  }

  const handleCloseDeleteConfirm = () => {
    setIsDeleteConfirmOpen(false)
    setProductoToDelete(null)
    setDeleteConfirmText('')
  }

  const handleConfirmDelete = async () => {
    if (!productoToDelete) return
    
    if (deleteConfirmText.toLowerCase() !== 'confirmar') {
      setError('Debes escribir "confirmar" para eliminar el producto')
      return
    }

    try {
      setIsSaving(true)
      await apiService.deleteProducto(productoToDelete.id_producto)
      setProductos(prevProductos => 
        prevProductos.filter(p => p.id_producto !== productoToDelete.id_producto)
      )
      handleCloseDeleteConfirm()
      setError(null)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error al eliminar el producto')
      console.error('Error:', err)
    } finally {
      setIsSaving(false)
    }
  }

  const handleOpenCreateCategoriaModal = () => {
    setNewCategoriaName('')
    setIsCreateCategoriaModalOpen(true)
    setError(null)
  }

  const handleCloseCreateCategoriaModal = () => {
    setIsCreateCategoriaModalOpen(false)
    setNewCategoriaName('')
  }

  const handleCreateCategoria = async () => {
    if (!newCategoriaName.trim()) {
      setError('El nombre de la categoría es requerido')
      return
    }

    try {
      setIsSaving(true)
      const newCategoria = await apiService.createCategoria(newCategoriaName.trim())
      setCategorias(prevCategorias => [...prevCategorias, newCategoria])
      handleCloseCreateCategoriaModal()
      setError(null)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error al crear la categoría')
      console.error('Error:', err)
    } finally {
      setIsSaving(false)
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-96">
        <div className="flex flex-col items-center gap-2">
          <Loader className="w-8 h-8 animate-spin text-primary" />
          <p className="text-muted-fg">Cargando productos...</p>
        </div>
      </div>
    )
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-4xl font-display font-bold text-coal">Gestión de Productos</h1>
          <p className="text-muted-fg mt-1">Administra tu catálogo de productos</p>
        </div>
        <div className="flex gap-3">
          <button
            onClick={handleOpenCreateCategoriaModal}
            className="flex items-center gap-2 bg-accent hover:bg-tangelo text-white font-medium py-2.5 px-4 rounded-lg transition-colors shadow-soft"
          >
            <Plus className="w-5 h-5" />
            Nueva Categoría
          </button>
          <button
            onClick={handleCreateClick}
            className="flex items-center gap-2 bg-primary hover:bg-primary-dark text-white font-medium py-2.5 px-4 rounded-lg transition-colors shadow-soft"
          >
            <Plus className="w-5 h-5" />
            Nuevo Producto
          </button>
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

      {productos.length === 0 ? (
        <div className="bg-white border border-gray-200 rounded-lg p-8 text-center">
          <div className="text-6xl mb-4">📋</div>
          <p className="text-lg font-medium text-coal mb-2">No hay productos registrados</p>
          <p className="text-muted-fg">Agrega nuevos productos a tu catálogo</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {productos.map((producto) => (
            <div key={producto.id_producto} className="bg-white border border-gray-200 rounded-lg overflow-hidden hover:shadow-lg transition-shadow flex flex-col">
              {producto.image_url1 ? (
                <div className="h-48 bg-gray-200 overflow-hidden">
                  <img 
                    src={producto.image_url1} 
                    alt={producto.nombre_producto}
                    className="w-full h-full object-cover"
                  />
                </div>
              ) : (
                <div className="h-48 bg-gray-100 flex items-center justify-center">
                  <span className="text-gray-400 text-4xl">🖼️</span>
                </div>
              )}
              
              <div className="p-4 flex-grow flex flex-col">
                <h3 className="font-semibold text-coal text-lg mb-2 line-clamp-2">{producto.nombre_producto}</h3>
                
                <p className="text-muted-fg text-sm mb-4 line-clamp-2 flex-grow">{producto.descripcion_producto}</p>
                
                <div className="flex items-center justify-between mb-4">
                  <span className="text-2xl font-bold text-primary">${formatPrecio(producto.precio_venta)}</span>
                  <span className="text-xs bg-gray-100 text-gray-600 px-3 py-1 rounded-full">
                    {getNombreCategoria(producto.id_categoria)}
                  </span>
                </div>

                <div className="flex gap-2">
                  <button 
                    onClick={() => handleOpenEditModal(producto)}
                    className="flex-1 flex items-center justify-center gap-2 text-primary hover:text-primary-dark font-medium py-2 px-3 border border-primary rounded-lg hover:bg-primary hover:text-white transition-colors"
                  >
                    <Edit className="w-4 h-4" />
                    Editar
                  </button>
                  <button 
                    onClick={() => handleOpenDeleteConfirm(producto)}
                    className="flex-1 flex items-center justify-center gap-2 text-red-600 hover:text-red-700 font-medium py-2 px-3 border border-red-300 rounded-lg hover:bg-red-50 transition-colors">
                    <Trash2 className="w-4 h-4" />
                    Eliminar
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Modal de Creación */}
      {isCreateModalOpen && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg shadow-lg max-w-md w-full max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between p-6 border-b border-gray-200 sticky top-0 bg-white">
              <h2 className="text-xl font-bold text-coal">Crear Nuevo Producto</h2>
              <button
                onClick={handleCloseModal}
                className="text-gray-400 hover:text-gray-600 transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-6 space-y-4">
              <div>
                <label className="block text-sm font-medium text-coal mb-1">Nombre del Producto *</label>
                <input
                  type="text"
                  name="nombre_producto"
                  value={formData.nombre_producto}
                  onChange={handleFormChange}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary"
                  placeholder="ej: Pizza Margarita"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-coal mb-1">Descripción *</label>
                <textarea
                  name="descripcion_producto"
                  value={formData.descripcion_producto}
                  onChange={handleFormChange}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary"
                  placeholder="ej: Pizza con tomate, mozzarella y albahaca"
                  rows={3}
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-coal mb-1">Precio (en pesos) *</label>
                <input
                  type="number"
                  name="precio_venta"
                  value={formData.precio_venta}
                  onChange={handleFormChange}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary"
                  placeholder="ej: 20000"
                  min="0"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-coal mb-1">Categoría *</label>
                <select
                  name="id_categoria"
                  value={formData.id_categoria}
                  onChange={handleFormChange}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary"
                >
                  <option value="">Selecciona una categoría</option>
                  {categorias.map(cat => (
                    <option key={cat.id_categoria} value={cat.id_categoria}>
                      {cat.nombre_categoria}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-coal mb-1">URL Imagen 1 (Opcional)</label>
                <input
                  type="text"
                  name="image_url1"
                  value={formData.image_url1}
                  onChange={handleFormChange}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary"
                  placeholder="https://ejemplo.com/imagen1.jpg"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-coal mb-1">URL Imagen 2 (Opcional)</label>
                <input
                  type="text"
                  name="image_url2"
                  value={formData.image_url2}
                  onChange={handleFormChange}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary"
                  placeholder="https://ejemplo.com/imagen2.jpg"
                />
              </div>

              <div className="text-xs text-muted-fg">* Campos requeridos</div>

              <div className="flex gap-3 pt-4">
                <button
                  onClick={handleCloseModal}
                  className="flex-1 px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors font-medium"
                >
                  Cancelar
                </button>
                <button
                  onClick={handleCreateProducto}
                  disabled={isSaving}
                  className="flex-1 px-4 py-2 bg-primary text-white rounded-lg hover:bg-primary-dark transition-colors font-medium disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                >
                  {isSaving ? (
                    <>
                      <Loader className="w-4 h-4 animate-spin" />
                      Creando...
                    </>
                  ) : (
                    'Crear Producto'
                  )}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Modal de Edición */}
      {isEditModalOpen && selectedProducto && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg shadow-lg max-w-md w-full max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between p-6 border-b border-gray-200 sticky top-0 bg-white">
              <h2 className="text-xl font-bold text-coal flex items-center gap-2">
                <Edit className="w-5 h-5" />
                Editar Producto
              </h2>
              <button
                onClick={handleCloseEditModal}
                className="text-gray-400 hover:text-gray-600 transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-6 space-y-4">
              <div>
                <p className="text-sm font-medium text-coal mb-2">Producto: <span className="text-primary font-semibold">{selectedProducto.nombre_producto}</span></p>
              </div>

              <div>
                <label className="block text-sm font-medium text-coal mb-1">Nombre del Producto</label>
                <input
                  type="text"
                  name="nombre_producto"
                  value={formData.nombre_producto}
                  onChange={handleFormChange}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary"
                  placeholder="ej: Pizza Margarita"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-coal mb-1">Descripción</label>
                <textarea
                  name="descripcion_producto"
                  value={formData.descripcion_producto}
                  onChange={handleFormChange}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary"
                  placeholder="ej: Pizza con tomate, mozzarella y albahaca"
                  rows={3}
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-coal mb-1">Precio (en pesos)</label>
                <input
                  type="number"
                  name="precio_venta"
                  value={formData.precio_venta}
                  onChange={handleFormChange}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary"
                  placeholder="ej: 20000"
                  min="0"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-coal mb-1">Categoría</label>
                <select
                  name="id_categoria"
                  value={formData.id_categoria}
                  onChange={handleFormChange}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary"
                >
                  <option value="">Selecciona una categoría</option>
                  {categorias.map(cat => (
                    <option key={cat.id_categoria} value={cat.id_categoria}>
                      {cat.nombre_categoria}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-coal mb-1">URL Imagen 1 (Opcional)</label>
                <input
                  type="text"
                  name="image_url1"
                  value={formData.image_url1}
                  onChange={handleFormChange}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary"
                  placeholder="https://ejemplo.com/imagen1.jpg"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-coal mb-1">URL Imagen 2 (Opcional)</label>
                <input
                  type="text"
                  name="image_url2"
                  value={formData.image_url2}
                  onChange={handleFormChange}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary"
                  placeholder="https://ejemplo.com/imagen2.jpg"
                />
              </div>

              <div className="flex gap-3 pt-4">
                <button
                  onClick={handleCloseEditModal}
                  className="flex-1 px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors font-medium"
                >
                  Cancelar
                </button>
                <button
                  onClick={handleUpdateProducto}
                  disabled={isSaving}
                  className="flex-1 px-4 py-2 bg-primary text-white rounded-lg hover:bg-primary-dark transition-colors font-medium disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                >
                  {isSaving ? (
                    <>
                      <Loader className="w-4 h-4 animate-spin" />
                      Guardando...
                    </>
                  ) : (
                    'Guardar Cambios'
                  )}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Modal de Confirmación de Eliminación */}
      {isDeleteConfirmOpen && productoToDelete && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg shadow-lg max-w-md w-full">
            <div className="flex items-center justify-between p-6 border-b border-gray-200">
              <h2 className="text-xl font-bold text-coal flex items-center gap-2">
                <AlertCircle className="w-5 h-5 text-red-600" />
                Eliminar Producto
              </h2>
              <button
                onClick={handleCloseDeleteConfirm}
                className="text-gray-400 hover:text-gray-600 transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-6 space-y-4">
              <div>
                <p className="text-gray-700 mb-2">
                  ¿Estás seguro de que deseas eliminar el producto?
                </p>
                <p className="text-lg font-semibold text-primary mb-4">
                  {productoToDelete.nombre_producto}
                </p>
              </div>

              <div>
                <p className="text-sm text-gray-600 mb-2">
                  Para confirmar, escribe la palabra <strong>"confirmar"</strong>:
                </p>
                <input
                  type="text"
                  value={deleteConfirmText}
                  onChange={(e) => setDeleteConfirmText(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-red-500"
                  placeholder="confirmar"
                  onKeyPress={(e) => {
                    if (e.key === 'Enter' && deleteConfirmText.toLowerCase() === 'confirmar') {
                      handleConfirmDelete()
                    }
                  }}
                />
              </div>

              <div className="flex gap-3 pt-4">
                <button
                  onClick={handleCloseDeleteConfirm}
                  className="flex-1 px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors font-medium"
                >
                  Cancelar
                </button>
                <button
                  onClick={handleConfirmDelete}
                  disabled={isSaving || deleteConfirmText.toLowerCase() !== 'confirmar'}
                  className="flex-1 px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors font-medium disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                >
                  {isSaving ? (
                    <>
                      <Loader className="w-4 h-4 animate-spin" />
                      Eliminando...
                    </>
                  ) : (
                    'Eliminar'
                  )}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Modal de Crear Nueva Categoría */}
      {isCreateCategoriaModalOpen && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg shadow-lg max-w-md w-full">
            <div className="flex items-center justify-between p-6 border-b border-gray-200">
              <h2 className="text-xl font-bold text-coal">Crear Nueva Categoría</h2>
              <button
                onClick={handleCloseCreateCategoriaModal}
                className="text-gray-400 hover:text-gray-600 transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-6 space-y-4">
              <div>
                <label className="block text-sm font-medium text-coal mb-1">Nombre de la Categoría *</label>
                <input
                  type="text"
                  value={newCategoriaName}
                  onChange={(e) => setNewCategoriaName(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary"
                  placeholder="ej: Pizzas"
                  onKeyPress={(e) => {
                    if (e.key === 'Enter') {
                      handleCreateCategoria()
                    }
                  }}
                />
              </div>

              <div className="flex gap-3 pt-4">
                <button
                  onClick={handleCloseCreateCategoriaModal}
                  className="flex-1 px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors font-medium"
                >
                  Cancelar
                </button>
                <button
                  onClick={handleCreateCategoria}
                  disabled={isSaving}
                  className="flex-1 px-4 py-2 bg-accent text-white rounded-lg hover:bg-tangelo transition-colors font-medium disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                >
                  {isSaving ? (
                    <>
                      <Loader className="w-4 h-4 animate-spin" />
                      Creando...
                    </>
                  ) : (
                    'Crear Categoría'
                  )}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

export default Productos
