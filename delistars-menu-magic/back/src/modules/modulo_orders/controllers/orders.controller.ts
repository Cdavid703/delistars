import { Request, Response, NextFunction } from 'express';
import { ApiResponse } from '@utils/api-response';

/**
 * Orders Controller
 */
export class OrdersController {
  async getOrders(req: Request, res: Response, next: NextFunction): Promise<void> {}

  async getById(req: Request, res: Response, next: NextFunction): Promise<void> {}

  async create(req: Request, res: Response, next: NextFunction): Promise<void> {}

  async update(req: Request, res: Response, next: NextFunction): Promise<void> {}

  async cancel(req: Request, res: Response, next: NextFunction): Promise<void> {}
}
