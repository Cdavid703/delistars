import { Router, Request, Response } from 'express';
import { FieldValue } from 'firebase-admin/firestore';
import { requireUser } from '../../../middlewares/require-user';
import { firestore } from '../../../config/firestore';
import { ErrorPedido } from '../../modulo_pedidos/reglas/armado';
import { validarDispositivo, idDeToken } from '../reglas';

/** Avisos (Fase 6): registrar el aparato que recibe push nativos (app). */
const router = Router();

function responder(res: Response, err: unknown) {
  if (err instanceof ErrorPedido) return res.status(err.status).json({ error: err.message, codigo: err.codigo });
  console.error('[avisos] error:', err);
  return res.status(500).json({ error: 'No se pudo guardar. Intenta de nuevo', codigo: 'interno' });
}

/** Destinos del usuario: su uid y, si es del equipo, también su correo. */
const destinosDe = (u: NonNullable<Request['usuario']>) =>
  [u.uid, ...((u.esCaja || u.esDomiciliario || u.esAdmin) && u.email ? [u.email] : [])];

/**
 * @swagger
 * /api/v1/avisos/dispositivo:
 *   post:
 *     tags: [Avisos]
 *     summary: Registrar el aparato para recibir avisos push (app)
 *     description: >
 *       { token, proveedor: expo | fcm, plataforma: android | ios | web }. Cuenta real (no anónima).
 *       El mismo token se puede registrar varias veces sin duplicarse.
 *   delete:
 *     tags: [Avisos]
 *     summary: Dejar de recibir avisos en este aparato (al cerrar sesión). { token }
 */
router.post('/dispositivo', requireUser, async (req: Request, res: Response) => {
  try {
    const u = req.usuario!;
    if (u.anonimo) throw new ErrorPedido('cuenta_obligatoria', 'Entra con tu cuenta para recibir avisos', 403);
    const d = validarDispositivo(req.body);
    const db = firestore();
    const batch = db.batch();
    for (const destino of destinosDe(u)) {
      batch.set(db.doc(`dispositivos/${destino}/tokens/${idDeToken(d.token)}`), {
        ...d, uid: u.uid, email: u.email || null, actualizadoAt: FieldValue.serverTimestamp(),
      }, { merge: true });
    }
    await batch.commit();
    res.json({ ok: true });
  } catch (err) { responder(res, err); }
});

router.delete('/dispositivo', requireUser, async (req: Request, res: Response) => {
  try {
    const token = typeof req.body?.token === 'string' ? req.body.token.trim() : '';
    if (!token) throw new ErrorPedido('token', 'Falta el token');
    const db = firestore();
    const batch = db.batch();
    for (const destino of destinosDe(req.usuario!)) batch.delete(db.doc(`dispositivos/${destino}/tokens/${idDeToken(token)}`));
    await batch.commit();
    res.json({ ok: true });
  } catch (err) { responder(res, err); }
});

export default router;
