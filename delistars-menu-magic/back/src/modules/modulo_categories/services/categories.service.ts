import { CategoriesRepository } from '../repositories/categories.repository';
import { ICategory } from '../models/entities/category.entity';
import { CreateCategoryDto } from '../models/dto/create-category.dto';

export class CategoriesService {
  private repository = new CategoriesRepository();

  async getAll(): Promise<ICategory[]> {
    return await this.repository.getAll();
  }

  async getById(id: number): Promise<ICategory | null> {
    return await this.repository.getById(id);
  }

  async create(createCategoryDto: CreateCategoryDto): Promise<ICategory> {
    return await this.repository.create(createCategoryDto.nombre_categoria);
  }
}
