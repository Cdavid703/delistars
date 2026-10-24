import { Router, Request, Response } from 'express';
import { requireUser } from '../../../middlewares/require-user';
import { ErrorPedido } from '../../modulo_pedidos/reglas/armado';
import { reporte } from '../reportes.service';

/** Reportes aprobados (Fase 7, especificación §16.3). */
const router = Router();

/**
 * @swagger
 * /api/v1/reportes:
 *   get:
 *     tags: [Reportes]
 *     summary: Reportes de un período (administración: una o las dos sedes; caja: la suya)
 *     description: >
 *       ?desde=AAAA-MM-DD&hasta=AAAA-MM-DD&sedeId= (máx. 93 días, fechas de Bogotá) →
 *       { financiero, tiempos, productos, demanda, clientes, domicilios, incidencias, porSede, formulas, avisos }
 */
router.get('/', requireUser, async (req: Request, res: Response) => {
  try {
    res.json(await reporte(req.usuario!, req.query));
  } catch (err) {
    if (err instanceof ErrorPedido) return res.status(err.status).json({ error: err.message, codigo: err.codigo });
    console.error('[reportes] error:', err);
    return res.status(500).json({ error: 'No se pudo armar el reporte. Intenta de nuevo', codigo: 'interno' });
  }
});

export default router;
