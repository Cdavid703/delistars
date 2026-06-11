import { getDataSource } from "@/config/database";
import bcryptjs from "bcryptjs";
import type { Trabajador, CreateTrabajadorDTO, TrabajadorResponse } from "../models/trabajador.model";

export class TrabajadorRepository {
  /**
   * Crear nuevo trabajador con contraseña cifrada
   */
  async createTrabajador(data: CreateTrabajadorDTO): Promise<TrabajadorResponse> {
    const dataSource = getDataSource();

    // Verificar que el usuario no exista
    const existingUser = await dataSource.query(
      `SELECT id_trabajador FROM tbl_trabajador WHERE usuario = $1`,
      [data.usuario]
    );

    if (existingUser.length > 0) {
      throw new Error("El usuario ya existe");
    }

    // Cifrar contraseña con bcrypt (10 rounds)
    const hashedPassword = await bcryptjs.hash(data.usuario_password, 10);

    // Insertar trabajador con contraseña cifrada
    const result = await dataSource.query(
      `INSERT INTO tbl_trabajador (nombre_trabajador, apellido_trabajador, usuario, usuario_password)
       VALUES ($1, $2, $3, $4)
       RETURNING id_trabajador, nombre_trabajador, apellido_trabajador, usuario`,
      [data.nombre_trabajador, data.apellido_trabajador, data.usuario, hashedPassword]
    );

    return result[0];
  }

  /**
   * Obtener trabajador por ID (sin contraseña)
   */
  async getTrabajadorById(id_trabajador: number): Promise<TrabajadorResponse | null> {
    const dataSource = getDataSource();
    const result = await dataSource.query(
      `SELECT id_trabajador, nombre_trabajador, apellido_trabajador, usuario
       FROM tbl_trabajador
       WHERE id_trabajador = $1`,
      [id_trabajador]
    );
    return result[0] || null;
  }

  /**
   * Obtener todos los trabajadores (sin contraseñas)
   */
  async getAllTrabajadores(): Promise<TrabajadorResponse[]> {
    const dataSource = getDataSource();
    return dataSource.query(
      `SELECT id_trabajador, nombre_trabajador, apellido_trabajador, usuario
       FROM tbl_trabajador
       ORDER BY nombre_trabajador ASC`
    );
  }

  /**
   * Obtener trabajador por usuario (con contraseña cifrada, para login)
   */
  async getTrabajadorByUsuario(usuario: string): Promise<Trabajador | null> {
    const dataSource = getDataSource();
    const result = await dataSource.query(
      `SELECT id_trabajador, nombre_trabajador, apellido_trabajador, usuario, usuario_password
       FROM tbl_trabajador
       WHERE usuario = $1`,
      [usuario]
    );
    return result[0] || null;
  }

  /**
   * Actualizar trabajador (nombre y apellido, NO contraseña)
   */
  async updateTrabajador(
    id_trabajador: number,
    nombre: string,
    apellido: string
  ): Promise<TrabajadorResponse> {
    const dataSource = getDataSource();
    const result = await dataSource.query(
      `UPDATE tbl_trabajador
       SET nombre_trabajador = $1, apellido_trabajador = $2
       WHERE id_trabajador = $3
       RETURNING id_trabajador, nombre_trabajador, apellido_trabajador, usuario`,
      [nombre, apellido, id_trabajador]
    );
    return result[0];
  }

  /**
   * Cambiar contraseña
   */
  async changePassword(id_trabajador: number, newPassword: string): Promise<void> {
    const dataSource = getDataSource();
    const hashedPassword = await bcryptjs.hash(newPassword, 10);

    await dataSource.query(
      `UPDATE tbl_trabajador
       SET usuario_password = $1
       WHERE id_trabajador = $2`,
      [hashedPassword, id_trabajador]
    );
  }

  /**
   * Verificar contraseña (para login)
   */
  async verifyPassword(plainPassword: string, hashedPassword: string): Promise<boolean> {
    return bcryptjs.compare(plainPassword, hashedPassword);
  }

  /**
   * Eliminar trabajador
   */
  async deleteTrabajador(id_trabajador: number): Promise<void> {
    const dataSource = getDataSource();
    await dataSource.query(
      `DELETE FROM tbl_trabajador WHERE id_trabajador = $1`,
      [id_trabajador]
    );
  }
}
