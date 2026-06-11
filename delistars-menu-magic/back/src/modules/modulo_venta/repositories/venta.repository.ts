import { getDataSource } from "@/config/database";
import type { Venta, CreateVentaDTO } from "../models/venta.model";

export class VentaRepository {
  /**
   * Crear nueva venta con sus detalles
   * Crea registro en tbl_ventas y múltiples registros en tbl_detalle_venta
   */
  async createVenta(data: CreateVentaDTO): Promise<Venta> {
    const dataSource = getDataSource();
    const connection = dataSource.driver.connect();

    try {
      // Calcular total de la venta (incluye valor_domicilio si se provee)
      const itemsTotal = data.items.reduce((sum, item) => {
        let itemTotal = item.valor_total_x_producto;
        // Sumar adiciones
        if (item.adiciones) {
          item.adiciones.forEach((addon) => {
            itemTotal += addon.valor_unitario * addon.cantidad;
          });
        }
        return sum + itemTotal;
      }, 0);

      const domicilio = data.valor_domicilio ? Number(data.valor_domicilio) : 0;
      const total_venta = itemsTotal + domicilio;

      // Insertar en tbl_ventas
      const ventaResult = await dataSource.query(
        `INSERT INTO tbl_ventas (fecha_venta, id_trabajador, id_sede, total_venta, valor_domicilio, pedido_confirmado)
         VALUES (NOW(), $1, $2, $3, $4, false)
         RETURNING id_venta, fecha_venta, id_trabajador, id_sede, total_venta, valor_domicilio, pedido_confirmado`,
        [data.id_trabajador, data.id_sede, total_venta, domicilio]
      );

      const venta: Venta = ventaResult[0];

      // Insertar detalles de la venta
      for (const item of data.items) {
        // Insertar producto principal
        await dataSource.query(
          `INSERT INTO tbl_detalle_venta (id_venta, id_producto, cantidad_producto, valor_total_x_producto)
           VALUES ($1, $2, $3, $4)`,
          [venta.id_venta, item.id_producto, item.cantidad_producto, item.valor_total_x_producto]
        );

        // Insertar adiciones como productos separados
        if (item.adiciones && item.adiciones.length > 0) {
          for (const addon of item.adiciones) {
            const addon_total = addon.valor_unitario * addon.cantidad;
            await dataSource.query(
              `INSERT INTO tbl_detalle_venta (id_venta, id_producto, cantidad_producto, valor_total_x_producto)
               VALUES ($1, $2, $3, $4)`,
              [venta.id_venta, addon.id_producto, addon.cantidad, addon_total]
            );
          }
        }
      }

      return venta;
    } catch (error) {
      throw new Error(`Error al crear venta: ${error}`);
    }
  }

  /**
   * Obtener venta por ID con sus detalles
   */
  async getVentaById(id_venta: number): Promise<any> {
    const dataSource = getDataSource();
    const result = await dataSource.query(
      `SELECT v.*, json_agg(json_build_object(
        'id_detalle_venta', dv.id_detalle_venta,
        'id_producto', dv.id_producto,
        'nombre_producto', p.nombre_producto,
        'cantidad_producto', dv.cantidad_producto,
        'valor_total_x_producto', dv.valor_total_x_producto
      )) as detalles
       FROM tbl_ventas v
       LEFT JOIN tbl_detalle_venta dv ON v.id_venta = dv.id_venta
       LEFT JOIN tbl_productos p ON dv.id_producto = p.id_producto
       WHERE v.id_venta = $1
       GROUP BY v.id_venta`,
      [id_venta]
    );
    return result[0] || null;
  }

  /**
   * Obtener todas las ventas
   */
  async getAllVentas(): Promise<Venta[]> {
    const dataSource = getDataSource();
    return dataSource.query(
      `SELECT id_venta, fecha_venta, id_trabajador, id_sede, total_venta, valor_domicilio, pedido_confirmado
       FROM tbl_ventas
       ORDER BY fecha_venta DESC`
    );
  }

  /**
   * Obtener suma de total_venta filtrada por rango de fechas (opcional)
   */
  async getTotalVentas(startDate?: string, endDate?: string, confirmed?: boolean): Promise<{ total: number }> {
    const dataSource = getDataSource();
    const params: any[] = [];
    let whereClauses: string[] = [];

    if (startDate) {
      params.push(startDate);
      whereClauses.push(`fecha_venta >= $${params.length}`);
    }

    if (endDate) {
      params.push(endDate);
      whereClauses.push(`fecha_venta <= $${params.length}`);
    }

    if (typeof confirmed !== 'undefined') {
      whereClauses.push(`pedido_confirmado = ${confirmed ? 'true' : 'false'}`);
    }

    const where = whereClauses.length > 0 ? `WHERE ${whereClauses.join(' AND ')}` : '';

    const result = await dataSource.query(
      `SELECT COALESCE(SUM(total_venta), 0) AS total FROM tbl_ventas ${where}`,
      params
    );

    // result[0].total puede venir como string (numeric), convertir a número
    const totalValue = result && result[0] && result[0].total ? Number(result[0].total) : 0;
    return { total: totalValue };
  }

