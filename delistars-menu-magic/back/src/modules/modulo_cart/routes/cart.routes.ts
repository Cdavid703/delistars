import { Router } from 'express';
import { CartController } from '../controllers/cart.controller';

const router = Router();
const cartController = new CartController();

/**
 * @route GET /api/v1/cart
 * @description Obtener carrito del usuario
 */
router.get('/', (req, res, next) => cartController.getCart(req, res, next));

/**
 * @route POST /api/v1/cart/items
 * @description Agregar item al carrito
 */
router.post('/items', (req, res, next) => cartController.addItem(req, res, next));

/**
 * @route DELETE /api/v1/cart/items/:itemId
 * @description Remover item del carrito
 */
router.delete('/items/:itemId', (req, res, next) => cartController.removeItem(req, res, next));

/**
 * @route PUT /api/v1/cart
 * @description Actualizar carrito
 */
router.put('/', (req, res, next) => cartController.updateCart(req, res, next));

/**
 * @route DELETE /api/v1/cart
 * @description Limpiar carrito
 */
router.delete('/', (req, res, next) => cartController.clearCart(req, res, next));

export default router;
