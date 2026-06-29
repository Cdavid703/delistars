import { Request, Response } from 'express';
import { SedeService } from '../services/sede.service';
import { UpdateSedeDTO } from '../models/dto/update-sede.dto';
import { CreateSedeDTO } from '../models/dto/create-sede.dto';

export class SedeController {
  private sedeService: SedeService;

  constructor() {
    this.sedeService = new SedeService();
  }

  public getAllSedes = async (req: Request, res: Response): Promise<void> => {
    try {
      const sedes = await this.sedeService.getAllSedes();
      res.status(200).json(sedes);
    } catch (error) {
      console.error('Error al obtener sedes:', error);
      res.status(500).json({
        message: 'Error al obtener las sedes',
        error: error instanceof Error ? error.message : 'Error desconocido'
      });
    }
  };

  public getSedeById = async (req: Request, res: Response): Promise<void> => {
    try {
      const { id } = req.params;
      const sede = await this.sedeService.getSedeById(Number(id));
      
      if (!sede) {
        res.status(404).json({
          message: 'Sede no encontrada'
        });
        return;
      }
      
      res.status(200).json(sede);
    } catch (error) {
      console.error('Error al obtener sede:', error);
      res.status(500).json({
        message: 'Error al obtener la sede',
        error: error instanceof Error ? error.message : 'Error desconocido'
      });
    }
  };

  public createSede = async (req: Request, res: Response): Promise<void> => {
    try {
      const createData = new CreateSedeDTO(req.body);
      const newSede = await this.sedeService.createSede(createData);
      
      res.status(201).json({
        message: 'Sede creada correctamente',
        data: newSede
      });
    } catch (error) {
      console.error('Error al crear sede:', error);
      
      const errorMessage = error instanceof Error ? error.message : 'Error desconocido';
      
      if (errorMessage.includes('Validación fallida')) {
        res.status(400).json({
          message: 'Error de validación',
          error: errorMessage
        });
      } else {
        res.status(500).json({
          message: 'Error al crear la sede',
          error: errorMessage
        });
      }
    }
  };

  public updateSede = async (req: Request, res: Response): Promise<void> => {
    try {
      const { id } = req.params;
      const updateData: UpdateSedeDTO = req.body;
      
      // Validar que el ID sea válido
      const sedeId = Number(id);
      if (isNaN(sedeId)) {
        res.status(400).json({
          message: 'ID de sede inválido'
        });
        return;
      }

      // Validar que al menos un campo sea proporcionado
      if (Object.keys(updateData).length === 0) {
        res.status(400).json({
          message: 'Se debe proporcionar al menos un campo para actualizar'
        });
        return;
      }

      const updatedSede = await this.sedeService.updateSede(sedeId, updateData);
      
      if (!updatedSede) {
        res.status(404).json({
          message: 'Sede no encontrada'
        });
        return;
      }
      
      res.status(200).json({
        message: 'Sede actualizada correctamente',
        data: updatedSede
      });
    } catch (error) {
      console.error('Error al actualizar sede:', error);
      res.status(500).json({
        message: 'Error al actualizar la sede',
        error: error instanceof Error ? error.message : 'Error desconocido'
      });
    }
  };

  public deleteSede = async (req: Request, res: Response): Promise<void> => {
    try {
      const sedeId = Number(req.params.id);
      if (isNaN(sedeId)) {
        res.status(400).json({ message: 'ID de sede inválido' });
        return;
      }

      const deleted = await this.sedeService.deleteSede(sedeId);
      if (!deleted) {
        res.status(404).json({ message: 'Sede no encontrada' });
        return;
      }

      res.status(200).json({ message: 'Sede eliminada correctamente' });
    } catch (error) {
      console.error('Error al eliminar sede:', error);
      const errorMessage = error instanceof Error ? error.message : 'Error desconocido';
      if (errorMessage.includes('ventas asociadas')) {
        res.status(409).json({ message: 'No se puede eliminar la sede', error: errorMessage });
      } else {
        res.status(500).json({ message: 'Error al eliminar la sede', error: errorMessage });
      }
    }
  };
}
