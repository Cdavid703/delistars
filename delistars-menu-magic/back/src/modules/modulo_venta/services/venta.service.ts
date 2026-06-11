import { VentaRepository } from "../repositories/venta.repository";
import type { CreateVentaDTO, Venta } from "../models/venta.model";

export class VentaService {
  private ventaRepository: VentaRepository;

  constructor() {
    this.ventaRepository = new VentaRepository();
  }

  /**
   * Crear una nueva venta
   */
  async createVenta(data: CreateVentaDTO): Promise<Venta> {
    // Validar que haya al menos un producto
    if (!data.items || data.items.length === 0) {
      throw new Error("La venta debe tener al menos un producto");
    }

    // Validar que id_sede sea válido
    if (!data.id_sede) {
      throw new Error("id_sede es requerido");
    }

    return this.ventaRepository.createVenta(data);
  }

  /**
   * Obtener venta por ID
   */
  async getVentaById(id_venta: number): Promise<any> {
    if (!id_venta) {
      throw new Error("id_venta es requerido");
    }
    return this.ventaRepository.getVentaById(id_venta);
  }

  /**
   * Obtener todas las ventas
   */
  async getAllVentas(): Promise<Venta[]> {
    return this.ventaRepository.getAllVentas();
  }

  /**
   * Obtener ventas con filtros y paginación
   */
  async getVentasFiltered(startDate?: string, endDate?: string, limit?: number, offset?: number, confirmed?: boolean): Promise<Venta[]> {
    return this.ventaRepository.getVentasFiltered(startDate, endDate, limit, offset, confirmed);
  }

  /**
   * Obtener ventas por sede
   */
  async getVentasBySede(id_sede: number): Promise<Venta[]> {
    if (!id_sede) {
      throw new Error("id_sede es requerido");
    }
    return this.ventaRepository.getVentasBySede(id_sede);
  }

  /**
   * Obtener suma total de ventas opcionalmente filtrada por rango de fechas
   */
  async getTotalVentas(startDate?: string, endDate?: string, confirmed?: boolean): Promise<number> {
    const result = await this.ventaRepository.getTotalVentas(startDate, endDate, confirmed);
    return result.total;
  }

  /**
   * Obtener suma de valor_domicilio opcionalmente filtrada por rango de fechas
   */
  async getTotalValorDomicilio(startDate?: string, endDate?: string, confirmed?: boolean): Promise<number> {
    const result = await this.ventaRepository.getTotalValorDomicilio(startDate, endDate, confirmed);
    return result.total;
  }

  /**
   * Obtener conteo de ventas opcionalmente filtrado por fechas
   */
  async getCountVentas(startDate?: string, endDate?: string, confirmed?: boolean): Promise<number> {
    const result = await this.ventaRepository.getCountVentas(startDate, endDate, confirmed);
    return result.count;
  }

  /**
   * Confirmar pedido
   */
  async confirmarPedido(id_venta: number): Promise<Venta> {
    if (!id_venta) {
      throw new Error("id_venta es requerido");
    }
    return this.ventaRepository.updatePedidoConfirmado(id_venta, true);
  }

  /**
   * Cancelar pedido
   */
  async cancelarPedido(id_venta: number): Promise<Venta> {
    if (!id_venta) {
      throw new Error("id_venta es requerido");
    }
    return this.ventaRepository.updatePedidoConfirmado(id_venta, false);
  }
}
