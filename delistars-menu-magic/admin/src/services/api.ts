const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:3000/api/v1';

export interface Sede {
  _id?: string;
  id_sede?: number;
  nombre_sede: string;
  telefono_sede: string;
  direccion_sede: string;
  horario_lunes_jueves?: string;
  horario_viernes?: string;
  horario_sabado?: string;
  horario_domingo?: string;
}

export interface Trabajador {
  id_trabajador?: number;
  nombre_trabajador: string;
  apellido_trabajador: string;
  usuario: string;
  usuario_password?: string;
}

export interface Producto {
  id_producto: number;
  nombre_producto: string;
  descripcion_producto: string;
  precio_venta: number;
  id_categoria: number;
  image_url1?: string;
  image_url2?: string;
  disponible?: boolean;
}

export interface Categoria {
  id_categoria: number;
  nombre_categoria: string;
}

export const apiService = {
  async getSedes(): Promise<Sede[]> {
    try {
      const response = await fetch(`${API_BASE_URL}/sedes`);
      if (!response.ok) throw new Error('Failed to fetch sedes');
      const data = await response.json();
      return Array.isArray(data) ? data : data.data || [];
    } catch (error) {
      console.error('Error fetching sedes:', error);
      throw error;
    }
  },

  async createSede(sede: Sede): Promise<Sede> {
    try {
      const response = await fetch(`${API_BASE_URL}/sedes`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(sede),
      });
      if (!response.ok) throw new Error('Failed to create sede');
      const data = await response.json();
      return data.data || data;
    } catch (error) {
      console.error('Error creating sede:', error);
      throw error;
    }
  },

  async updateSede(id: string, sede: Sede): Promise<Sede> {
    try {
      const response = await fetch(`${API_BASE_URL}/sedes/${id}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(sede),
      });
      if (!response.ok) throw new Error('Failed to update sede');
      const data = await response.json();
      return data.data || data;
    } catch (error) {
      console.error('Error updating sede:', error);
      throw error;
    }
  },

  async deleteSede(id: string): Promise<void> {
    try {
      const response = await fetch(`${API_BASE_URL}/sedes/${id}`, {
        method: 'DELETE',
      });
      if (!response.ok) throw new Error('Failed to delete sede');
    } catch (error) {
      console.error('Error deleting sede:', error);
      throw error;
    }
  },

  // Trabajadores
  async getTrabajadores(): Promise<Trabajador[]> {
    try {
      const response = await fetch(`${API_BASE_URL}/trabajadores`);
      if (!response.ok) throw new Error('Failed to fetch trabajadores');
      const data = await response.json();
      return data.data || [];
    } catch (error) {
      console.error('Error fetching trabajadores:', error);
      throw error;
    }
  },

  async createTrabajador(trabajador: Trabajador): Promise<Trabajador> {
    try {
      const response = await fetch(`${API_BASE_URL}/trabajadores`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(trabajador),
      });
      if (!response.ok) throw new Error('Failed to create trabajador');
      const data = await response.json();
      return data.data || data;
    } catch (error) {
      console.error('Error creating trabajador:', error);
      throw error;
    }
  },

  async updateTrabajador(id: number, trabajador: Partial<Trabajador>): Promise<Trabajador> {
    try {
      const response = await fetch(`${API_BASE_URL}/trabajadores/${id}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(trabajador),
      });
      if (!response.ok) throw new Error('Failed to update trabajador');
      const data = await response.json();
      return data.data || data;
    } catch (error) {
      console.error('Error updating trabajador:', error);
      throw error;
    }
  },

  async deleteTrabajador(id: number): Promise<void> {
    try {
      const response = await fetch(`${API_BASE_URL}/trabajadores/${id}`, {
        method: 'DELETE',
      });
      if (!response.ok) throw new Error('Failed to delete trabajador');
    } catch (error) {
      console.error('Error deleting trabajador:', error);
      throw error;
    }
  },

  async changePassword(id: number, newPassword: string): Promise<void> {
    try {
      const response = await fetch(`${API_BASE_URL}/trabajadores/${id}/cambiar-contraseña`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ usuario_password: newPassword }),
      });
      if (!response.ok) throw new Error('Failed to change password');
    } catch (error) {
      console.error('Error changing password:', error);
      throw error;
    }
  },

  // Productos
  async getProductos(): Promise<Producto[]> {
    try {
      const response = await fetch(`${API_BASE_URL}/products`);
      if (!response.ok) throw new Error('Failed to fetch productos');
      const data = await response.json();
      return data.data || [];
    } catch (error) {
      console.error('Error fetching productos:', error);
      throw error;
    }
  },

  async createProducto(producto: Omit<Producto, 'id_producto'>): Promise<Producto> {
    try {
      const response = await fetch(`${API_BASE_URL}/products`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(producto),
      });
      if (!response.ok) throw new Error('Failed to create producto');
      const data = await response.json();
      return data.data || data;
    } catch (error) {
      console.error('Error creating producto:', error);
      throw error;
    }
  },

  async updateProducto(id: number, producto: Partial<Producto>): Promise<Producto> {
    try {
      const response = await fetch(`${API_BASE_URL}/products/${id}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(producto),
      });
      if (!response.ok) throw new Error('Failed to update producto');
      const data = await response.json();
      return data.data || data;
    } catch (error) {
      console.error('Error updating producto:', error);
      throw error;
    }
  },

  async deleteProducto(id: number): Promise<void> {
    try {
      const response = await fetch(`${API_BASE_URL}/products/${id}`, {
        method: 'DELETE',
      });
      if (!response.ok) throw new Error('Failed to delete producto');
    } catch (error) {
      console.error('Error deleting producto:', error);
      throw error;
    }
  },

  // Categorías
  async getCategories(): Promise<Categoria[]> {
    try {
      const response = await fetch(`${API_BASE_URL}/categories`);
      if (!response.ok) throw new Error('Failed to fetch categories');
      const data = await response.json();
      return data.data || [];
    } catch (error) {
      console.error('Error fetching categories:', error);
      throw error;
    }
  },

  async createCategoria(nombre_categoria: string): Promise<Categoria> {
    try {
      const response = await fetch(`${API_BASE_URL}/categories`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ nombre_categoria }),
      });
      if (!response.ok) throw new Error('Failed to create categoria');
      const data = await response.json();
      return data.data || data;
    } catch (error) {
      console.error('Error creating categoria:', error);
      throw error;
    }
  },
};
