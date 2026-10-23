import { Router, Request, Response } from 'express';
import { ErrorPedido } from '../../modulo_pedidos/reglas/armado';
import { entrarConMicrosoft } from '../auth.service';

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

export default router;
