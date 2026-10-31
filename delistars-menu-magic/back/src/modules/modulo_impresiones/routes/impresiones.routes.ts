import { Router, Request, Response, NextFunction } from 'express';
import { requireUser } from '../../../middlewares/require-user';
import { pedidosApiActiva } from '../../../config/firestore';
import { ErrorPedido } from '../../modulo_pedidos/reglas/armado';
import { conIdempotencia } from '../../modulo_pedidos/services/idempotencia.service';
import { solicitar, prueba, tomar, resultado, revisar, descartar } from '../impresiones.service';

/** Impresión de comandas por el puente de la sede (Fase 7, especificación §19). */
const router = Router();

const activa = (_req: Request, res: Response, next: NextFunction) =>
  pedidosApiActiva() ? next() : res.status(503).json({ error: 'No disponible aquí todavía', codigo: 'inactiva' });

function responderError(res: Response, err: unknown) {
  if (err instanceof ErrorPedido) return res.status(err.status).json({ error: err.message, codigo: err.codigo });
  console.error('[impresiones] error:', err);
  return res.status(500).json({ error: 'No se pudo completar. Intenta de nuevo', codigo: 'interno' });
}

/**
 * @swagger
 * /api/v1/impresiones:
 *   post:
 *     tags: [Impresiones]
 *     summary: La caja pide imprimir la comanda de un pedido
 *     description: >
 *       Encabezado Idempotency-Key. { orderId, copia?: true, motivo?, origen?: 'web'|'app' } →
 *       { id, estado: 'pendiente', tipo: original|actualizada|copia }. 409 en_cola, ya_impresa, sin_original, cancelado. El motivo de la copia es opcional.
 * /api/v1/impresiones/prueba:
 *   post:
 *     tags: [Impresiones]
 *     summary: "Página de prueba de la impresora: { sedeId }"
 * /api/v1/impresiones/{id}/{accion}:
 *   post:
 *     tags: [Impresiones]
 *     summary: "tomar { puesto } y resultado { puesto, ok, error? } (el puente) · revisar { salio } y descartar (la caja)"
 */
router.post('/', activa, requireUser, async (req: Request, res: Response) => {
  try {
    const r = await conIdempotencia(req.usuario!.uid, req.get('Idempotency-Key'), req.body, async () => ({ status: 201, body: await solicitar(req.usuario!, req.body) }));
    res.status(r.status).json(r.body);
  } catch (err) { responderError(res, err); }
});
router.post('/prueba', activa, requireUser, async (req: Request, res: Response) => {
  try { res.status(201).json(await prueba(req.usuario!, req.body)); } catch (err) { responderError(res, err); }
});
router.post('/:id/tomar', activa, requireUser, async (req: Request, res: Response) => {
  try { res.json(await tomar(req.usuario!, req.params.id, req.body)); } catch (err) { responderError(res, err); }
});
router.post('/:id/resultado', activa, requireUser, async (req: Request, res: Response) => {
  try { res.json(await resultado(req.usuario!, req.params.id, req.body)); } catch (err) { responderError(res, err); }
});
router.post('/:id/revisar', activa, requireUser, async (req: Request, res: Response) => {
  try { res.json(await revisar(req.usuario!, req.params.id, req.body)); } catch (err) { responderError(res, err); }
});
router.post('/:id/descartar', activa, requireUser, async (req: Request, res: Response) => {
  try { res.json(await descartar(req.usuario!, req.params.id)); } catch (err) { responderError(res, err); }
});

export default router;
