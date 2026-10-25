import { Router, Request, Response } from 'express';
import { FieldValue } from 'firebase-admin/firestore';
import { requireUser, TODAS_LAS_SEDES } from '../../../middlewares/require-user';
import { firestore } from '../../../config/firestore';
import { ErrorPedido } from '../../modulo_pedidos/reglas/armado';
import { rolesDeUsuario, validarSolicitud, sedesAlAprobar, ROLES_SOLICITABLES, RolSolicitable } from '../reglas';
import { cambiarTurno, guardarOrdenRuta } from '../../modulo_pedidos/services/domiciliarios.service';

/**
 * Equipo: quién soy, solicitudes de acceso y su aprobación.
 * Errores: { error: texto para mostrar, codigo }.
 */
const router = Router();

function responder(res: Response, err: unknown) {
  if (err instanceof ErrorPedido) return res.status(err.status).json({ error: err.message, codigo: err.codigo });
  console.error('[equipo] error:', err);
  return res.status(500).json({ error: 'No se pudo procesar. Intenta de nuevo', codigo: 'interno' });
}
const soloAdmin = (req: Request) => {
  if (!req.usuario?.esAdmin) throw new ErrorPedido('sin_permiso', 'Solo administración', 403);
};
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const fecha = (v: any) => (v?.toDate ? v.toDate().toISOString() : null);
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const solicitudPublica = (id: string, d: any) => ({
  uid: id, email: d.email, nombre: d.nombre, telefono: d.telefono, rol: d.rol, sedeId: d.sedeId,
  estado: d.estado, motivo: d.motivo ?? null, creadaAt: fecha(d.creadaAt), resueltaAt: fecha(d.resueltaAt),
});

/**
 * @swagger
 * /api/v1/equipo/yo:
 *   get:
 *     tags: [Equipo]
 *     summary: Roles y sedes de la cuenta, y su solicitud de acceso si la hay
 *     responses:
 *       200: { description: "{ uid, email, nombre, roles, sedes: { caja, domiciliario }, solicitud }" }
 */
router.get('/yo', requireUser, async (req: Request, res: Response) => {
  try {
    const u = req.usuario!;
    const s = await firestore().doc(`solicitudes_acceso/${u.uid}`).get();
    res.json({
      uid: u.uid, email: u.email || null, nombre: u.nombre || null, anonimo: u.anonimo,
      roles: rolesDeUsuario(u),
      sedes: { caja: u.esAdmin ? TODAS_LAS_SEDES : u.sedes.caja, domiciliario: u.sedes.domiciliario },
      solicitud: s.exists ? solicitudPublica(s.id, s.data()) : null,
    });
  } catch (err) { responder(res, err); }
});

/**
 * @swagger
 * /api/v1/equipo/solicitudes:
 *   post:
 *     tags: [Equipo]
 *     summary: Pedir acceso a caja o reparto
 *     requestBody:
 *       content:
 *         application/json:
 *           example: { "nombre": "Ana Pérez", "telefono": "3001234567", "rol": "domiciliario", "sedeId": "santa_lucia" }
 */
router.post('/solicitudes', requireUser, async (req: Request, res: Response) => {
  try {
    const u = req.usuario!;
    const datos = validarSolicitud(u, req.body);
    const ref = firestore().doc(`solicitudes_acceso/${u.uid}`);
    const previa = await ref.get();
    if (previa.exists && previa.data()?.estado === 'pendiente'
      && previa.data()?.rol === datos.rol && previa.data()?.sedeId === datos.sedeId) {
      return res.status(200).json(solicitudPublica(previa.id, previa.data()));
    }
    await ref.set({
      uid: u.uid, email: u.email, ...datos, estado: 'pendiente', motivo: null,
      creadaAt: FieldValue.serverTimestamp(), resueltaAt: null, resueltaPor: null,
    });
    const d = (await ref.get()).data();
    res.status(201).json(solicitudPublica(ref.id, d));
  } catch (err) { responder(res, err); }
});

