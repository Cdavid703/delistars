import { Router, Request, Response } from 'express';
import { getAuth } from 'firebase-admin/auth';
import { FieldValue } from 'firebase-admin/firestore';
import { firestore, firebaseApp } from '../../../config/firestore';
import { enFranja, publica } from '../campanas.reglas';

/**
 * Campañas del lado del cliente (Fase 7, §17): franja del menú, campaña
 * vencida («Esta promoción terminó») y aperturas/clics para las métricas.
 * Rutas públicas: el menú no exige cuenta. Nada de esto devuelve datos de
 * otros clientes.
 */
const router = Router();
let cacheFranja: { at: number; lista: { id: string; c: Record<string, unknown> }[] } | null = null;

async function campanasConFranja() {
  if (cacheFranja && Date.now() - cacheFranja.at < 60_000) return cacheFranja.lista;
  const snap = await firestore().collection('campanas').where('programada', '==', true).get();
  cacheFranja = { at: Date.now(), lista: snap.docs.map((d) => ({ id: d.id, c: d.data() })) };
  return cacheFranja.lista;
}

/**
 * @swagger
 * /api/v1/mercadeo/franja:
 *   get:
 *     tags: [Mercadeo]
 *     summary: "Campañas vigentes para la franja del menú: ?sedeId= → [{ id, titulo, texto, destino, sedeId, fin }]"
 * /api/v1/mercadeo/campanas/{id}/publica:
 *   get:
 *     tags: [Mercadeo]
 *     summary: "Lo que el cliente ve de una campaña: { vigente, terminada, titulo, texto, destino, sedeId, fin }"
 * /api/v1/mercadeo/eventos:
 *   post:
 *     tags: [Mercadeo]
 *     summary: "Apertura o clic: { campanaId, tipo: apertura|clic, visitante } (con o sin sesión). Cuenta una vez por persona."
 */
router.get('/franja', async (req: Request, res: Response) => {
  try {
    const sedeId = typeof req.query.sedeId === 'string' ? req.query.sedeId : '';
    const ahora = Date.now();
    const lista = (await campanasConFranja()).filter((x) => enFranja(x.c, sedeId, ahora)).map((x) => publica(x.id, x.c, ahora));
    res.set('Cache-Control', 'public, max-age=60').json(lista);
  } catch (err) {
    console.error('[mercadeo] franja:', err);
    res.json([]);
  }
});

router.get('/campanas/:id/publica', async (req: Request, res: Response) => {
  try {
    const d = await firestore().doc(`campanas/${req.params.id}`).get();
    if (!d.exists) return res.status(404).json({ error: 'Esa promoción no existe', codigo: 'no_existe' });
    res.json(publica(d.id, d.data() || {}));
  } catch (err) {
    console.error('[mercadeo] pública:', err);
    res.status(500).json({ error: 'No se pudo leer la promoción', codigo: 'interno' });
  }
});

router.post('/eventos', async (req: Request, res: Response) => {
  try {
    const campanaId = String(req.body?.campanaId || '');
    const tipo = req.body?.tipo === 'clic' ? 'clic' : req.body?.tipo === 'apertura' ? 'apertura' : '';
    const visitante = String(req.body?.visitante || '');
    if (!/^[A-Za-z0-9]{10,40}$/.test(campanaId) || !tipo) return res.status(422).json({ error: 'Evento no válido', codigo: 'evento' });
    let uid = '';
    const h = req.get('authorization') || '';
    if (h.startsWith('Bearer ')) uid = (await getAuth(firebaseApp()).verifyIdToken(h.slice(7)).catch(() => null))?.uid || '';
    const quien = uid || (/^[A-Za-z0-9-]{8,64}$/.test(visitante) ? `v_${visitante}` : '');
    if (!quien) return res.status(422).json({ error: 'Falta quién', codigo: 'visitante' });
    const db = firestore();
    const camp = await db.doc(`campanas/${campanaId}`).get();
    if (!camp.exists) return res.status(404).json({ error: 'Esa promoción no existe', codigo: 'no_existe' });
    // Una vez por persona, campaña y tipo (no infla las métricas con recargas).
    try {
      await db.doc(`promo_eventos/${campanaId}_${quien}_${tipo}`).create({ campanaId, tipo, conCuenta: !!uid, at: Date.now() });
      await camp.ref.update({ [`metricas.${tipo === 'clic' ? 'clics' : 'aperturas'}`]: FieldValue.increment(1) });
    } catch (e) {
      if ((e as { code?: number }).code !== 6) throw e; // 6 = ya existía
    }
    res.json({ ok: true });
  } catch (err) {
    console.error('[mercadeo] evento:', err);
    res.status(500).json({ error: 'No se pudo registrar', codigo: 'interno' });
  }
});

export default router;
