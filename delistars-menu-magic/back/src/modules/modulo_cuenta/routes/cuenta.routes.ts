import { Router, Request, Response, NextFunction } from 'express';
import { requireUser } from '../../../middlewares/require-user';
import { pedidosApiActiva } from '../../../config/firestore';
import { ErrorPedido } from '../../modulo_pedidos/reglas/armado';
import {
  estadoEliminacion, solicitarEliminacion, cancelarEliminacion, marcarSaldoTransferido,
} from '../cuenta.service';

/** Mi cuenta (Fase 4, paso 4): eliminar la cuenta y devolver el saldo. */
const router = Router();

const activa = (_req: Request, res: Response, next: NextFunction) =>
  pedidosApiActiva() ? next() : res.status(503).json({ error: 'No disponible aquí todavía', codigo: 'inactiva' });

function responderError(res: Response, err: unknown) {
  if (err instanceof ErrorPedido) return res.status(err.status).json({ error: err.message, codigo: err.codigo });
  console.error('[cuenta] error:', err);
  return res.status(500).json({ error: 'No se pudo completar. Intenta de nuevo', codigo: 'interno' });
}

/**
 * @swagger
 * /api/v1/cuenta/eliminacion:
 *   get:
 *     tags: [Cuenta]
 *     summary: Estado de la eliminación de mi cuenta
 *     responses:
 *       200: { description: "{ solicitud: null | { solicitadaAt, ejecutarDesde }, pendientes: [{ tipo, id, texto }], saldo: { sedeId: monto } }" }
 *   post:
 *     tags: [Cuenta]
 *     summary: Pedir que borren mi cuenta (a los 30 días, sin pendientes)
 *     description: >
 *       Exige haber iniciado sesión hace menos de 10 min (si no → 401 `sesion_vieja`: volver a entrar).
 *       Con saldo a favor, `datosDevolucion` es obligatorio: { medio: Nequi|Daviplata|Bancolombia|Otro banco, numero, titular, documento? }.
 *   delete:
 *     tags: [Cuenta]
 *     summary: Arrepentirse (la cuenta sigue)
 */
router.get('/eliminacion', activa, requireUser, async (req: Request, res: Response) => {
  try { res.set('Cache-Control', 'no-store').json(await estadoEliminacion(req.usuario!)); } catch (err) { responderError(res, err); }
});
router.post('/eliminacion', activa, requireUser, async (req: Request, res: Response) => {
  try { res.json(await solicitarEliminacion(req.usuario!, req.body)); } catch (err) { responderError(res, err); }
});
router.delete('/eliminacion', activa, requireUser, async (req: Request, res: Response) => {
  try { res.json(await cancelarEliminacion(req.usuario!)); } catch (err) { responderError(res, err); }
});

/**
 * @swagger
 * /api/v1/cuenta/devoluciones-saldo/{id}/transferida:
 *   post:
 *     tags: [Cuenta]
 *     summary: La caja marca que ya transfirió el saldo de una cuenta que se va a borrar
 */
router.post('/devoluciones-saldo/:id/transferida', activa, requireUser, async (req: Request, res: Response) => {
  try { res.json(await marcarSaldoTransferido(req.usuario!, req.params.id)); } catch (err) { responderError(res, err); }
});

export default router;
