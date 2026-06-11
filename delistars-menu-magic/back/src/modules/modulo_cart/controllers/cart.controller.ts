import { Request, Response, NextFunction } from 'express';
import { ApiResponse } from '@utils/api-response';

/**
 * Cart Controller
 */
export class CartController {
  async getCart(req: Request, res: Response, next: NextFunction): Promise<void> {}

  async addItem(req: Request, res: Response, next: NextFunction): Promise<void> {}

  async removeItem(req: Request, res: Response, next: NextFunction): Promise<void> {}

  async updateCart(req: Request, res: Response, next: NextFunction): Promise<void> {}

  async clearCart(req: Request, res: Response, next: NextFunction): Promise<void> {}
}