  /**
   * Obtener suma de valor_domicilio filtrada por rango de fechas (opcional)
   */
  async getTotalValorDomicilio(startDate?: string, endDate?: string, confirmed?: boolean): Promise<{ total: number }> {
    const dataSource = getDataSource();
    const params: any[] = [];
    let whereClauses: string[] = [];

    if (startDate) {
      params.push(startDate);
      whereClauses.push(`fecha_venta >= $${params.length}`);
    }

    if (endDate) {
      params.push(endDate);
      whereClauses.push(`fecha_venta <= $${params.length}`);
    }

    if (typeof confirmed !== 'undefined') {
      whereClauses.push(`pedido_confirmado = ${confirmed ? 'true' : 'false'}`);
    }

    const where = whereClauses.length > 0 ? `WHERE ${whereClauses.join(' AND ')}` : '';

    const result = await dataSource.query(
      `SELECT COALESCE(SUM(valor_domicilio), 0) AS total FROM tbl_ventas ${where}`,
      params
    );

    const totalValue = result && result[0] && result[0].total ? Number(result[0].total) : 0;
    return { total: totalValue };
  }

  /**
   * Obtener conteo de ventas filtradas por rango de fechas (opcional)
   */
  async getCountVentas(startDate?: string, endDate?: string, confirmed?: boolean): Promise<{ count: number }> {
    const dataSource = getDataSource();
    const params: any[] = [];
    let whereClauses: string[] = [];

    if (startDate) {
      params.push(startDate);
      whereClauses.push(`fecha_venta >= $${params.length}`);
    }

    if (endDate) {
      params.push(endDate);
      whereClauses.push(`fecha_venta <= $${params.length}`);
    }

    if (typeof confirmed !== 'undefined') {
      whereClauses.push(`pedido_confirmado = ${confirmed ? 'true' : 'false'}`);
    }

    const where = whereClauses.length > 0 ? `WHERE ${whereClauses.join(' AND ')}` : '';

    const result = await dataSource.query(
      `SELECT COUNT(*)::int AS count FROM tbl_ventas ${where}`,
      params
    );

    const cnt = result && result[0] && typeof result[0].count !== 'undefined' ? Number(result[0].count) : 0;
    return { count: cnt };
  }

  /**
   * Obtener ventas con filtros y paginación
   */
  async getVentasFiltered(startDate?: string, endDate?: string, limit?: number, offset?: number, confirmed?: boolean): Promise<Venta[]> {
    const dataSource = getDataSource();
    const params: any[] = [];
    let whereClauses: string[] = [];

    if (startDate) {
      params.push(startDate);
      whereClauses.push(`fecha_venta >= $${params.length}`);
    }

    if (endDate) {
      params.push(endDate);
      whereClauses.push(`fecha_venta <= $${params.length}`);
    }
    if (typeof confirmed !== 'undefined') {
      whereClauses.push(`pedido_confirmado = ${confirmed ? 'true' : 'false'}`);
    }

    const where = whereClauses.length > 0 ? `WHERE ${whereClauses.join(' AND ')}` : '';
    const limitClause = limit ? `LIMIT ${limit}` : '';
    const offsetClause = offset ? `OFFSET ${offset}` : '';

    return dataSource.query(
      `SELECT id_venta, fecha_venta, id_trabajador, id_sede, total_venta, valor_domicilio, pedido_confirmado
       FROM tbl_ventas
       ${where}
       ORDER BY fecha_venta DESC
       ${limitClause} ${offsetClause}`,
      params
    );
  }

  /**
   * Obtener ventas por sede
   */
  async getVentasBySede(id_sede: number): Promise<Venta[]> {
    const dataSource = getDataSource();
    return dataSource.query(
      `SELECT id_venta, fecha_venta, id_trabajador, id_sede, total_venta, valor_domicilio, pedido_confirmado
       FROM tbl_ventas
       WHERE id_sede = $1
       ORDER BY fecha_venta DESC`,
      [id_sede]
    );
  }

  /**
   * Actualizar estado de confirmación del pedido
   */
  async updatePedidoConfirmado(id_venta: number, confirmado: boolean): Promise<Venta> {
    const dataSource = getDataSource();
    const result = await dataSource.query(
      `UPDATE tbl_ventas
       SET pedido_confirmado = $1
       WHERE id_venta = $2
       RETURNING id_venta, fecha_venta, id_trabajador, id_sede, total_venta, valor_domicilio, pedido_confirmado`,
      [confirmado, id_venta]
    );
    return result[0];
  }
}