/** Lista para administración (por defecto, las pendientes). */
router.get('/solicitudes', requireUser, async (req: Request, res: Response) => {
  try {
    soloAdmin(req);
    const estado = typeof req.query.estado === 'string' ? req.query.estado : 'pendiente';
    const snap = await firestore().collection('solicitudes_acceso').where('estado', '==', estado).get();
    res.json(snap.docs.map((d) => solicitudPublica(d.id, d.data()))
      .sort((a, b) => (a.creadaAt || '').localeCompare(b.creadaAt || '')));
  } catch (err) { responder(res, err); }
});

/** Aprobar: crea o amplía el rol (mismo documento que Panel → Usuarios) y quita una baja. */
router.post('/solicitudes/:uid/aprobar', requireUser, async (req: Request, res: Response) => {
  try {
    soloAdmin(req);
    const db = firestore();
    const ref = db.doc(`solicitudes_acceso/${req.params.uid}`);
    const r = await db.runTransaction(async (tx) => {
      const s = await tx.get(ref);
      if (!s.exists) throw new ErrorPedido('no_existe', 'La solicitud no existe', 404);
      const d = s.data()!;
      if (d.estado !== 'pendiente') throw new ErrorPedido('resuelta', 'Esa solicitud ya se resolvió', 409);
      const rol = d.rol as RolSolicitable;
      const sedes: string[] = Array.isArray(req.body?.sedes) && req.body.sedes.length
        ? req.body.sedes.filter((x: string) => TODAS_LAS_SEDES.includes(x)) : [d.sedeId];
      const rolRef = db.doc(`${ROLES_SOLICITABLES[rol]}/${d.email}`);
      const previo = await tx.get(rolRef);
      tx.set(rolRef, {
        email: d.email, name: d.nombre, phone: d.telefono,
        sedes: sedesAlAprobar(previo.exists ? previo.data()?.sedes ?? null : null, sedes),
        ...(previo.exists ? {} : { addedAt: FieldValue.serverTimestamp() }),
        aprobadoPor: req.usuario!.email,
      }, { merge: true });
      tx.delete(db.doc(`roles_disabled/${d.email}`));
      tx.update(ref, { estado: 'aprobada', resueltaAt: FieldValue.serverTimestamp(), resueltaPor: req.usuario!.email, sedesAprobadas: sedes });
      return { uid: s.id, estado: 'aprobada', rol, sedes };
    });
    res.json(r);
  } catch (err) { responder(res, err); }
});

router.post('/solicitudes/:uid/rechazar', requireUser, async (req: Request, res: Response) => {
  try {
    soloAdmin(req);
    const ref = firestore().doc(`solicitudes_acceso/${req.params.uid}`);
    const s = await ref.get();
    if (!s.exists) throw new ErrorPedido('no_existe', 'La solicitud no existe', 404);
    if (s.data()?.estado !== 'pendiente') throw new ErrorPedido('resuelta', 'Esa solicitud ya se resolvió', 409);
    const motivo = typeof req.body?.motivo === 'string' ? req.body.motivo.trim().slice(0, 300) : '';
    await ref.update({ estado: 'rechazada', motivo: motivo || null, resueltaAt: FieldValue.serverTimestamp(), resueltaPor: req.usuario!.email });
    res.json({ uid: s.id, estado: 'rechazada', motivo: motivo || null });
  } catch (err) { responder(res, err); }
});

/**
 * @swagger
 * /api/v1/equipo/domiciliarios:
 *   get:
 *     tags: [Equipo]
 *     summary: Domiciliarios activos (para asignar). Caja o admin. `?sedeId=` opcional.
 *     responses:
 *       200: { description: "[{ email, nombre, telefono, sedes }]" }
 */
