import { Router, Request, Response, NextFunction } from 'express';
import { requireUser } from '../../../middlewares/require-user';
import { pedidosApiActiva } from '../../../config/firestore';
import { ErrorPedido } from '../../modulo_pedidos/reglas/armado';
import { conIdempotenciaOpcional } from '../../modulo_pedidos/services/idempotencia.service';
import { crearReclamo, revisar, proponer, autorizar, responder, completarReembolso, cerrar, mensaje } from '../reclamos.service';

/** Reclamos, devoluciones y saldo a favor (Fase 7, especificación §14). */
const router = Router();

const activa = (_req: Request, res: Response, next: NextFunction) =>
  pedidosApiActiva() ? next() : res.status(503).json({ error: 'No disponible aquí todavía', codigo: 'inactiva' });

function responderError(res: Response, err: unknown) {
  if (err instanceof ErrorPedido) return res.status(err.status).json({ error: err.message, codigo: err.codigo });
  console.error('[reclamos] error:', err);
  return res.status(500).json({ error: 'No se pudo completar. Intenta de nuevo', codigo: 'interno' });
}

/**
 * @swagger
 * /api/v1/reclamos:
 *   post:
 *     tags: [Reclamos]
 *     summary: El cliente reporta un problema de un pedido entregado (hasta 24 h después)
 *     description: >
 *       { orderId, categoria: 'producto' | 'entrega', motivo, descripcion } → { id, estado: 'recibido' }.
 *       Errores: 409 no_entregado | vencido | sin_cuenta | abierto (ya hay un caso abierto), 422 categoria | motivo | descripcion | largo.
 */
router.post('/', activa, requireUser, async (req: Request, res: Response) => {
  try { res.json(await crearReclamo(req.usuario!, req.body)); } catch (err) { responderError(res, err); }
});

/**
 * @swagger
 * /api/v1/reclamos/{id}/{accion}:
 *   post:
 *     tags: [Reclamos]
 *     summary: "revisar | proponer | autorizar | responder | reembolso | cerrar | mensaje"
 *     description: >
 *       revisar (caja de la sede si es de producto; admin): recibido → en_revision.
 *       proponer (equipo): { texto, reembolso? } → propuesta; con reembolso de la caja queda en_revision hasta que admin autorice.
 *       autorizar (admin): { monto? } o { rechazar: true, motivo } sobre un reembolso solicitado.
 *       responder (cliente): { acepta: true, eleccion?: 'saldo' | 'transferencia', datos? } → resuelto; { acepta: false, texto? } → en_revision
 *       (texto opcional, W-7). Transferencia sin `datos` → reembolso.estado `faltan_datos` (W-6): la caja no ve nada por transferir
 *       hasta que el cliente complete con reembolso { eleccion: 'transferencia', datos } o cambie a { eleccion: 'saldo' }.
 *       cerrar (admin): { motivo } → cierre_administrativo. mensaje (cliente o quien atiende): { texto }.
 *     responses:
 *       200: { description: "{ id, estado, reembolso }" }
 */
router.post('/:id/revisar', activa, requireUser, async (req: Request, res: Response) => {
  try { res.json(await revisar(req.usuario!, req.params.id)); } catch (err) { responderError(res, err); }
});
router.post('/:id/proponer', activa, requireUser, async (req: Request, res: Response) => {
  try { res.json(await proponer(req.usuario!, req.params.id, req.body)); } catch (err) { responderError(res, err); }
});
router.post('/:id/autorizar', activa, requireUser, async (req: Request, res: Response) => {
  try { res.json(await autorizar(req.usuario!, req.params.id, req.body)); } catch (err) { responderError(res, err); }
});
// responder y mensaje aceptan Idempotency-Key opcional (W-4): un reintento no
// duplica el mensaje ni la respuesta.
router.post('/:id/responder', activa, requireUser, async (req: Request, res: Response) => {
  try {
    const r = await conIdempotenciaOpcional(req.usuario!.uid, req.get('Idempotency-Key'), { id: req.params.id, responder: true, ...req.body }, async () => ({
      status: 200, body: await responder(req.usuario!, req.params.id, req.body),
    }));
    res.status(r.status).json(r.body);
  } catch (err) { responderError(res, err); }
});
router.post('/:id/reembolso', activa, requireUser, async (req: Request, res: Response) => {
  try {
    const r = await conIdempotenciaOpcional(req.usuario!.uid, req.get('Idempotency-Key'), { id: req.params.id, reembolso: true, ...req.body }, async () => ({
      status: 200, body: await completarReembolso(req.usuario!, req.params.id, req.body),
    }));
    res.status(r.status).json(r.body);
  } catch (err) { responderError(res, err); }
});
router.post('/:id/cerrar', activa, requireUser, async (req: Request, res: Response) => {
  try { res.json(await cerrar(req.usuario!, req.params.id, req.body)); } catch (err) { responderError(res, err); }
});
router.post('/:id/mensaje', activa, requireUser, async (req: Request, res: Response) => {
  try {
    const r = await conIdempotenciaOpcional(req.usuario!.uid, req.get('Idempotency-Key'), { id: req.params.id, mensaje: true, texto: req.body?.texto }, async () => ({
      status: 200, body: await mensaje(req.usuario!, req.params.id, req.body?.texto),
    }));
    res.status(r.status).json(r.body);
  } catch (err) { responderError(res, err); }
});

export default router;
