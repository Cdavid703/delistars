import type { Request, Response } from "express";
import { TrabajadorService } from "../services/trabajador.service";

const trabajadorService = new TrabajadorService();

export class TrabajadorController {
  /**
   * POST /api/v1/trabajadores - Crear nuevo trabajador
   */
  static async createTrabajador(req: Request, res: Response): Promise<void> {
    try {
      const { nombre_trabajador, apellido_trabajador, usuario, usuario_password } = req.body;

      const trabajador = await trabajadorService.createTrabajador({
        nombre_trabajador,
        apellido_trabajador,
        usuario,
        usuario_password,
      });

      res.status(201).json({
        success: true,
        message: "Trabajador creado exitosamente",
        data: trabajador,
      });
    } catch (error: any) {
      res.status(400).json({
        success: false,
        message: error.message || "Error al crear el trabajador",
      });
    }
  }

  /**
   * GET /api/v1/trabajadores/:id - Obtener trabajador por ID
   */
  static async getTrabajadorById(req: Request, res: Response): Promise<void> {
    try {
      const { id } = req.params;
      const trabajador = await trabajadorService.getTrabajadorById(Number(id));

      res.json({
        success: true,
        data: trabajador,
      });
    } catch (error: any) {
      res.status(404).json({
        success: false,
        message: error.message || "Trabajador no encontrado",
      });
    }
  }

  /**
   * GET /api/v1/trabajadores - Obtener todos los trabajadores
   */
  static async getAllTrabajadores(req: Request, res: Response): Promise<void> {
    try {
      const trabajadores = await trabajadorService.getAllTrabajadores();

      res.json({
        success: true,
        count: trabajadores.length,
        data: trabajadores,
      });
    } catch (error: any) {
      res.status(400).json({
        success: false,
        message: error.message || "Error al obtener los trabajadores",
      });
    }
  }

  /**
   * PUT /api/v1/trabajadores/:id - Actualizar trabajador
   */
  static async updateTrabajador(req: Request, res: Response): Promise<void> {
    try {
      const { id } = req.params;
      const { nombre_trabajador, apellido_trabajador } = req.body;

      const trabajador = await trabajadorService.updateTrabajador(
        Number(id),
        nombre_trabajador,
        apellido_trabajador
      );

      res.json({
        success: true,
        message: "Trabajador actualizado exitosamente",
        data: trabajador,
      });
    } catch (error: any) {
      res.status(400).json({
        success: false,
        message: error.message || "Error al actualizar el trabajador",
      });
    }
  }

  /**
   * PUT /api/v1/trabajadores/:id/cambiar-contraseña - Cambiar contraseña
   */
  static async changePassword(req: Request, res: Response): Promise<void> {
    try {
      const { id } = req.params;
      // El admin envía `usuario_password`; se acepta también `newPassword` por compat.
      const newPassword = req.body.usuario_password ?? req.body.newPassword;

      await trabajadorService.changePassword(Number(id), newPassword);

      res.json({
        success: true,
        message: "Contraseña actualizada exitosamente",
      });
    } catch (error: any) {
      res.status(400).json({
        success: false,
        message: error.message || "Error al cambiar la contraseña",
      });
    }
  }

  /**
   * DELETE /api/v1/trabajadores/:id - Eliminar trabajador
   */
  static async deleteTrabajador(req: Request, res: Response): Promise<void> {
    try {
      const { id } = req.params;
      await trabajadorService.deleteTrabajador(Number(id));

      res.json({
        success: true,
        message: "Trabajador eliminado exitosamente",
      });
    } catch (error: any) {
      res.status(400).json({
        success: false,
        message: error.message || "Error al eliminar el trabajador",
      });
    }
  }

  /**
   * POST /api/v1/trabajadores/login - Login de trabajador
   */
  static async login(req: Request, res: Response): Promise<void> {
    try {
      const { usuario, usuario_password } = req.body;

      if (!usuario || !usuario_password) {
        res.status(400).json({
          success: false,
          message: "Usuario y contraseña son requeridos",
        });
        return;
      }

      const trabajador = await trabajadorService.login(usuario, usuario_password);

      res.json({
        success: true,
        message: "Login exitoso",
        data: trabajador,
      });
    } catch (error: any) {
      res.status(401).json({
        success: false,
        message: error.message || "Error en el login",
      });
    }
  }
}