// Espejo de DEFAULT_DRIVERS / DEFAULT_DRIVER_NAMES (src/services/roles.js).
const DOMICILIARIOS_FIJOS: Record<string, string> = { 'cdavid.jaramillo@gmail.com': 'Carlos David Jaramillo' };
router.get('/domiciliarios', requireUser, async (req: Request, res: Response) => {
  try {
    const u = req.usuario!;
    if (!u.esCaja && !u.esAdmin) throw new ErrorPedido('sin_permiso', 'Solo la caja puede ver los domiciliarios', 403);
    const sedeId = typeof req.query.sedeId === 'string' ? req.query.sedeId : '';
    if (sedeId && !TODAS_LAS_SEDES.includes(sedeId)) throw new ErrorPedido('sede', 'Sede no válida');
    const db = firestore();
    const [dinamicos, bajas] = await Promise.all([db.collection('roles_drivers').get(), db.collection('roles_disabled').get()]);
    const baja = new Set(bajas.docs.map((d) => d.id.toLowerCase()));
    const porEmail = new Map<string, { email: string; nombre: string; telefono: string | null; sedes: string[] }>();
    for (const [email, nombre] of Object.entries(DOMICILIARIOS_FIJOS)) porEmail.set(email, { email, nombre, telefono: null, sedes: TODAS_LAS_SEDES });
    for (const d of dinamicos.docs) {
      const x = d.data();
      const email = d.id.toLowerCase();
      const propias: string[] = Array.isArray(x.sedes) && x.sedes.length ? x.sedes : TODAS_LAS_SEDES;
      // Igual que /equipo/yo: un domiciliario fijo conserva sus sedes aunque
      // su documento dinámico tenga menos (antes lo reemplazaba).
      const previas = porEmail.get(email)?.sedes ?? [];
      const sedes = [...new Set([...previas, ...propias])];
      porEmail.set(email, { email, nombre: x.name || porEmail.get(email)?.nombre || d.id, telefono: x.phone || null, sedes });
    }
    res.json([...porEmail.values()]
      .filter((x) => !baja.has(x.email) && (!sedeId || x.sedes.includes(sedeId)))
      .sort((a, b) => a.nombre.localeCompare(b.nombre)));
  } catch (err) { responder(res, err); }
});

/**
 * @swagger
 * /api/v1/equipo/turno:
 *   post:
 *     tags: [Equipo]
 *     summary: El domiciliario inicia, pausa, reanuda o termina su turno (Fase 5)
 *     description: >
 *       Solo en turno (y sin pausa) recibe pedidos automáticamente al confirmarse.
 *       Al terminar con pedidos encima, esos siguen siendo suyos (`aviso`).
 *     requestBody:
 *       content:
 *         application/json:
 *           example: { "accion": "iniciar" }
 *     responses:
 *       200: { description: "{ estado: activo | pausa | fuera, enReparto, porRecoger, aviso }" }
 */
router.post('/turno', requireUser, async (req: Request, res: Response) => {
  try { res.json(await cambiarTurno(req.usuario!, req.body?.accion)); } catch (err) { responder(res, err); }
});

/**
 * @swagger
 * /api/v1/equipo/turno/orden:
 *   post:
 *     tags: [Equipo]
 *     summary: El domiciliario guarda el orden manual de su ruta («Poner primero», CP-7)
 *     description: >
 *       Queda en turnos_domiciliario/{correo}.ordenRuta (lo lee en Firestore). `[]` lo borra.
 *       Máximo 10 ids, sin repetidos.
 *     requestBody:
 *       content:
 *         application/json:
 *           example: { "ordenRuta": ["Y20OTc5DSSz10ut7g4cE", "oFEay2Qd5NQ8vI7OJFzI"] }
 *     responses:
 *       200: { description: "{ ordenRuta }" }
 */
router.post('/turno/orden', requireUser, async (req: Request, res: Response) => {
  try { res.json(await guardarOrdenRuta(req.usuario!, req.body?.ordenRuta)); } catch (err) { responder(res, err); }
});

export default router;
