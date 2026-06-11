import { useEffect, useState } from 'react'
import { Plus, Loader, AlertCircle, X } from 'lucide-react'
import { apiService, type Sede } from '../services/api'

const Sedes = () => {
  const [sedes, setSedes] = useState<Sede[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [isEditModalOpen, setIsEditModalOpen] = useState(false)
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false)
  const [editingSede, setEditingSede] = useState<Sede | null>(null)
  const [isSaving, setIsSaving] = useState(false)
  const [formData, setFormData] = useState<Partial<Sede>>({
    nombre_sede: '',
    telefono_sede: '',
    direccion_sede: '',
    horario_lunes_jueves: '',
    horario_viernes: '',
    horario_sabado: '',
    horario_domingo: ''
  })

  const fetchSedes = async () => {
    try {
      setLoading(true)
      setError(null)
      const data = await apiService.getSedes()
      setSedes(data)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error al cargar las sedes')
      console.error('Error:', err)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchSedes()
  }, [])

  const handleEditClick = (sede: Sede) => {
    setEditingSede(sede)
    setFormData(sede)
    setIsEditModalOpen(true)
  }

  const handleCreateClick = () => {
    setFormData({
      nombre_sede: '',
      telefono_sede: '',
      direccion_sede: '',
      horario_lunes_jueves: '',
      horario_viernes: '',
      horario_sabado: '',
      horario_domingo: ''
    })
    setIsCreateModalOpen(true)
  }

  const handleCloseModal = () => {
    setIsEditModalOpen(false)
    setIsCreateModalOpen(false)
    setEditingSede(null)
    setFormData({})
  }

  const handleFormChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target
    setFormData(prev => ({
      ...prev,
      [name]: value
    }))
  }

  const validateForm = (): string[] => {
    const errors: string[] = []
    if (!formData.nombre_sede || formData.nombre_sede.trim() === '') {
      errors.push('El nombre de la sede es requerido')
    }
    if (!formData.telefono_sede || formData.telefono_sede.trim() === '') {
      errors.push('El teléfono es requerido')
    }
    if (!formData.direccion_sede || formData.direccion_sede.trim() === '') {
      errors.push('La dirección es requerida')
    }
    if (!formData.horario_lunes_jueves || formData.horario_lunes_jueves.trim() === '') {
      errors.push('El horario L-J es requerido')
    }
    if (!formData.horario_viernes || formData.horario_viernes.trim() === '') {
      errors.push('El horario viernes es requerido')
    }
    if (!formData.horario_sabado || formData.horario_sabado.trim() === '') {
      errors.push('El horario sábado es requerido')
    }
    if (!formData.horario_domingo || formData.horario_domingo.trim() === '') {
      errors.push('El horario domingo es requerido')
    }
    return errors
  }

  const handleSaveChanges = async () => {
    if (!editingSede?.id_sede) return

    try {
      const validationErrors = validateForm()
      if (validationErrors.length > 0) {
        setError(validationErrors.join(', '))
        return
      }

      setIsSaving(true)
      await apiService.updateSede(String(editingSede.id_sede), formData as Sede)
      
      setSedes(prevSedes =>
        prevSedes.map(sede =>
          sede.id_sede === editingSede.id_sede
            ? { ...sede, ...formData }
            : sede
        )
      )
      
      handleCloseModal()
      setError(null)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error al guardar cambios')
      console.error('Error:', err)
    } finally {
      setIsSaving(false)
    }
  }

  const handleCreateSede = async () => {
    try {
      const validationErrors = validateForm()
      if (validationErrors.length > 0) {
        setError(validationErrors.join(', '))
        return
      }

      setIsSaving(true)
      const newSede = await apiService.createSede(formData as Sede)
      
      setSedes(prevSedes => [...prevSedes, newSede])
      handleCloseModal()
      setError(null)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error al crear la sede')
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
          <p className="text-muted-fg">Cargando sedes...</p>
        </div>
      </div>
    )
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-4xl font-display font-bold text-coal">Gestión de Sedes</h1>
          <p className="text-muted-fg mt-1">Administra tus sucursales</p>
        </div>
        <button
          onClick={handleCreateClick}
          className="flex items-center gap-2 bg-primary hover:bg-primary-dark text-white font-medium py-2.5 px-4 rounded-lg transition-colors shadow-soft"
        >
          <Plus className="w-5 h-5" />
          Nueva Sede
        </button>
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

      {sedes.length === 0 ? (
        <div className="bg-white border border-gray-200 rounded-lg p-8 text-center">
          <div className="text-6xl mb-4">📍</div>
          <p className="text-lg font-medium text-coal mb-2">No hay sedes disponibles</p>
          <p className="text-muted-fg">Crea una nueva sede para comenzar</p>
        </div>
      ) : (
        <div className="bg-white border border-gray-200 rounded-lg overflow-hidden">
          <table className="w-full">
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr>
                <th className="px-6 py-3 text-left text-sm font-semibold text-coal">Nombre</th>
                <th className="px-6 py-3 text-left text-sm font-semibold text-coal">Teléfono</th>
                <th className="px-6 py-3 text-left text-sm font-semibold text-coal">Dirección</th>
                <th className="px-6 py-3 text-left text-sm font-semibold text-coal">Acciones</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200">
              {sedes.map((sede) => (
                <tr key={sede.id_sede} className="hover:bg-gray-50 transition-colors">
                  <td className="px-6 py-4 text-sm font-medium text-coal">{sede.nombre_sede}</td>
                  <td className="px-6 py-4 text-sm text-muted-fg">{sede.telefono_sede}</td>
                  <td className="px-6 py-4 text-sm text-muted-fg">{sede.direccion_sede}</td>
                  <td className="px-6 py-4 text-sm">
                    <button
                      onClick={() => handleEditClick(sede)}
                      className="text-primary hover:text-primary-dark font-medium mr-4 transition-colors"
                    >
                      Editar
                    </button>
                    <button className="text-red-600 hover:text-red-700 font-medium transition-colors">
                      Eliminar
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Modal de Creación */}
      {isCreateModalOpen && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg shadow-lg max-w-md w-full max-h-96 overflow-y-auto">
            <div className="flex items-center justify-between p-6 border-b border-gray-200 sticky top-0 bg-white">
              <h2 className="text-xl font-bold text-coal">Crear Nueva Sede</h2>
              <button
                onClick={handleCloseModal}
                className="text-gray-400 hover:text-gray-600 transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-6 space-y-4">
              <div>
                <label className="block text-sm font-medium text-coal mb-1">Nombre Sede *</label>
                <input
                  type="text"
                  name="nombre_sede"
                  value={formData.nombre_sede || ''}
                  onChange={handleFormChange}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary"
                  placeholder="ej: Sede Centro"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-coal mb-1">Teléfono *</label>
                <input
                  type="text"
                  name="telefono_sede"
                  value={formData.telefono_sede || ''}
                  onChange={handleFormChange}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary"
                  placeholder="ej: (123) 456-7890"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-coal mb-1">Dirección *</label>
                <input
                  type="text"
                  name="direccion_sede"
                  value={formData.direccion_sede || ''}
                  onChange={handleFormChange}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary"
                  placeholder="ej: Calle Principal 123"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-coal mb-1">Horario L-J *</label>
                <input
                  type="text"
                  name="horario_lunes_jueves"
                  value={formData.horario_lunes_jueves || ''}
                  onChange={handleFormChange}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary"
                  placeholder="ej: 10:00 - 22:00"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-coal mb-1">Horario Viernes *</label>
                <input
                  type="text"
                  name="horario_viernes"
                  value={formData.horario_viernes || ''}
                  onChange={handleFormChange}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary"
                  placeholder="ej: 10:00 - 23:00"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-coal mb-1">Horario Sábado *</label>
                <input
                  type="text"
                  name="horario_sabado"
                  value={formData.horario_sabado || ''}
                  onChange={handleFormChange}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary"
                  placeholder="ej: 10:00 - 23:00"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-coal mb-1">Horario Domingo *</label>
                <input
                  type="text"
                  name="horario_domingo"
                  value={formData.horario_domingo || ''}
                  onChange={handleFormChange}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary"
                  placeholder="ej: 11:00 - 22:00"
                />
              </div>

              <div className="text-xs text-muted-fg">* Todos los campos son requeridos</div>

              <div className="flex gap-3 pt-4">
                <button
                  onClick={handleCloseModal}
                  className="flex-1 px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors font-medium"
                >
                  Cancelar
                </button>
                <button
                  onClick={handleCreateSede}
                  disabled={isSaving}
                  className="flex-1 px-4 py-2 bg-primary text-white rounded-lg hover:bg-primary-dark transition-colors font-medium disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                >
                  {isSaving ? (
                    <>
                      <Loader className="w-4 h-4 animate-spin" />
                      Creando...
                    </>
                  ) : (
                    'Crear Sede'
                  )}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Modal de Edición */}
      {isEditModalOpen && editingSede && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg shadow-lg max-w-md w-full max-h-96 overflow-y-auto">
            <div className="flex items-center justify-between p-6 border-b border-gray-200 sticky top-0 bg-white">
              <h2 className="text-xl font-bold text-coal">Editar Sede</h2>
              <button
                onClick={handleCloseModal}
                className="text-gray-400 hover:text-gray-600 transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-6 space-y-4">
              <div>
                <label className="block text-sm font-medium text-coal mb-1">Nombre Sede</label>
                <input
                  type="text"
                  name="nombre_sede"
                  value={formData.nombre_sede || ''}
                  onChange={handleFormChange}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-coal mb-1">Teléfono</label>
                <input
                  type="text"
                  name="telefono_sede"
                  value={formData.telefono_sede || ''}
                  onChange={handleFormChange}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-coal mb-1">Dirección</label>
                <input
                  type="text"
                  name="direccion_sede"
                  value={formData.direccion_sede || ''}
                  onChange={handleFormChange}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-coal mb-1">Horario L-J</label>
                <input
                  type="text"
                  name="horario_lunes_jueves"
                  value={formData.horario_lunes_jueves || ''}
                  onChange={handleFormChange}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary"
                  placeholder="ej: 10:00 - 22:00"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-coal mb-1">Horario Viernes</label>
                <input
                  type="text"
                  name="horario_viernes"
                  value={formData.horario_viernes || ''}
                  onChange={handleFormChange}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary"
                  placeholder="ej: 10:00 - 23:00"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-coal mb-1">Horario Sábado</label>
                <input
                  type="text"
                  name="horario_sabado"
                  value={formData.horario_sabado || ''}
                  onChange={handleFormChange}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary"
                  placeholder="ej: 10:00 - 23:00"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-coal mb-1">Horario Domingo</label>
                <input
                  type="text"
                  name="horario_domingo"
                  value={formData.horario_domingo || ''}
                  onChange={handleFormChange}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary"
                  placeholder="ej: 11:00 - 22:00"
                />
              </div>

              <div className="flex gap-3 pt-4">
                <button
                  onClick={handleCloseModal}
                  className="flex-1 px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors font-medium"
                >
                  Cancelar
                </button>
                <button
                  onClick={handleSaveChanges}
                  disabled={isSaving}
                  className="flex-1 px-4 py-2 bg-primary text-white rounded-lg hover:bg-primary-dark transition-colors font-medium disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                >
                  {isSaving ? (
                    <>
                      <Loader className="w-4 h-4 animate-spin" />
                      Guardando...
                    </>
                  ) : (
                    'Guardar cambios'
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

export default Sedes
