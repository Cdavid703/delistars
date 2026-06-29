import { SedeRepository } from '../repositories/sede.repository';
import { ISede } from '../models/entities/sede.entity';
import { UpdateSedeDTO } from '../models/dto/update-sede.dto';
import { CreateSedeDTO } from '../models/dto/create-sede.dto';

export class SedeService {
  private sedeRepository: SedeRepository;

  constructor() {
    this.sedeRepository = new SedeRepository();
  }

  async getAllSedes(): Promise<ISede[]> {
    return await this.sedeRepository.findAll();
  }

  async getSedeById(id: number): Promise<ISede | null> {
    return await this.sedeRepository.findById(id);
  }

  async createSede(createData: CreateSedeDTO): Promise<ISede> {
    const errors = createData.validate();
    if (errors.length > 0) {
      throw new Error(`Validación fallida: ${errors.join(', ')}`);
    }
    return await this.sedeRepository.create(createData);
  }

  async updateSede(id: number, updateData: UpdateSedeDTO): Promise<ISede | null> {
    return await this.sedeRepository.update(id, updateData);
  }

  async deleteSede(id: number): Promise<boolean> {
    const sede = await this.sedeRepository.findById(id);
    if (!sede) return false;
    try {
      return await this.sedeRepository.delete(id);
    } catch (error: unknown) {
      // 23503 = foreign_key_violation: hay ventas que referencian esta sede.
      if (typeof error === 'object' && error !== null && (error as { code?: string }).code === '23503') {
        throw new Error('No se puede eliminar la sede porque tiene ventas asociadas');
      }
      throw error;
    }
  }
}
