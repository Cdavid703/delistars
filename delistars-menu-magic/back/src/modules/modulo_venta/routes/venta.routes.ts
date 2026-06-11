import { Router } from "express";
import { VentaController } from "../controllers/venta.controller";

const router = Router();

/**
 * @swagger
 * /ventas:
 *   post:
 *     tags:
 *       - Ventas
 *     summary: Crear nueva venta
 *     description: Crea una nueva venta con múltiples productos y adiciones. Inserta en tbl_ventas y tbl_detalle_venta
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - id_trabajador
 *               - id_sede
 *               - items
 *             properties:
 *               id_trabajador:
 *                 type: integer
 *                 example: 1
 *               id_sede:
 *                 type: integer
 *                 example: 1
 *               items:
 *                 type: array
 *                 items:
 *                   type: object
 *                   properties:
 *                     id_producto:
 *                       type: integer
 *                       example: 1
 *                     cantidad_producto:
 *                       type: integer
 *                       example: 2
 *                     valor_unitario:
 *                       type: number
 *                       format: double
 *                       example: 14900
 *                     valor_total_x_producto:
 *                       type: number
 *                       format: double
 *                       example: 29800
 *                     adiciones:
 *                       type: array
 *                       items:
 *                         type: object
 *                         properties:
 *                           id_producto:
 *                             type: integer
 *                             example: 10
 *                           cantidad:
 *                             type: integer
 *                             example: 2
 *                           valor_unitario:
 *                             type: number
 *                             format: double
 *                             example: 3000
 *     responses:
 *       201:
 *         description: Venta creada exitosamente
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
 *                     id_venta:
 *                       type: integer
 *                     fecha_venta:
 *                       type: string
 *                       format: date-time
 *                     id_trabajador:
 *                       type: integer
 *                     id_sede:
 *                       type: integer
 *                     total_venta:
 *                       type: number
 *                       format: double
 *                     pedido_confirmado:
 *                       type: boolean
 *       400:
 *         description: Error al crear la venta
 */
router.post("/", VentaController.createVenta);

/**
 * @swagger
 * /ventas:
 *   get:
 *     tags:
 *       - Ventas
 *     summary: Obtener todas las ventas
 *     description: Lista todas las ventas registradas ordenadas por fecha descendente
 *     responses:
 *       200:
 *         description: Lista de ventas obtenida
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 count:
 *                   type: integer
 *                 data:
 *                   type: array
 *                   items:
 *                     type: object
 *                     properties:
 *                       id_venta:
 *                         type: integer
 *                       fecha_venta:
 *                         type: string
 *                         format: date-time
 *                       id_trabajador:
 *                         type: integer
 *                       id_sede:
 *                         type: integer
 *                       total_venta:
 *                         type: number
 *                         format: double
 *                       pedido_confirmado:
 *                         type: boolean
 *       400:
 *         description: Error al obtener las ventas
 */
router.get("/", VentaController.getAllVentas);

/**
 * GET /ventas/summary
 * Resumen: suma de total_venta (opcionalmente filtrada por startDate y endDate)
 */
router.get("/summary", VentaController.getTotalVentas);
router.get("/summary/domicilio", VentaController.getTotalValorDomicilio);
router.get("/count", VentaController.getCountVentas);

/**
 * @swagger
 * /ventas/{id}:
 *   get:
 *     tags:
 *       - Ventas
 *     summary: Obtener venta por ID
 *     description: Obtiene una venta específica con todos sus detalles
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *         description: ID de la venta
 *     responses:
 *       200:
 *         description: Venta encontrada
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 data:
 *                   type: object
 *       404:
 *         description: Venta no encontrada
 *       400:
 *         description: Error al obtener la venta
 */
router.get("/:id", VentaController.getVentaById);

/**
 * @swagger
 * /ventas/sede/{id_sede}:
 *   get:
 *     tags:
 *       - Ventas
 *     summary: Obtener ventas por sede
 *     description: Lista todas las ventas de una sede específica
 *     parameters:
 *       - in: path
 *         name: id_sede
 *         required: true
 *         schema:
 *           type: integer
 *         description: ID de la sede
 *     responses:
 *       200:
 *         description: Ventas de la sede obtenidas
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 count:
 *                   type: integer
 *                 data:
 *                   type: array
 *       400:
 *         description: Error al obtener las ventas
 */
router.get("/sede/:id_sede", VentaController.getVentasBySede);

/**
 * @swagger
 * /ventas/{id}/confirmar:
 *   put:
 *     tags:
 *       - Ventas
 *     summary: Confirmar pedido
 *     description: Marca un pedido como confirmado (pedido_confirmado = true)
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *         description: ID de la venta
 *     responses:
 *       200:
 *         description: Pedido confirmado exitosamente
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
 *         description: Error al confirmar el pedido
 */
router.put("/:id/confirmar", VentaController.confirmarPedido);

/**
 * @swagger
 * /ventas/{id}/cancelar:
 *   put:
 *     tags:
 *       - Ventas
 *     summary: Cancelar pedido
 *     description: Marca un pedido como no confirmado (pedido_confirmado = false)
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *         description: ID de la venta
 *     responses:
 *       200:
 *         description: Pedido cancelado exitosamente
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
 *         description: Error al cancelar el pedido
 */
router.put("/:id/cancelar", VentaController.cancelarPedido);

export default router;
