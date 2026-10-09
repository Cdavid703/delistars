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
 *         description: "{ km: number, min: number } (min = minutos en carro, sin tráfico)"
 *       400:
 *         description: Puntos fuera de Medellín o mal formados
 *       503:
 *         description: "No se pudo medir: { km: null, motivo }"
 */
router.post('/recorrido', async (req: Request, res: Response) => {
  const { origen, destino } = req.body ?? {};
  const r = await recorrido.medir(origen, destino, req.ip ?? '');
  if (r.ok) {
    res.json({ km: r.km, min: r.min });
    return;
  }
  res.status(r.motivo === 'invalido' ? 400 : 503).json({ km: null, motivo: r.motivo });
});

/**
 * @swagger
 * /api/v1/rutas/optimizar:
 *   post:
 *     tags:
 *       - Rutas
 *     summary: Mejor orden para entregar varios pedidos
 *     description: >
 *       Sale de la sede, pasa por las paradas (2 a 10) y vuelve a la sede.
 *       Devuelve el orden de los ids, km y minutos totales y por tramo.
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           example: { "origen": { "lat": 6.25, "lng": -75.6 }, "paradas": [{ "id": "a", "lat": 6.26, "lng": -75.61 }, { "id": "b", "lat": 6.24, "lng": -75.6 }] }
 *     responses:
 *       200:
 *         description: "{ orden: string[], km, min, tramos: [{ km, min }] }"
 *       503:
 *         description: "No se pudo optimizar: { orden: null, motivo }"
 */
router.post('/optimizar', async (req: Request, res: Response) => {
  const { origen, paradas } = req.body ?? {};
  const r = await recorrido.optimizar(origen, paradas, req.ip ?? '');
  if (r.ok) {
    const { ok: _ok, ...datos } = r;
    res.json(datos);
    return;
  }
  res.status(r.motivo === 'invalido' ? 400 : 503).json({ orden: null, motivo: r.motivo });
});

export default router;
