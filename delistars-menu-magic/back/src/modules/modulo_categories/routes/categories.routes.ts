import { Router } from 'express';
import { CategoriesController } from '../controllers/categories.controller';
import { requireAdmin } from '../../../middlewares/require-admin';

const router = Router();
const controller = new CategoriesController();

/**
 * @swagger
 * /api/v1/categories:
 *   get:
 *     tags:
 *       - Categories
 *     summary: Obtener todas las categorías
 *     description: Retorna un listado de todas las categorías disponibles
 *     responses:
 *       200:
 *         description: Categorías obtenidas exitosamente
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 message:
 *                   type: string
 *                 data:
 *                   type: array
 *                   items:
 *                     type: object
 *                     properties:
 *                       id_categoria:
 *                         type: number
 *                       nombre_categoria:
 *                         type: string
 *       500:
 *         description: Error del servidor
 */
router.get('/', (req, res) => controller.getAll(req, res));

/**
 * @swagger
 * /api/v1/categories/{id}:
 *   get:
 *     tags:
 *       - Categories
 *     summary: Obtener una categoría por ID
 *     description: Retorna los detalles de una categoría específica
 *     parameters:
 *       - name: id
 *         in: path
 *         required: true
 *         schema:
 *           type: number
 *         description: ID de la categoría
 *     responses:
 *       200:
 *         description: Categoría obtenida exitosamente
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 message:
 *                   type: string
 *                 data:
 *                   type: object
 *                   properties:
 *                     id_categoria:
 *                       type: number
 *                     nombre_categoria:
 *                       type: string
 *       404:
 *         description: Categoría no encontrada
 *       500:
 *         description: Error del servidor
 */
router.get('/:id', (req, res) => controller.getById(req, res));

/**
 * @swagger
 * /categories:
 *   post:
 *     tags:
 *       - Categories
 *     summary: Crear una nueva categoría
 *     description: Crea una nueva categoría en la base de datos
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               nombre_categoria:
 *                 type: string
 *                 example: "Pizzas"
 *             required:
 *               - nombre_categoria
 *     responses:
 *       201:
 *         description: Categoría creada exitosamente
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 message:
 *                   type: string
 *                 data:
 *                   type: object
 *                   properties:
 *                     id_categoria:
 *                       type: number
 *                     nombre_categoria:
 *                       type: string
 *       400:
 *         description: Nombre de categoría requerido o vacío
 *       500:
 *         description: Error del servidor
 */
router.post('/', requireAdmin, (req, res) => controller.create(req, res));

export default router;
