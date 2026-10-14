import { Router, Request, Response } from 'express';
import { timingSafeEqual } from 'crypto';
import { firmaValida, registrarBaja, listarBajas } from '../services/bajas.service';

const router = Router();

const pagina = (titulo: string, texto: string) => `<!doctype html><html lang="es"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1"><title>${titulo} · DeliStars</title>
<style>body{margin:0;font-family:system-ui,-apple-system,Segoe UI,Roboto,sans-serif;background:#fff6ec;color:#2b2b2b;
display:flex;min-height:100vh;align-items:center;justify-content:center;padding:16px}
.c{max-width:420px;background:#fff;border-radius:16px;padding:28px;text-align:center;box-shadow:0 6px 24px rgba(0,0,0,.08)}
img{height:56px}h1{font-size:22px;margin:16px 0 8px}p{line-height:1.5;color:#555}a{color:#e85d04}</style></head>
<body><div class="c"><img src="https://delistars.com/domicilios/logo_sello.png" alt="DeliStars"><h1>${titulo}</h1><p>${texto}</p>
<p><a href="https://delistars.com/">Ir a DeliStars</a></p></div></body></html>`;

async function darDeBaja(req: Request, res: Response, html: boolean) {
  const uid = (req.query.u ?? req.body?.u) as unknown;
  const firma = (req.query.t ?? req.body?.t) as unknown;
  if (!firmaValida(uid, firma)) {
    res.status(400).type(html ? 'html' : 'text').send(html
      ? pagina('Enlace no válido', 'Este enlace para darte de baja no es válido. Si quieres dejar de recibir promociones, respóndenos el correo y te quitamos de la lista.')
      : 'enlace no válido');
    return;
  }
  try {
    await registrarBaja(uid as string);
    res.type(html ? 'html' : 'text').send(html
      ? pagina('Listo, te diste de baja', 'No te enviaremos más correos de promociones. Si cambias de opinión, puedes volver a activarlas desde la app de domicilios.')
      : 'ok');
  } catch (err) {
    console.error('Error al registrar baja:', err);
    res.status(500).type(html ? 'html' : 'text').send(html ? pagina('Algo falló', 'No pudimos registrar tu baja. Intenta de nuevo en un momento.') : 'error');
  }
}

/** Enlace del pie del correo. */
router.get('/baja', (req, res) => darDeBaja(req, res, true));
/** Baja de un clic (cabecera List-Unsubscribe-Post de los correos, RFC 8058). */
router.post('/baja', (req, res) => darDeBaja(req, res, false));

/** Lista de bajas para el scheduler (red interna; protegida con el secreto). */
router.get('/bajas', async (req: Request, res: Response) => {
  const esperado = Buffer.from(process.env.MERCADEO_SECRET || '');
  const recibido = Buffer.from(String(req.get('x-mercadeo-secret') || ''));
  if (!esperado.length || esperado.length !== recibido.length || !timingSafeEqual(esperado, recibido)) {
    res.status(403).json({ error: 'No autorizado' });
    return;
  }
  try { res.json({ uids: await listarBajas() }); }
  catch (err) { console.error('Error al listar bajas:', err); res.status(500).json({ error: 'error' }); }
});

export default router;
