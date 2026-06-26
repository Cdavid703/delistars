import { getDataSource } from '../../../config/database';
import { IProduct } from '../models/entities/product.entity';
import { CreateProductDto } from '../models/dto/create-product.dto';
import { UpdateProductDto } from '../models/dto/update-product.dto';

export class ProductsRepository {
  async getAll(): Promise<IProduct[]> {
    const dataSource = getDataSource();
    const products: IProduct[] = await dataSource.query(
      'SELECT id_producto, nombre_producto, descripcion_producto, precio_venta, id_categoria, image_url1, image_url2, disponible FROM tbl_productos'
    );

    const presentations = await dataSource.query(
      'SELECT id_presentacion, id_producto, tamano, base, sabor, precio_venta FROM presentacion_producto'
    );

    const presentationsByProduct: Record<number, any[]> = {};
    for (const pres of presentations) {
      pres.precio_venta = parseFloat(pres.precio_venta);
      if (!presentationsByProduct[pres.id_producto]) {
        presentationsByProduct[pres.id_producto] = [];
      }
      presentationsByProduct[pres.id_producto].push(pres);
    }

    for (const product of products) {
      product.presentations = presentationsByProduct[product.id_producto] || [];
    }

    return products;
  }

  async getById(id: number): Promise<IProduct | null> {
    const dataSource = getDataSource();
    const result = await dataSource.query(
      'SELECT id_producto, nombre_producto, descripcion_producto, precio_venta, id_categoria, image_url1, image_url2, disponible FROM tbl_productos WHERE id_producto = $1',
      [id]
    );
    if (result.length === 0) return null;
    const product = result[0];

    const presentations = await dataSource.query(
      'SELECT id_presentacion, id_producto, tamano, base, sabor, precio_venta FROM presentacion_producto WHERE id_producto = $1',
      [id]
    );

    for (const pres of presentations) {
      pres.precio_venta = parseFloat(pres.precio_venta);
    }
    product.presentations = presentations;

    return product;
  }

  async create(createProductDto: CreateProductDto): Promise<IProduct> {
    const dataSource = getDataSource();
    const { nombre_producto, descripcion_producto, precio_venta, id_categoria, image_url1, image_url2, disponible } = createProductDto;

    const result = await dataSource.query(
      `INSERT INTO tbl_productos (nombre_producto, descripcion_producto, precio_venta, id_categoria, image_url1, image_url2, disponible)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       RETURNING id_producto, nombre_producto, descripcion_producto, precio_venta, id_categoria, image_url1, image_url2, disponible`,
      [nombre_producto, descripcion_producto, precio_venta, id_categoria, image_url1 || null, image_url2 || null, disponible ?? true]
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
    if (updateProductDto.disponible !== undefined) {
      fields.push(`disponible = $${paramCount}`);
      values.push(updateProductDto.disponible);
      paramCount++;
    }

    if (fields.length === 0) {
      return this.getById(id) as Promise<IProduct>;
    }

    values.push(id);
    const query = `UPDATE tbl_productos SET ${fields.join(', ')} WHERE id_producto = $${paramCount} RETURNING id_producto, nombre_producto, descripcion_producto, precio_venta, id_categoria, image_url1, image_url2, disponible`;

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
