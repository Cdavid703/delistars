import { create } from 'zustand'

const API_BASE_URL = import.meta.env.VITE_API_URL || '/api/v1'

interface User {
  id_trabajador: number
  nombre_trabajador: string
  apellido_trabajador: string
  usuario: string
}

interface AuthState {
  user: User | null
  loading: boolean
  login: (usuario: string, password: string) => Promise<void>
  logout: () => void
}

export const useAuthStore = create<AuthState>((set) => ({
  user: JSON.parse(sessionStorage.getItem('ds_admin_user') || 'null'),
  loading: false,

  login: async (usuario, password) => {
    set({ loading: true })
    try {
      const res = await fetch(`${API_BASE_URL}/trabajadores/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ usuario, usuario_password: password }),
      })
      const data = await res.json()
      if (!res.ok || !data.success) {
        throw new Error(data.message || 'Credenciales incorrectas')
      }
      sessionStorage.setItem('ds_admin_user', JSON.stringify(data.data))
      set({ user: data.data, loading: false })
    } catch (err: any) {
      set({ loading: false })
      throw err
    }
  },

  logout: () => {
    sessionStorage.removeItem('ds_admin_user')
    set({ user: null })
  },
}))
