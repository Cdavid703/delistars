import { Router } from 'express';
import { OrdersController } from '../controllers/orders.controller';

const router = Router();
const ordersController = new OrdersController();

/**
 * @route GET /api/v1/orders
 * @description Obtener órdenes del usuario
 */
router.get('/', (req, res, next) => ordersController.getOrders(req, res, next));

/**
 * @route GET /api/v1/orders/:id
 * @description Obtener orden por ID
 */
router.get('/:id', (req, res, next) => ordersController.getById(req, res, next));

/**
 * @route POST /api/v1/orders
 * @description Crear nueva orden
 */
router.post('/', (req, res, next) => ordersController.create(req, res, next));

/**
 * @route PUT /api/v1/orders/:id
 * @description Actualizar estado de orden
 */
router.put('/:id', (req, res, next) => ordersController.update(req, res, next));

/**
 * @route DELETE /api/v1/orders/:id
 * @description Cancelar orden
 */
router.delete('/:id', (req, res, next) => ordersController.cancel(req, res, next));

export default router;
