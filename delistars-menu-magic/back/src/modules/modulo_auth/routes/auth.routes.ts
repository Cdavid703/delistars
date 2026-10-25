import { Router, Request, Response } from 'express';
import { ErrorPedido } from '../../modulo_pedidos/reglas/armado';
import { entrarConMicrosoft } from '../auth.service';
import { crearSesionReloj, cerrarSesionesReloj } from '../reloj.service';
import { requireUser } from '../../../middlewares/require-user';

/** Inicio de sesión de la app móvil con proveedores que Firebase no acepta fuera de su ventana. */
const router = Router();

/**
 * @swagger
 * /api/v1/auth/microsoft:
 *   post:
 *     tags: [Auth]
 *     summary: Token de Firebase a partir del id_token de Microsoft (app móvil)
 *     description: >
 *       Verifica el id_token con las llaves de Microsoft (aud = app de Azure «DeliStars», emisor del
 *       inquilino y `nonce`) y devuelve un token de Firebase de la cuenta vinculada a ese Microsoft
 *       (la misma de la web). Si no existe, la crea con Microsoft vinculado. Nunca une por correo:
 *       si el correo ya es de otra cuenta → 409 `cuenta_con_otro_metodo`.
 *     requestBody:
 *       content:
 *         application/json:
 *           example: { "idToken": "eyJ...", "nonce": "valor-que-mandó-la-app" }
 *     responses:
 *       200: { description: "{ customToken } → signInWithCustomToken" }
 */
router.post('/microsoft', async (req: Request, res: Response) => {
  try {
    res.set('Cache-Control', 'no-store').json(await entrarConMicrosoft(req.body));
  } catch (err) {
    if (err instanceof ErrorPedido) return res.status(err.status).json({ error: err.message, codigo: err.codigo });
    console.error('[auth] microsoft:', err);
    res.status(500).json({ error: 'No se pudo entrar con Microsoft. Intenta de nuevo', codigo: 'interno' });
  }
});

const responder = (res: Response, err: unknown, que: string) => {
  if (err instanceof ErrorPedido) return res.status(err.status).json({ error: err.message, codigo: err.codigo });
  console.error(`[auth] ${que}:`, err);
  res.status(500).json({ error: 'No se pudo completar. Intenta de nuevo', codigo: 'interno' });
};

/**
 * @swagger
 * /api/v1/auth/reloj:
 *   post:
 *     tags: [Auth]
 *     summary: Sesión propia del Apple Watch (W-1)
 *     description: >
 *       Con la sesión real del iPhone (Bearer). { dispositivo, nombre? } → { customToken, sesionId } de la
 *       MISMA cuenta, con el claim `reloj` = sesionId. El reloj lo canjea con signInWithCustomToken y queda
 *       con su propio refresh token. Pedir otra para el mismo dispositivo cierra la anterior; máximo 3
 *       relojes activos por cuenta (se cierra el más viejo). Errores: 403 cuenta_obligatoria (invitado),
 *       403 desde_reloj (se pide desde el iPhone), 422 dispositivo.
 *     responses:
 *       200: { description: "{ customToken, sesionId }" }
 */
router.post('/reloj', requireUser, async (req: Request, res: Response) => {
  try { res.set('Cache-Control', 'no-store').json(await crearSesionReloj(req.usuario!, req.body)); } catch (err) { responder(res, err, 'reloj'); }
});

/**
 * @swagger
 * /api/v1/auth/reloj/cerrar:
 *   post:
 *     tags: [Auth]
 *     summary: Cerrar las sesiones del reloj (W-2)
 *     description: >
 *       Desde el iPhone al cerrar sesión o cambiar de cuenta: { dispositivo? } cierra ese reloj; sin
 *       dispositivo, todos los relojes de la cuenta. Desde el reloj cierra solo la suya. Desde ese momento
 *       la API responde 401 `sesion_cerrada` y Firestore niega las lecturas con ese token (las reglas
 *       miran sesiones_reloj). La web y la app no se cierran.
 *     responses:
 *       200: { description: "{ cerradas }" }
 */
router.post('/reloj/cerrar', requireUser, async (req: Request, res: Response) => {
  try { res.json(await cerrarSesionesReloj(req.usuario!, req.body)); } catch (err) { responder(res, err, 'cerrar reloj'); }
});

export default router;
