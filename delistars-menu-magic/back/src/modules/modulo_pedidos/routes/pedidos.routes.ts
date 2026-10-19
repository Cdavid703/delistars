import { Router, Request, Response, NextFunction } from 'express';
import { requireUser } from '../../../middlewares/require-user';
import { pedidosApiActiva } from '../../../config/firestore';
import { ErrorPedido } from '../reglas/armado';
import { conIdempotencia } from '../services/idempotencia.service';
import { crearPedido, transicionar } from '../services/pedidos.service';

/**
 * Pedidos (Fase 3). Todas las rutas piden token de Firebase y `Idempotency-Key`.
 * Respuestas de error: { error: texto para mostrar, codigo: identificador }.
 */
const router = Router();

const activa = (_req: Request, res: Response, next: NextFunction) =>
  pedidosApiActiva() ? next() : res.status(503).json({ error: 'La API de pedidos aún no está activa aquí', codigo: 'inactiva' });

function responderError(res: Response, err: unknown) {
  if (err instanceof ErrorPedido) return res.status(err.status).json({ error: err.message, codigo: err.codigo });
  console.error('[pedidos] error:', err);
  return res.status(500).json({ error: 'No se pudo procesar el pedido. Intenta de nuevo', codigo: 'interno' });
}

/**
 * @swagger
 * /api/v1/pedidos:
 *   post:
 *     tags: [Pedidos]
 *     summary: Crear un pedido (cliente con cuenta)
 *     description: >
 *       Precios del catálogo del servidor; domicilio por recorrido si llega `coords`.
 *       Encabezados: Authorization: Bearer <idToken>, Idempotency-Key: <uuid>.
 *     requestBody:
 *       content:
 *         application/json:
 *           example: { "sedeId": "santa_lucia", "deliveryMode": "delivery", "nombre": "Ana", "telefono": "3001234567",
 *             "direccion": "Cra 80 #45-10 apto 201", "barrio": "La América", "referencia": "Portería",
 *             "coords": { "lat": 6.25, "lng": -75.6 }, "notas": "",
 *             "items": [{ "id_producto": 4, "cantidad": 1, "adiciones": [{ "id_producto": 44, "cantidad": 1 }], "salsas": [74], "cebollas": [75] }] }
 *     responses:
 *       201: { description: "{ id, orderNumber, etapa, version, subtotal, deliveryPrice, total, items }" }
 */
router.post('/', activa, requireUser, async (req: Request, res: Response) => {
  try {
    const r = await conIdempotencia(req.usuario!.uid, req.get('Idempotency-Key'), req.body, async () => ({
      status: 201, body: await crearPedido(req.usuario!, req.body, req.ip ?? ''),
    }));
    res.status(r.status).json(r.body);
  } catch (err) { responderError(res, err); }
});

/**
 * @swagger
 * /api/v1/pedidos/{id}/transiciones:
 *   post:
 *     tags: [Pedidos]
 *     summary: Mover de etapa o poner una excepción
 *     description: >
 *       `a`: confirmado | en_preparacion | listo | en_camino | llego | entregado |
 *       excepcion:rechazado | excepcion:cancelado | excepcion:cancelacion_solicitada |
 *       excepcion:cambio_pendiente | excepcion:no_entregado | excepcion:devuelto.
 *       `version` (opcional, recomendado): la que el cliente vio; si cambió → 409.
 *     requestBody:
 *       content:
 *         application/json:
 *           example: { "a": "excepcion:cancelado", "motivo": "Me equivoqué de dirección", "version": 1 }
 *     responses:
 *       200: { description: "{ id, etapa, excepcion, version }" }
 */
router.post('/:id/transiciones', activa, requireUser, async (req: Request, res: Response) => {
  try {
    const cuerpo = { id: req.params.id, ...req.body };
    const r = await conIdempotencia(req.usuario!.uid, req.get('Idempotency-Key'), cuerpo, async () => ({
      status: 200, body: await transicionar(req.usuario!, req.params.id, req.body),
    }));
    res.status(r.status).json(r.body);
  } catch (err) { responderError(res, err); }
});

export default router;
