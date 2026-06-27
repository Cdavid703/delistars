import { useEffect, useState } from 'react'
import { Plus, Loader, AlertCircle, X, Lock } from 'lucide-react'
import { apiService, type Trabajador } from '../services/api'

const Trabajadores = () => {
  const [trabajadores, setTrabajadores] = useState<Trabajador[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false)
  const [isChangePasswordModalOpen, setIsChangePasswordModalOpen] = useState(false)
  const [isSaving, setIsSaving] = useState(false)
  const [selectedTrabajador, setSelectedTrabajador] = useState<Trabajador | null>(null)
  const [formData, setFormData] = useState<Trabajador>({
    nombre_trabajador: '',
    apellido_trabajador: '',
    usuario: '',
    usuario_password: ''
  })
  const [newPassword, setNewPassword] = useState('')

  const fetchTrabajadores = async () => {
    try {
      setLoading(true)
      setError(null)
      const data = await apiService.getTrabajadores()
      setTrabajadores(data)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error al cargar trabajadores')
      console.error('Error:', err)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchTrabajadores()
  }, [])

  const handleCreateClick = () => {
    setFormData({
      nombre_trabajador: '',
      apellido_trabajador: '',
      usuario: '',
      usuario_password: ''
    })
    setIsCreateModalOpen(true)
  }

  const handleCloseModal = () => {
    setIsCreateModalOpen(false)
    setFormData({
      nombre_trabajador: '',
      apellido_trabajador: '',
      usuario: '',
      usuario_password: ''
    })
  }

  const handleOpenChangePasswordModal = (trabajador: Trabajador) => {
    setSelectedTrabajador(trabajador)
    setNewPassword('')
    setIsChangePasswordModalOpen(true)
  }

  const handleCloseChangePasswordModal = () => {
    setIsChangePasswordModalOpen(false)
    setSelectedTrabajador(null)
    setNewPassword('')
  }

  const handleChangePassword = async () => {
    if (!selectedTrabajador || !selectedTrabajador.id_trabajador) return

    const passwordErrors: string[] = []
    if (!newPassword || newPassword.trim() === '') {
      passwordErrors.push('La contraseña es requerida')
    }
    if (newPassword && newPassword.length < 6) {
      passwordErrors.push('La contraseña debe tener al menos 6 caracteres')
    }

    if (passwordErrors.length > 0) {
      setError(passwordErrors.join(', '))
      return
    }

    try {
      setIsSaving(true)
      await apiService.changePassword(selectedTrabajador.id_trabajador, newPassword)
      handleCloseChangePasswordModal()
      setError(null)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error al cambiar la contraseña')
      console.error('Error:', err)
    } finally {
      setIsSaving(false)
    }
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
    if (!formData.nombre_trabajador || formData.nombre_trabajador.trim() === '') {
      errors.push('El nombre es requerido')
    }
    if (!formData.apellido_trabajador || formData.apellido_trabajador.trim() === '') {
      errors.push('El apellido es requerido')
    }
    if (!formData.usuario || formData.usuario.trim() === '') {
      errors.push('El usuario es requerido')
    }
    if (!formData.usuario_password || formData.usuario_password.trim() === '') {
      errors.push('La contraseña es requerida')
    }
    if (formData.usuario_password && formData.usuario_password.length < 6) {
      errors.push('La contraseña debe tener al menos 6 caracteres')
    }
    return errors
  }

  const handleCreateTrabajador = async () => {
    try {
      const validationErrors = validateForm()
      if (validationErrors.length > 0) {
        setError(validationErrors.join(', '))
        return
      }

      setIsSaving(true)
      const newTrabajador = await apiService.createTrabajador(formData)
      
      setTrabajadores(prevTrabajadores => [...prevTrabajadores, newTrabajador])
      handleCloseModal()
      setError(null)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error al crear el trabajador')
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
          <p className="text-muted-fg">Cargando trabajadores...</p>
        </div>
      </div>
    )
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-4xl font-display font-bold text-coal">Gestión de Trabajadores</h1>
          <p className="text-muted-fg mt-1">Administra tu equipo de empleados</p>
        </div>
        <button
          onClick={handleCreateClick}
          className="flex items-center gap-2 bg-primary hover:bg-primary-dark text-white font-medium py-2.5 px-4 rounded-lg transition-colors shadow-soft"
        >
          <Plus className="w-5 h-5" />
          Nuevo Empleado
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

      {trabajadores.length === 0 ? (
        <div className="bg-white border border-gray-200 rounded-lg p-8 text-center">
          <div className="text-6xl mb-4">👥</div>
          <p className="text-lg font-medium text-coal mb-2">No hay trabajadores registrados</p>
          <p className="text-muted-fg">Agrega un nuevo empleado para comenzar</p>
        </div>
      ) : (
        <div className="bg-white border border-gray-200 rounded-lg overflow-hidden">
          <table className="w-full">
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr>
                <th className="px-6 py-3 text-left text-sm font-semibold text-coal">Nombre</th>
                <th className="px-6 py-3 text-left text-sm font-semibold text-coal">Apellido</th>
                <th className="px-6 py-3 text-left text-sm font-semibold text-coal">Usuario</th>
                <th className="px-6 py-3 text-left text-sm font-semibold text-coal">Acciones</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200">
              {trabajadores.map((trabajador) => (
                <tr key={trabajador.id_trabajador} className="hover:bg-gray-50 transition-colors">
                  <td className="px-6 py-4 text-sm font-medium text-coal">{trabajador.nombre_trabajador}</td>
                  <td className="px-6 py-4 text-sm text-muted-fg">{trabajador.apellido_trabajador}</td>
                  <td className="px-6 py-4 text-sm text-muted-fg">{trabajador.usuario}</td>
                  <td className="px-6 py-4 text-sm">
                    <button 
                      onClick={() => handleOpenChangePasswordModal(trabajador)}
                      className="text-primary hover:text-primary-dark font-medium mr-4 transition-colors flex items-center gap-1 inline-flex"
                    >
                      <Lock className="w-4 h-4" />
                      Cambiar Contraseña
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

      {/* Modal de Cambiar Contraseña */}
      {isChangePasswordModalOpen && selectedTrabajador && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg shadow-lg max-w-md w-full">
            <div className="flex items-center justify-between p-6 border-b border-gray-200">
              <h2 className="text-xl font-bold text-coal flex items-center gap-2">
                <Lock className="w-5 h-5" />
                Cambiar Contraseña
              </h2>
              <button
                onClick={handleCloseChangePasswordModal}
                className="text-gray-400 hover:text-gray-600 transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-6 space-y-4">
              <div>
                <p className="text-sm font-medium text-coal mb-4">Trabajador: <span className="text-primary font-semibold">{selectedTrabajador.nombre_trabajador} {selectedTrabajador.apellido_trabajador}</span></p>
              </div>

              <div>
                <label className="block text-sm font-medium text-coal mb-1">Nueva Contraseña *</label>
                <input
                  type="password"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary"
                  placeholder="Mín. 6 caracteres"
                />
              </div>

              <div className="text-xs text-muted-fg">* Mínimo 6 caracteres</div>

              <div className="flex gap-3 pt-4">
                <button
                  onClick={handleCloseChangePasswordModal}
                  className="flex-1 px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors font-medium"
                >
                  Cancelar
                </button>
                <button
                  onClick={handleChangePassword}
                  disabled={isSaving}
                  className="flex-1 px-4 py-2 bg-primary text-white rounded-lg hover:bg-primary-dark transition-colors font-medium disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                >
                  {isSaving ? (
                    <>
                      <Loader className="w-4 h-4 animate-spin" />
                      Cambiando...
                    </>
                  ) : (
                    'Cambiar Contraseña'
                  )}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Modal de Creación */}
      {isCreateModalOpen && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg shadow-lg max-w-md w-full max-h-96 overflow-y-auto">
            <div className="flex items-center justify-between p-6 border-b border-gray-200 sticky top-0 bg-white">
              <h2 className="text-xl font-bold text-coal">Crear Nuevo Empleado</h2>
              <button
                onClick={handleCloseModal}
                className="text-gray-400 hover:text-gray-600 transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-6 space-y-4">
              <div>
                <label className="block text-sm font-medium text-coal mb-1">Nombre *</label>
                <input
                  type="text"
                  name="nombre_trabajador"
                  value={formData.nombre_trabajador}
                  onChange={handleFormChange}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary"
                  placeholder="ej: Juan"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-coal mb-1">Apellido *</label>
                <input
                  type="text"
                  name="apellido_trabajador"
                  value={formData.apellido_trabajador}
                  onChange={handleFormChange}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary"
                  placeholder="ej: Pérez"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-coal mb-1">Usuario *</label>
                <input
                  type="text"
                  name="usuario"
                  value={formData.usuario}
                  onChange={handleFormChange}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary"
                  placeholder="ej: jperez"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-coal mb-1">Contraseña *</label>
                <input
                  type="password"
                  name="usuario_password"
                  value={formData.usuario_password}
                  onChange={handleFormChange}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary"
                  placeholder="Mín. 6 caracteres"
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
                  onClick={handleCreateTrabajador}
                  disabled={isSaving}
                  className="flex-1 px-4 py-2 bg-primary text-white rounded-lg hover:bg-primary-dark transition-colors font-medium disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                >
                  {isSaving ? (
                    <>
                      <Loader className="w-4 h-4 animate-spin" />
                      Creando...
                    </>
                  ) : (
                    'Crear Empleado'
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

export default Trabajadores
