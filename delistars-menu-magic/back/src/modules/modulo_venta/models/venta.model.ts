export interface Venta {
  id_venta: number;
  fecha_venta: Date;
  id_trabajador: number | null;
  id_sede: number;
  total_venta: number;
  valor_domicilio?: number;
  pedido_confirmado: boolean;
}

export interface CreateVentaDTO {
  id_trabajador?: number | null;
  id_sede: number;
  valor_domicilio?: number;
  items: {
    id_producto: number;
    cantidad_producto: number;
    valor_unitario: number;
    valor_total_x_producto: number;
    adiciones?: Array<{
      id_producto: number;
      cantidad: number;
      valor_unitario: number;
    }>;
  }[];
}
