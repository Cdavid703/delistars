import { Router, Request, Response } from 'express';
import { requireUser } from '../../../middlewares/require-user';
import { ErrorPedido } from '../../modulo_pedidos/reglas/armado';
import { marcarAgotado } from '../agotados.service';

/** Agotado por sede (§7.2, §16.1, P-14). */
const router = Router();

/**
 * @swagger
 * /api/v1/agotados:
 *   post:
 *     tags: [Catálogo]
 *     summary: Marcar o quitar «agotado» de un producto en una sede
 *     description: >
 *       { sedeId, idProducto, agotado: true | false }. Caja de esa sede o administración (403 sin_permiso).
 *       El menú y la app leen agotados/{sedeId} en Firestore ({ ids, nombres }) y muestran el producto con la
 *       etiqueta «Agotado»; crear un pedido con algo agotado responde 409 agotado_en_sede.
 *     responses:
 *       200: { description: "{ sedeId, idProducto, agotado, ids, cambio }" }
 */
router.post('/', requireUser, async (req: Request, res: Response) => {
  try {
    res.json(await marcarAgotado(req.usuario!, req.body));
  } catch (err) {
    if (err instanceof ErrorPedido) return res.status(err.status).json({ error: err.message, codigo: err.codigo });
    console.error('[agotados] error:', err);
    res.status(500).json({ error: 'No se pudo guardar. Intenta de nuevo', codigo: 'interno' });
  }
});

export default router;
