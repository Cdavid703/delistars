import { Router } from 'express';
import { ProductsController } from '../controllers/products.controller';
import { requireAdmin } from '../../../middlewares/require-admin';

const router = Router();
const controller = new ProductsController();

/**
 * @swagger
 * /api/v1/products:
 *   get:
 *     tags:
 *       - Products
 *     summary: Obtener todos los productos
 *     description: Retorna un listado de todos los productos disponibles
 *     responses:
 *       200:
 *         description: Productos obtenidos exitosamente
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
 *                       id_producto:
 *                         type: number
 *                       nombre_producto:
 *                         type: string
 *                       descripcion_producto:
 *                         type: string
 *                       precio_venta:
 *                         type: number
 *                         format: float
 *                       id_categoria:
 *                         type: number
 *       500:
 *         description: Error del servidor
 */
router.get('/', (req, res) => controller.getAll(req, res));

/**
 * @swagger
 * /api/v1/products:
 *   post:
 *     tags:
 *       - Products
 *     summary: Crear un nuevo producto
 *     description: Crea un nuevo producto. Los campos image_url1 e image_url2 pueden ser null
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - nombre_producto
 *               - descripcion_producto
 *               - precio_venta
 *               - id_categoria
 *             properties:
 *               nombre_producto:
 *                 type: string
 *                 example: "Pizza Margarita"
 *               descripcion_producto:
 *                 type: string
 *                 example: "Pizza con tomate, mozzarella y albahaca"
 *               precio_venta:
 *                 type: number
 *                 format: float
 *                 example: 12.99
 *               id_categoria:
 *                 type: number
 *                 example: 1
 *               image_url1:
 *                 type: string
 *                 nullable: true
 *                 example: "https://example.com/image1.jpg"
 *               image_url2:
 *                 type: string
 *                 nullable: true
 *                 example: "https://example.com/image2.jpg"
 *     responses:
 *       201:
 *         description: Producto creado exitosamente
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
 *       400:
 *         description: Faltan campos requeridos
 *       500:
 *         description: Error del servidor
 */
router.post('/', requireAdmin, (req, res) => controller.create(req, res));

/**
 * @swagger
 * /api/v1/products/{id}:
 *   put:
 *     tags:
 *       - Products
 *     summary: Actualizar un producto
 *     description: Actualiza uno o varios campos de un producto. Todos los campos son opcionales. Los campos de imagen pueden ser null.
 *     parameters:
 *       - name: id
 *         in: path
 *         required: true
 *         schema:
 *           type: number
 *         description: ID del producto a actualizar
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               nombre_producto:
 *                 type: string
 *                 example: "Pizza Hawaiana"
 *               descripcion_producto:
 *                 type: string
 *                 example: "Pizza con piña y jamón"
 *               precio_venta:
 *                 type: number
 *                 format: float
 *                 example: 15000
 *               id_categoria:
 *                 type: number
 *                 example: 1
 *               image_url1:
 *                 type: string
 *                 nullable: true
 *                 example: "https://example.com/image1.jpg"
 *               image_url2:
 *                 type: string
 *                 nullable: true
 *                 example: "https://example.com/image2.jpg"
 *     responses:
 *       200:
 *         description: Producto actualizado exitosamente
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
 *       400:
 *         description: ID inválido o sin campos para actualizar
 *       500:
 *         description: Error del servidor
 */
router.put('/:id', requireAdmin, (req, res) => controller.update(req, res));

/**
 * @swagger
 * /api/v1/products/{id}:
 *   get:
 *     tags:
 *       - Products
 *     summary: Obtener un producto por ID
 *     description: Retorna los detalles de un producto específico
 *     parameters:
 *       - name: id
 *         in: path
 *         required: true
 *         schema:
 *           type: number
 *         description: ID del producto
 *     responses:
 *       200:
 *         description: Producto obtenido exitosamente
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
 *                     id_producto:
 *                       type: number
 *                     nombre_producto:
 *                       type: string
 *                     descripcion_producto:
 *                       type: string
 *                     precio_venta:
 *                       type: number
 *                       format: float
 *                     id_categoria:
 *                       type: number
 *       404:
 *         description: Producto no encontrado
 *       500:
 *         description: Error del servidor
 */
router.get('/:id', (req, res) => controller.getById(req, res));

/**
 * @swagger
 * /api/v1/products/{id}:
 *   delete:
 *     tags:
 *       - Products
 *     summary: Eliminar un producto
 *     description: Elimina un producto de la base de datos por su ID
 *     parameters:
 *       - name: id
 *         in: path
 *         required: true
 *         schema:
 *           type: number
 *         description: ID del producto a eliminar
 *     responses:
 *       200:
 *         description: Producto eliminado exitosamente
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
 *                   type: null
 *       400:
 *         description: ID inválido
 *       404:
 *         description: Producto no encontrado
 *       500:
 *         description: Error del servidor
 */
router.delete('/:id', requireAdmin, (req, res) => controller.delete(req, res));

export default router;
