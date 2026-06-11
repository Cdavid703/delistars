import { getDataSource } from '../../../config/database';
import { IProduct } from '../models/entities/product.entity';
import { CreateProductDto } from '../models/dto/create-product.dto';
import { UpdateProductDto } from '../models/dto/update-product.dto';

export class ProductsRepository {
  async getAll(): Promise<IProduct[]> {
    const dataSource = getDataSource();
    const result = await dataSource.query(
      'SELECT id_producto, nombre_producto, descripcion_producto, precio_venta, id_categoria, image_url1, image_url2 FROM tbl_productos'
    );
    return result;
  }

  async getById(id: number): Promise<IProduct | null> {
    const dataSource = getDataSource();
    const result = await dataSource.query(
      'SELECT id_producto, nombre_producto, descripcion_producto, precio_venta, id_categoria, image_url1, image_url2 FROM tbl_productos WHERE id_producto = $1',
      [id]
    );
    return result.length > 0 ? result[0] : null;
  }

  async create(createProductDto: CreateProductDto): Promise<IProduct> {
    const dataSource = getDataSource();
    const { nombre_producto, descripcion_producto, precio_venta, id_categoria, image_url1, image_url2 } = createProductDto;
    
    const result = await dataSource.query(
      `INSERT INTO tbl_productos (nombre_producto, descripcion_producto, precio_venta, id_categoria, image_url1, image_url2)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING id_producto, nombre_producto, descripcion_producto, precio_venta, id_categoria, image_url1, image_url2`,
      [nombre_producto, descripcion_producto, precio_venta, id_categoria, image_url1 || null, image_url2 || null]
    );
    return result[0];
  }

  async update(id: number, updateProductDto: UpdateProductDto): Promise<IProduct> {
    const dataSource = getDataSource();
    const fields: string[] = [];
    const values: any[] = [];
    let paramCount = 1;

    // Construir la query dinámicamente según qué campos se proporcionan
    if (updateProductDto.nombre_producto !== undefined) {
      fields.push(`nombre_producto = $${paramCount}`);
      values.push(updateProductDto.nombre_producto);
      paramCount++;
    }
    if (updateProductDto.descripcion_producto !== undefined) {
      fields.push(`descripcion_producto = $${paramCount}`);
      values.push(updateProductDto.descripcion_producto);
      paramCount++;
    }
    if (updateProductDto.precio_venta !== undefined) {
      fields.push(`precio_venta = $${paramCount}`);
      values.push(updateProductDto.precio_venta);
      paramCount++;
    }
    if (updateProductDto.id_categoria !== undefined) {
      fields.push(`id_categoria = $${paramCount}`);
      values.push(updateProductDto.id_categoria);
      paramCount++;
    }
    if (updateProductDto.image_url1 !== undefined) {
      fields.push(`image_url1 = $${paramCount}`);
      values.push(updateProductDto.image_url1 || null);
      paramCount++;
    }
    if (updateProductDto.image_url2 !== undefined) {
      fields.push(`image_url2 = $${paramCount}`);
      values.push(updateProductDto.image_url2 || null);
      paramCount++;
    }

    if (fields.length === 0) {
      return this.getById(id) as Promise<IProduct>;
    }

    values.push(id);
    const query = `UPDATE tbl_productos SET ${fields.join(', ')} WHERE id_producto = $${paramCount} RETURNING id_producto, nombre_producto, descripcion_producto, precio_venta, id_categoria, image_url1, image_url2`;

    const result = await dataSource.query(query, values);
    return result[0];
  }

  async delete(id: number): Promise<void> {
    const dataSource = getDataSource();
    await dataSource.query(
      'DELETE FROM tbl_productos WHERE id_producto = $1',
      [id]
    );
  }
}
