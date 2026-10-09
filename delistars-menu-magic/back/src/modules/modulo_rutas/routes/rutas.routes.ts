import { Router, Request, Response } from 'express';
import { RecorridoService } from '../services/recorrido.service';

const router = Router();
const recorrido = new RecorridoService();

/**
 * @swagger
 * /api/v1/rutas/recorrido:
 *   post:
 *     tags:
 *       - Rutas
 *     summary: Distancia por calle entre la sede y el cliente
 *     description: >
 *       Consulta Google Maps (Routes API) y devuelve los km por recorrido.
 *       Si no se puede medir responde 503 con km null, y la app cobra en
 *       línea recta como respaldo.
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           example: { "origen": { "lat": 6.25, "lng": -75.6 }, "destino": { "lat": 6.26, "lng": -75.61 } }
 *     responses:
 *       200:
 *         description: "{ km: number }"
 *       400:
 *         description: Puntos fuera de Medellín o mal formados
 *       503:
 *         description: "No se pudo medir: { km: null, motivo }"
 */
router.post('/recorrido', async (req: Request, res: Response) => {
  const { origen, destino } = req.body ?? {};
  const r = await recorrido.medir(origen, destino, req.ip ?? '');
  if (r.ok) {
    res.json({ km: r.km });
    return;
  }
  res.status(r.motivo === 'invalido' ? 400 : 503).json({ km: null, motivo: r.motivo });
});

export default router;
