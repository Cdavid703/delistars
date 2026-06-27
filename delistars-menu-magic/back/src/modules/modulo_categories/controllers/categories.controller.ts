import { Request, Response } from 'express';
import { CategoriesService } from '../services/categories.service';
import { ApiResponse } from '../../../utils/api-response';

export class CategoriesController {
  private service = new CategoriesService();

  async getAll(req: Request, res: Response): Promise<void> {
    try {
      const categories = await this.service.getAll();
      ApiResponse.success(res, categories, 'Categorías obtenidas exitosamente');
    } catch (error) {
      ApiResponse.error(res, 'Error al obtener categorías', 500);
    }
  }

  async getById(req: Request, res: Response): Promise<void> {
    try {
      const { id } = req.params;
      const category = await this.service.getById(Number(id));
      
      if (!category) {
        ApiResponse.error(res, 'Categoría no encontrada', 404);
        return;
      }
      
      ApiResponse.success(res, category, 'Categoría obtenida exitosamente');
    } catch (error) {
      ApiResponse.error(res, 'Error al obtener categoría', 500);
    }
  }

  async create(req: Request, res: Response): Promise<void> {
    try {
      const { nombre_categoria } = req.body;

      // Validación básica
      if (!nombre_categoria || nombre_categoria.trim() === '') {
        ApiResponse.error(res, 'El nombre de la categoría es requerido', 400);
        return;
      }

      const category = await this.service.create({
        nombre_categoria: nombre_categoria.trim()
      });

      ApiResponse.success(res, category, 'Categoría creada exitosamente', 201);
    } catch (error) {
      console.error('Error creating category:', error);
      ApiResponse.error(res, 'Error al crear categoría', 500);
    }
  }
}
