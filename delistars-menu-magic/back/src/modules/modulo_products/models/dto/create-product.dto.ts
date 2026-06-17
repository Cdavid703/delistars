export interface CreateProductDto {
  nombre_producto: string;
  descripcion_producto: string;
  precio_venta: number;
  id_categoria: number;
  image_url1?: string | null;
  image_url2?: string | null;
  disponible?: boolean;
}
