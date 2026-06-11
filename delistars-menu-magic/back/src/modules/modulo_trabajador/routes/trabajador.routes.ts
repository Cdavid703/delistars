import { Router } from "express";
import { TrabajadorController } from "../controllers/trabajador.controller";

const router = Router();

/**
 * @swagger
 * /trabajadores/login:
 *   post:
 *     tags:
 *       - Trabajadores
 *     summary: Login de trabajador
 *     description: Autentica un trabajador verificando usuario y contraseña
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - usuario
 *               - usuario_password
 *             properties:
 *               usuario:
 *                 type: string
 *                 example: jperez
 *               usuario_password:
 *                 type: string
 *                 example: password123
 *     responses:
 *       200:
 *         description: Login exitoso
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
 *       401:
 *         description: Usuario o contraseña incorrectos
 */
router.post("/login", TrabajadorController.login);

/**
 * @swagger
 * /trabajadores:
 *   post:
 *     tags:
 *       - Trabajadores
 *     summary: Crear nuevo trabajador
 *     description: Crea un nuevo trabajador con contraseña cifrada segura (bcrypt)
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - nombre_trabajador
 *               - apellido_trabajador
 *               - usuario
 *               - usuario_password
 *             properties:
 *               nombre_trabajador:
 *                 type: string
 *                 maxLength: 100
 *                 example: Juan
 *               apellido_trabajador:
 *                 type: string
 *                 maxLength: 100
 *                 example: Pérez
 *               usuario:
 *                 type: string
 *                 maxLength: 70
 *                 example: jperez
 *               usuario_password:
 *                 type: string
 *                 minLength: 6
 *                 example: password123
 *     responses:
 *       201:
 *         description: Trabajador creado exitosamente
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
 *                     id_trabajador:
 *                       type: integer
 *                     nombre_trabajador:
 *                       type: string
 *                     apellido_trabajador:
 *                       type: string
 *                     usuario:
 *                       type: string
 *       400:
 *         description: Error al crear el trabajador
 */
router.post("/", TrabajadorController.createTrabajador);

/**
 * @swagger
 * /trabajadores:
 *   get:
 *     tags:
 *       - Trabajadores
 *     summary: Obtener todos los trabajadores
 *     description: Lista todos los trabajadores registrados (sin incluir contraseñas)
 *     responses:
 *       200:
 *         description: Lista de trabajadores obtenida
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
 *                       id_trabajador:
 *                         type: integer
 *                       nombre_trabajador:
 *                         type: string
 *                       apellido_trabajador:
 *                         type: string
 *                       usuario:
 *                         type: string
 *       400:
 *         description: Error al obtener los trabajadores
 */
router.get("/", TrabajadorController.getAllTrabajadores);

/**
 * @swagger
 * /trabajadores/{id}:
 *   get:
 *     tags:
 *       - Trabajadores
 *     summary: Obtener trabajador por ID
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *         description: ID del trabajador
 *     responses:
 *       200:
 *         description: Trabajador encontrado
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
 *         description: Trabajador no encontrado
 */
router.get("/:id", TrabajadorController.getTrabajadorById);

/**
 * @swagger
 * /trabajadores/{id}/cambiar-contraseña:
 *   put:
 *     tags:
 *       - Trabajadores
 *     summary: Cambiar contraseña
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *         description: ID del trabajador
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - newPassword
 *             properties:
 *               newPassword:
 *                 type: string
 *                 minLength: 6
 *                 example: newpassword123
 *     responses:
 *       200:
 *         description: Contraseña actualizada exitosamente
 *       400:
 *         description: Error al cambiar la contraseña
 */
router.put("/:id/cambiar-contraseña", TrabajadorController.changePassword);

export default router;
