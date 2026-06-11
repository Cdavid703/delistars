import { Router } from 'express';
import { SedeController } from '../controllers/sede.controller';

const router = Router();
const sedeController = new SedeController();

/**
 * @swagger
 * /api/v1/sedes:
 *   get:
 *     tags:
 *       - Sedes
 *     summary: Obtener todas las sedes
 *     description: Retorna un listado de todas las sedes disponibles buscando en tbl_sedes.
 *     responses:
 *       200:
 *         description: Lista de sedes obtenida correctamente
 *       500:
 *         description: Error en el servidor
 */
router.get('/', sedeController.getAllSedes);

/**
 * @swagger
 * /api/v1/sedes:
 *   post:
 *     tags:
 *       - Sedes
 *     summary: Crear nueva sede
 *     description: Crea una nueva sede. Todos los campos son requeridos.
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - nombre_sede
 *               - telefono_sede
 *               - direccion_sede
 *               - horario_lunes_jueves
 *               - horario_viernes
 *               - horario_sabado
 *               - horario_domingo
 *             properties:
 *               nombre_sede:
 *                 type: string
 *                 example: "Sede Centro"
 *               telefono_sede:
 *                 type: string
 *                 example: "(123) 456-7890"
 *               direccion_sede:
 *                 type: string
 *                 example: "Calle Principal 123"
 *               horario_lunes_jueves:
 *                 type: string
 *                 example: "10:00 - 22:00"
 *               horario_viernes:
 *                 type: string
 *                 example: "10:00 - 23:00"
 *               horario_sabado:
 *                 type: string
 *                 example: "10:00 - 23:00"
 *               horario_domingo:
 *                 type: string
 *                 example: "11:00 - 22:00"
 *     responses:
 *       201:
 *         description: Sede creada correctamente
 *       400:
 *         description: Error de validación - faltan campos requeridos
 *       500:
 *         description: Error en el servidor
 */
router.post('/', sedeController.createSede);

/**
 * @swagger
 * /api/v1/sedes/{id}:
 *   get:
 *     tags:
 *       - Sedes
 *     summary: Obtener sede por ID
 *     description: Retorna los detalles de una sede específica.
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *         description: ID de la sede
 *     responses:
 *       200:
 *         description: Sede obtenida correctamente
 *       404:
 *         description: Sede no encontrada
 *       500:
 *         description: Error en el servidor
 */
router.get('/:id', sedeController.getSedeById);

/**
 * @swagger
 * /api/v1/sedes/{id}:
 *   put:
 *     tags:
 *       - Sedes
 *     summary: Actualizar sede
 *     description: Actualiza uno o todos los parámetros de una sede. Solo se actualizan los campos proporcionados.
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *         description: ID de la sede a actualizar
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               nombre_sede:
 *                 type: string
 *               telefono_sede:
 *                 type: string
 *               direccion_sede:
 *                 type: string
 *               horario_lunes_jueves:
 *                 type: string
 *               horario_viernes:
 *                 type: string
 *               horario_sabado:
 *                 type: string
 *               horario_domingo:
 *                 type: string
 *     responses:
 *       200:
 *         description: Sede actualizada correctamente
 *       400:
 *         description: Datos inválidos
 *       404:
 *         description: Sede no encontrada
 *       500:
 *         description: Error en el servidor
 */
router.put('/:id', sedeController.updateSede);

export default router;
