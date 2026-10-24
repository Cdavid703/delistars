import { Router, Request, Response, NextFunction } from 'express';
import { requireUser } from '../../../middlewares/require-user';
import { pedidosApiActiva } from '../../../config/firestore';
import { ErrorPedido } from '../../modulo_pedidos/reglas/armado';
import { crearEntrega, confirmarEntrega, crearFondo, responderFondo, corregirFondo, resolver } from '../cuadres.service';

/** Cuadres de efectivo entre domiciliario y caja (Fase 7, especificación §13). */
const router = Router();

const activa = (_req: Request, res: Response, next: NextFunction) =>
  pedidosApiActiva() ? next() : res.status(503).json({ error: 'No disponible aquí todavía', codigo: 'inactiva' });

function responderError(res: Response, err: unknown) {
  if (err instanceof ErrorPedido) return res.status(err.status).json({ error: err.message, codigo: err.codigo });
  console.error('[cuadres] error:', err);
  return res.status(500).json({ error: 'No se pudo completar. Intenta de nuevo', codigo: 'interno' });
}

/**
 * @swagger
 * /api/v1/cuadres/entregas:
 *   post:
 *     tags: [Cuadres]
 *     summary: El domiciliario propone una entrega de efectivo a la caja (parcial o final)
 *     description: "{ sedeId, monto, pedidos?: [orderId], nota? } → { id, estado: 'propuesto' }"
 * /api/v1/cuadres/fondos:
 *   post:
 *     tags: [Cuadres]
 *     summary: La caja registra un fondo para cambio que le dio a un domiciliario
 *     description: "{ sedeId, driverEmail, driverName?, monto, nota? } → { id, estado: 'propuesto' }"
 * /api/v1/cuadres/{id}/{accion}:
 *   post:
 *     tags: [Cuadres]
 *     summary: "confirmar (caja, entregas) | responder (domiciliario, fondos) | corregir (caja, fondos) | resolver (admin, diferencias)"
 *     description: >
 *       confirmar: { montoRecibido?, motivo? } → confirmado si cuadra, con_diferencia (motivo obligatorio) si no; los pedidos cubiertos quedan cuadrados.
 *       responder: { acepta: true } o { acepta: false, montoRecibido } → confirmado | rechazado.
 *       corregir: { monto } sobre un fondo rechazado → propuesto otra vez (queda la corrección).
 *       resolver: { nota } sobre una entrega con diferencia → resuelto.
 */
router.post('/entregas', activa, requireUser, async (req: Request, res: Response) => {
  try { res.json(await crearEntrega(req.usuario!, req.body)); } catch (err) { responderError(res, err); }
});
router.post('/fondos', activa, requireUser, async (req: Request, res: Response) => {
  try { res.json(await crearFondo(req.usuario!, req.body)); } catch (err) { responderError(res, err); }
});
router.post('/:id/confirmar', activa, requireUser, async (req: Request, res: Response) => {
  try { res.json(await confirmarEntrega(req.usuario!, req.params.id, req.body)); } catch (err) { responderError(res, err); }
});
router.post('/:id/responder', activa, requireUser, async (req: Request, res: Response) => {
  try { res.json(await responderFondo(req.usuario!, req.params.id, req.body)); } catch (err) { responderError(res, err); }
});
router.post('/:id/corregir', activa, requireUser, async (req: Request, res: Response) => {
  try { res.json(await corregirFondo(req.usuario!, req.params.id, req.body)); } catch (err) { responderError(res, err); }
});
router.post('/:id/resolver', activa, requireUser, async (req: Request, res: Response) => {
  try { res.json(await resolver(req.usuario!, req.params.id, req.body)); } catch (err) { responderError(res, err); }
});

export default router;
