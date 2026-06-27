import { ProductsRepository } from '../repositories/products.repository';
import { IProduct } from '../models/entities/product.entity';
import { CreateProductDto } from '../models/dto/create-product.dto';
import { UpdateProductDto } from '../models/dto/update-product.dto';

export class ProductsService {
  private repository = new ProductsRepository();

  async getAll(): Promise<IProduct[]> {
    return await this.repository.getAll();
  }

  async getById(id: number): Promise<IProduct | null> {
    return await this.repository.getById(id);
  }

  async create(createProductDto: CreateProductDto): Promise<IProduct> {
    return await this.repository.create(createProductDto);
  }

  async update(id: number, updateProductDto: UpdateProductDto): Promise<IProduct> {
    return await this.repository.update(id, updateProductDto);
  }

  async delete(id: number): Promise<void> {
    return await this.repository.delete(id);
  }
}
