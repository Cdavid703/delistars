import { getDataSource } from '../../../config/database';
import { ICategory } from '../models/entities/category.entity';

export class CategoriesRepository {
  async getAll(): Promise<ICategory[]> {
    const dataSource = getDataSource();
    const result = await dataSource.query('SELECT id_categoria, nombre_categoria FROM categoria');
    return result;
  }

  async getById(id: number): Promise<ICategory | null> {
    const dataSource = getDataSource();
    const result = await dataSource.query(
      'SELECT id_categoria, nombre_categoria FROM categoria WHERE id_categoria = $1',
      [id]
    );
    return result.length > 0 ? result[0] : null;
  }

  async create(nombre_categoria: string): Promise<ICategory> {
    const dataSource = getDataSource();
    const result = await dataSource.query(
      'INSERT INTO categoria (nombre_categoria) VALUES ($1) RETURNING id_categoria, nombre_categoria',
      [nombre_categoria]
    );
    return result[0];
  }
}
