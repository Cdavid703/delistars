export interface IProductPresentation {
  id_presentacion: number;
  id_producto: number;
  tamano: string;
  base: string | null;
  sabor: string | null;
  precio_venta: number;
}

export interface IProduct {
  id_producto: number;
  nombre_producto: string;
  descripcion_producto: string;
  precio_venta: number;
  id_categoria: number;
  image_url1?: string;
  image_url2?: string;
  disponible: boolean;
  presentations?: IProductPresentation[];
}
