import { getDataSource } from '../../../config/database';
import { ISede } from '../models/entities/sede.entity';
import { UpdateSedeDTO } from '../models/dto/update-sede.dto';
import { CreateSedeDTO } from '../models/dto/create-sede.dto';

export class SedeRepository {
  async findAll(): Promise<ISede[]> {
    const dataSource = getDataSource();
    const result = await dataSource.query(`
      SELECT 
        id_sede, 
        nombre_sede, 
        telefono_sede, 
        direccion_sede, 
        horario_lunes_jueves, 
        horario_viernes,
        horario_sabado, 
        horario_domingo 
      FROM tbl_sedes 
      ORDER BY id_sede ASC
    `);
    return result;
  }

  async findById(id: number): Promise<ISede | null> {
    const dataSource = getDataSource();
    const result = await dataSource.query(`
      SELECT 
        id_sede, 
        nombre_sede, 
        telefono_sede, 
        direccion_sede, 
        horario_lunes_jueves, 
        horario_viernes,
        horario_sabado, 
        horario_domingo 
      FROM tbl_sedes 
      WHERE id_sede = $1
    `, [id]);
    return result.length > 0 ? result[0] : null;
  }

  async update(id: number, updateData: UpdateSedeDTO): Promise<ISede | null> {
    const dataSource = getDataSource();
    
    // Construir dinámicamente la query UPDATE solo con los campos proporcionados
    const fields: string[] = [];
    const values: (string | number | undefined)[] = [];
    let paramCounter = 1;

    if (updateData.nombre_sede !== undefined) {
      fields.push(`nombre_sede = $${paramCounter}`);
      values.push(updateData.nombre_sede);
      paramCounter++;
    }
    if (updateData.telefono_sede !== undefined) {
      fields.push(`telefono_sede = $${paramCounter}`);
      values.push(updateData.telefono_sede);
      paramCounter++;
    }
    if (updateData.direccion_sede !== undefined) {
      fields.push(`direccion_sede = $${paramCounter}`);
      values.push(updateData.direccion_sede);
      paramCounter++;
    }
    if (updateData.horario_lunes_jueves !== undefined) {
      fields.push(`horario_lunes_jueves = $${paramCounter}`);
      values.push(updateData.horario_lunes_jueves);
      paramCounter++;
    }
    if (updateData.horario_viernes !== undefined) {
      fields.push(`horario_viernes = $${paramCounter}`);
      values.push(updateData.horario_viernes);
      paramCounter++;
    }
    if (updateData.horario_sabado !== undefined) {
      fields.push(`horario_sabado = $${paramCounter}`);
      values.push(updateData.horario_sabado);
      paramCounter++;
    }
    if (updateData.horario_domingo !== undefined) {
      fields.push(`horario_domingo = $${paramCounter}`);
      values.push(updateData.horario_domingo);
      paramCounter++;
    }

    if (fields.length === 0) {
      return this.findById(id);
    }

    values.push(id);
    const query = `
      UPDATE tbl_sedes
      SET ${fields.join(', ')}
      WHERE id_sede = $${paramCounter}
      RETURNING 
        id_sede, 
        nombre_sede, 
        telefono_sede, 
        direccion_sede, 
        horario_lunes_jueves, 
        horario_viernes,
        horario_sabado, 
        horario_domingo
    `;

    const result = await dataSource.query(query, values);
    return result.length > 0 ? result[0] : null;
  }

  async create(createData: CreateSedeDTO): Promise<ISede> {
    const dataSource = getDataSource();
    const query = `
      INSERT INTO tbl_sedes (
        nombre_sede, 
        telefono_sede, 
        direccion_sede, 
        horario_lunes_jueves, 
        horario_viernes, 
        horario_sabado, 
        horario_domingo
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7)
      RETURNING 
        id_sede, 
        nombre_sede, 
        telefono_sede, 
        direccion_sede, 
        horario_lunes_jueves, 
        horario_viernes,
        horario_sabado, 
        horario_domingo
    `;

    const result = await dataSource.query(query, [
      createData.nombre_sede,
      createData.telefono_sede,
      createData.direccion_sede,
      createData.horario_lunes_jueves,
      createData.horario_viernes,
      createData.horario_sabado,
      createData.horario_domingo
    ]);

    return result[0];
  }

  async delete(id: number): Promise<boolean> {
    const dataSource = getDataSource();
    const result = await dataSource.query(
      `DELETE FROM tbl_sedes WHERE id_sede = $1 RETURNING id_sede`,
      [id]
    );
    return result.length > 0;
  }
}
