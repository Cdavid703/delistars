import { Request, Response } from 'express';
import { ProductsService } from '../services/products.service';
import { ApiResponse } from '../../../utils/api-response';

export class ProductsController {
  private service = new ProductsService();

  async getAll(req: Request, res: Response): Promise<void> {
    try {
      const products = await this.service.getAll();
      ApiResponse.success(res, products, 'Productos obtenidos exitosamente');
    } catch (error) {
      ApiResponse.error(res, 'Error al obtener productos', 500);
    }
  }

  async getById(req: Request, res: Response): Promise<void> {
    try {
      const { id } = req.params;
      const product = await this.service.getById(Number(id));

      if (!product) {
        ApiResponse.error(res, 'Producto no encontrado', 404);
        return;
      }

      ApiResponse.success(res, product, 'Producto obtenido exitosamente');
    } catch (error) {
      ApiResponse.error(res, 'Error al obtener producto', 500);
    }
  }

  async create(req: Request, res: Response): Promise<void> {
    try {
      const { nombre_producto, descripcion_producto, precio_venta, id_categoria, image_url1, image_url2 } = req.body;

      // Validación básica
      if (!nombre_producto || !descripcion_producto || precio_venta === undefined || !id_categoria) {
        ApiResponse.error(res, 'Faltan campos requeridos: nombre_producto, descripcion_producto, precio_venta, id_categoria', 400);
        return;
      }

      const precio = Number(precio_venta);
      if (!Number.isFinite(precio) || precio < 0) {
        ApiResponse.error(res, 'precio_venta debe ser un número mayor o igual a 0', 400);
        return;
      }

      const product = await this.service.create({
        nombre_producto,
        descripcion_producto,
        precio_venta: precio,
        id_categoria: Number(id_categoria),
        image_url1: image_url1 || null,
        image_url2: image_url2 || null
      });

      ApiResponse.success(res, product, 'Producto creado exitosamente', 201);
    } catch (error) {
      console.error('Error creating product:', error);
      ApiResponse.error(res, 'Error al crear producto', 500);
    }
  }

  async update(req: Request, res: Response): Promise<void> {
    try {
      const { id } = req.params;
      const { nombre_producto, descripcion_producto, precio_venta, id_categoria, image_url1, image_url2 } = req.body;

      // Validar que el ID es un número
      if (!id || isNaN(Number(id))) {
        ApiResponse.error(res, 'ID de producto inválido', 400);
        return;
      }

      // Validar que al menos un campo se proporciona
      if (
        nombre_producto === undefined &&
        descripcion_producto === undefined &&
        precio_venta === undefined &&
        id_categoria === undefined &&
        image_url1 === undefined &&
        image_url2 === undefined
      ) {
        ApiResponse.error(res, 'Se debe proporcionar al menos un campo para actualizar', 400);
        return;
      }

      if (precio_venta !== undefined) {
        const precio = Number(precio_venta);
        if (!Number.isFinite(precio) || precio < 0) {
          ApiResponse.error(res, 'precio_venta debe ser un número mayor o igual a 0', 400);
          return;
        }
      }

      const updateData: any = {};
      if (nombre_producto !== undefined) updateData.nombre_producto = nombre_producto;
      if (descripcion_producto !== undefined) updateData.descripcion_producto = descripcion_producto;
      if (precio_venta !== undefined) updateData.precio_venta = Number(precio_venta);
      if (id_categoria !== undefined) updateData.id_categoria = Number(id_categoria);
      if (image_url1 !== undefined) updateData.image_url1 = image_url1 || null;
      if (image_url2 !== undefined) updateData.image_url2 = image_url2 || null;

      const product = await this.service.update(Number(id), updateData);
      ApiResponse.success(res, product, 'Producto actualizado exitosamente');
    } catch (error) {
      console.error('Error updating product:', error);
      ApiResponse.error(res, 'Error al actualizar producto', 500);
    }
  }

  async delete(req: Request, res: Response): Promise<void> {
    try {
      const { id } = req.params;

      // Validar que el ID es un número
      if (!id || isNaN(Number(id))) {
        ApiResponse.error(res, 'ID de producto inválido', 400);
        return;
      }

      // Verificar que el producto existe
      const product = await this.service.getById(Number(id));
      if (!product) {
        ApiResponse.error(res, 'Producto no encontrado', 404);
        return;
      }

      await this.service.delete(Number(id));
      ApiResponse.success(res, null, 'Producto eliminado exitosamente');
    } catch (error) {
      console.error('Error deleting product:', error);
      ApiResponse.error(res, 'Error al eliminar producto', 500);
    }
  }
}
