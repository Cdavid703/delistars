const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:3000/api/v1';

export interface Category {
  id_categoria: number;
  nombre_categoria: string;
}

export interface ProductPresentation {
  id_presentacion: number;
  id_producto: number;
  tamano: string;
  base: string | null;
  sabor: string | null;
  precio_venta: number;
}

export interface Product {
  id_producto: number;
  nombre_producto: string;
  descripcion_producto: string;
  precio_venta: string;
  id_categoria: number;
  image_url1?: string;
  image_url2?: string;
  disponible?: boolean;
  presentations?: ProductPresentation[];
}

export interface Addon {
  id: number;
  name: string;
  price: number;
}

export interface Sede {
  id_sede: number;
  nombre_sede: string;
  telefono_sede: string;
  direccion_sede: string;
  horario_lunes_jueves: string;
  horario_viernes: string;
  horario_sabado: string;
  horario_domingo: string;
}

export const apiService = {
  async getSedes(): Promise<Sede[]> {
    try {
      const response = await fetch(`${API_BASE_URL}/sedes`);
      if (!response.ok) throw new Error('Failed to fetch sedes');
      const data = await response.json();
      // El controlador backend devuelve un array directamente
      return Array.isArray(data) ? data : data.data || [];
    } catch (error) {
      console.error('Error fetching sedes:', error);
      return [];
    }
  },

  async getCategories(): Promise<Category[]> {
    try {
      const response = await fetch(`${API_BASE_URL}/categories`);
      if (!response.ok) throw new Error('Failed to fetch categories');
      const data = await response.json();
      return data.data || [];
    } catch (error) {
      console.error('Error fetching categories:', error);
      return [];
    }
  },

  async getProducts(): Promise<Product[]> {
    try {
      const response = await fetch(`${API_BASE_URL}/products`);
      if (!response.ok) throw new Error('Failed to fetch products');
      const data = await response.json();
      // Ocultar del menú los productos marcados como no disponibles por el admin
      return (data.data || []).filter((p: Product) => p.disponible !== false);
    } catch (error) {
      console.error('Error fetching products:', error);
      return [];
    }
  },

  async getProductById(id: number): Promise<Product | null> {
    try {
      const response = await fetch(`${API_BASE_URL}/products/${id}`);
      if (!response.ok) throw new Error('Failed to fetch product');
      const data = await response.json();
      return data.data || null;
    } catch (error) {
      console.error('Error fetching product:', error);
      return null;
    }
  },

  async getAddons(): Promise<Addon[]> {
    try {
      // Obtener todos los productos y filtrar por id_categoria 5 (Adiciones)
      const products = await this.getProducts();
      return products
        .filter((p) => p.id_categoria === 5)
        .map((p) => ({
          id: p.id_producto,
          name: p.nombre_producto,
          price: parseFloat(p.precio_venta),
        }));
    } catch (error) {
      console.error('Error fetching addons:', error);
      return [];
    }
  },

};
