import type { Request, Response } from "express";
import { VentaService } from "../services/venta.service";

const ventaService = new VentaService();

export class VentaController {
  /**
   * POST /api/v1/ventas - Crear nueva venta
   */
  static async createVenta(req: Request, res: Response): Promise<void> {
    try {
      const data = req.body;
      const venta = await ventaService.createVenta(data);
      res.status(201).json({
        success: true,
        message: "Venta creada exitosamente",
        data: venta,
      });
    } catch (error: any) {
      res.status(400).json({
        success: false,
        message: error.message || "Error al crear la venta",
      });
    }
  }

  /**
   * GET /api/v1/ventas/:id - Obtener venta por ID
   */
  static async getVentaById(req: Request, res: Response): Promise<void> {
    try {
      const { id } = req.params;
      const venta = await ventaService.getVentaById(Number(id));

      if (!venta) {
        res.status(404).json({
          success: false,
          message: "Venta no encontrada",
        });
        return;
      }

      res.json({
        success: true,
        data: venta,
      });
    } catch (error: any) {
      res.status(400).json({
        success: false,
        message: error.message || "Error al obtener la venta",
      });
    }
  }

  /**
   * GET /api/v1/ventas - Obtener todas las ventas
   */
  static async getAllVentas(req: Request, res: Response): Promise<void> {
    try {
      const { startDate, endDate, limit, offset, confirmed } = req.query as {
        startDate?: string
        endDate?: string
        limit?: string
        offset?: string
        confirmed?: string
      }

      if (limit || offset || startDate || endDate) {
        const l = limit ? Number(limit) : undefined
        const o = offset ? Number(offset) : undefined
        const conf = typeof confirmed !== 'undefined' ? confirmed === 'true' : undefined
        const ventas = await ventaService.getVentasFiltered(startDate, endDate, l, o, conf)
        res.json({ success: true, count: ventas.length, data: ventas })
        return
      }

      const ventas = await ventaService.getAllVentas();
      res.json({ success: true, count: ventas.length, data: ventas })
    } catch (error: any) {
      res.status(400).json({
        success: false,
        message: error.message || "Error al obtener las ventas",
      });
    }
  }

  /**
   * GET /api/v1/ventas/sede/:id_sede - Obtener ventas por sede
   */
  static async getVentasBySede(req: Request, res: Response): Promise<void> {
    try {
      const { id_sede } = req.params;
      const ventas = await ventaService.getVentasBySede(Number(id_sede));

      res.json({
        success: true,
        count: ventas.length,
        data: ventas,
      });
    } catch (error: any) {
      res.status(400).json({
        success: false,
        message: error.message || "Error al obtener las ventas",
      });
    }
  }

  /**
   * GET /api/v1/ventas/summary?startDate=&endDate=
   * Retorna la suma de total_venta filtrada por fechas (opcional)
   */
  static async getTotalVentas(req: Request, res: Response): Promise<void> {
    try {
      const { startDate, endDate, confirmed } = req.query as { startDate?: string; endDate?: string; confirmed?: string };
      const conf = typeof confirmed !== 'undefined' ? confirmed === 'true' : undefined
      const total = await ventaService.getTotalVentas(startDate, endDate, conf);

      res.json({
        success: true,
        data: { total },
      });
    } catch (error: any) {
      res.status(400).json({
        success: false,
        message: error.message || 'Error al obtener resumen de ventas',
      });
    }
  }

  /**
   * GET /api/v1/ventas/summary/domicilio?startDate=&endDate=
   * Retorna la suma de valor_domicilio filtrada por fechas (opcional)
   */
  static async getTotalValorDomicilio(req: Request, res: Response): Promise<void> {
    try {
      const { startDate, endDate, confirmed } = req.query as { startDate?: string; endDate?: string; confirmed?: string };
      const conf = typeof confirmed !== 'undefined' ? confirmed === 'true' : undefined
      const total = await ventaService.getTotalValorDomicilio(startDate, endDate, conf);

      res.json({
        success: true,
        data: { total },
      });
    } catch (error: any) {
      res.status(400).json({
        success: false,
        message: error.message || 'Error al obtener resumen de valor_domicilio',
      });
    }
  }

  /**
   * GET /api/v1/ventas/count?startDate=&endDate=
   * Retorna el conteo de ventas filtradas por fechas (opcional)
   */
  static async getCountVentas(req: Request, res: Response): Promise<void> {
    try {
      const { startDate, endDate, confirmed } = req.query as { startDate?: string; endDate?: string; confirmed?: string };
      const conf = typeof confirmed !== 'undefined' ? confirmed === 'true' : undefined
      const count = await ventaService.getCountVentas(startDate, endDate, conf);

      res.json({
        success: true,
        data: { count },
      });
    } catch (error: any) {
      res.status(400).json({
        success: false,
        message: error.message || 'Error al obtener conteo de ventas',
      });
    }
  }

  /**
   * PUT /api/v1/ventas/:id/confirmar - Confirmar pedido
   */
  static async confirmarPedido(req: Request, res: Response): Promise<void> {
    try {
      const { id } = req.params;
      const venta = await ventaService.confirmarPedido(Number(id));

      res.json({
        success: true,
        message: "Pedido confirmado exitosamente",
        data: venta,
      });
    } catch (error: any) {
      res.status(400).json({
        success: false,
        message: error.message || "Error al confirmar el pedido",
      });
    }
  }

  /**
   * PUT /api/v1/ventas/:id/cancelar - Cancelar pedido
   */
  static async cancelarPedido(req: Request, res: Response): Promise<void> {
    try {
      const { id } = req.params;
      const venta = await ventaService.cancelarPedido(Number(id));

      res.json({
        success: true,
        message: "Pedido cancelado exitosamente",
        data: venta,
      });
    } catch (error: any) {
      res.status(400).json({
        success: false,
        message: error.message || "Error al cancelar el pedido",
      });
    }
  }
}
