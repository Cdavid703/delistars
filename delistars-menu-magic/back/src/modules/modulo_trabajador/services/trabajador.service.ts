import { TrabajadorRepository } from "../repositories/trabajador.repository";
import type { CreateTrabajadorDTO, TrabajadorResponse } from "../models/trabajador.model";

export class TrabajadorService {
  private trabajadorRepository: TrabajadorRepository;

  constructor() {
    this.trabajadorRepository = new TrabajadorRepository();
  }

  /**
   * Crear nuevo trabajador
   */
  async createTrabajador(data: CreateTrabajadorDTO): Promise<TrabajadorResponse> {
    // Validar campos
    if (!data.nombre_trabajador || !data.nombre_trabajador.trim()) {
      throw new Error("El nombre del trabajador es requerido");
    }
    if (!data.apellido_trabajador || !data.apellido_trabajador.trim()) {
      throw new Error("El apellido del trabajador es requerido");
    }
    if (!data.usuario || !data.usuario.trim()) {
      throw new Error("El usuario es requerido");
    }
    if (!data.usuario_password || data.usuario_password.length < 6) {
      throw new Error("La contraseña debe tener al menos 6 caracteres");
    }

    return this.trabajadorRepository.createTrabajador(data);
  }

  /**
   * Obtener trabajador por ID
   */
  async getTrabajadorById(id_trabajador: number): Promise<TrabajadorResponse> {
    const trabajador = await this.trabajadorRepository.getTrabajadorById(id_trabajador);
    if (!trabajador) {
      throw new Error("Trabajador no encontrado");
    }
    return trabajador;
  }

  /**
   * Obtener todos los trabajadores
   */
  async getAllTrabajadores(): Promise<TrabajadorResponse[]> {
    return this.trabajadorRepository.getAllTrabajadores();
  }

  /**
   * Actualizar trabajador
   */
  async updateTrabajador(
    id_trabajador: number,
    nombre: string,
    apellido: string
  ): Promise<TrabajadorResponse> {
    if (!nombre || !nombre.trim()) {
      throw new Error("El nombre es requerido");
    }
    if (!apellido || !apellido.trim()) {
      throw new Error("El apellido es requerido");
    }

    return this.trabajadorRepository.updateTrabajador(id_trabajador, nombre, apellido);
  }

  /**
   * Cambiar contraseña
   */
  async changePassword(id_trabajador: number, newPassword: string): Promise<void> {
    if (!newPassword || newPassword.length < 6) {
      throw new Error("La contraseña debe tener al menos 6 caracteres");
    }

    await this.trabajadorRepository.changePassword(id_trabajador, newPassword);
  }

  /**
   * Eliminar trabajador
   */
  async deleteTrabajador(id_trabajador: number): Promise<void> {
    return this.trabajadorRepository.deleteTrabajador(id_trabajador);
  }

  /**
   * Login (verifica usuario y contraseña)
   */
  async login(usuario: string, password: string): Promise<TrabajadorResponse> {
    const trabajador = await this.trabajadorRepository.getTrabajadorByUsuario(usuario);
    if (!trabajador) {
      throw new Error("Usuario o contraseña incorrectos");
    }

    const isPasswordValid = await this.trabajadorRepository.verifyPassword(
      password,
      trabajador.usuario_password
    );

    if (!isPasswordValid) {
      throw new Error("Usuario o contraseña incorrectos");
    }

    // Retornar sin la contraseña
    return {
      id_trabajador: trabajador.id_trabajador,
      nombre_trabajador: trabajador.nombre_trabajador,
      apellido_trabajador: trabajador.apellido_trabajador,
      usuario: trabajador.usuario,
    };
  }
}
