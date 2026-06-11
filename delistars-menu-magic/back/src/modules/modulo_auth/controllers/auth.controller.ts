import { Request, Response, NextFunction } from 'express';
import { ApiResponse } from '@utils/api-response';

/**
 * Auth Controller
 * Maneja los requests de autenticación
 */
export class AuthController {
  async login(req: Request, res: Response, next: NextFunction): Promise<void> {}

  async register(req: Request, res: Response, next: NextFunction): Promise<void> {}

  async refresh(req: Request, res: Response, next: NextFunction): Promise<void> {}
}
