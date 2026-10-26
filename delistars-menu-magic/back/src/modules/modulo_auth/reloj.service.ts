import { getAuth } from 'firebase-admin/auth';
import { FieldValue } from 'firebase-admin/firestore';
import { firebaseApp, firestore } from '../../config/firestore';
import { ErrorPedido } from '../modulo_pedidos/reglas/armado';
import {
  validarDispositivo, nombreDispositivo, puedeCrearSesion, claimsReloj, sesionesACerrar, sesionVigente, tokenRevocado,
} from './reloj.reglas';

/**
 * Sesiones del Apple Watch (W-1, W-2). Ver reloj.reglas.ts.
 * Firestore: sesiones_reloj/{id} = { uid, dispositivo, nombre, activa, creadaAt, cerradaAt, cerradaPor }.
 * Solo el servidor la toca; las reglas de Firestore la leen con get() para
 * rechazar las lecturas y escrituras de una sesión cerrada.
 */
const COLECCION = 'sesiones_reloj';

// Memorias cortas (un solo proceso): cerrar una sesión limpia la suya al instante.
const CACHE_SESION_MS = 30_000;
const CACHE_CUENTA_MS = 60_000;
const cacheSesion = new Map<string, { vigente: boolean; hasta: number }>();
const cacheCuenta = new Map<string, { usuario: { disabled?: boolean; tokensValidAfterTime?: string | null } | null; hasta: number }>();

interface Quien { uid: string; email: string; anonimo: boolean; proveedor: string; reloj?: string | null }

/** POST /auth/reloj: { dispositivo, nombre? } → { customToken, sesionId } de la misma cuenta. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function crearSesionReloj(u: Quien, b: any) {
  puedeCrearSesion(u);
  const dispositivo = validarDispositivo(b?.dispositivo);
  const nombre = nombreDispositivo(b?.nombre);
  const db = firestore();
  const activas = await db.collection(COLECCION).where('uid', '==', u.uid).where('activa', '==', true).get();
  const cerrar = sesionesACerrar(
    activas.docs.map((d) => ({ id: d.id, dispositivo: String(d.data().dispositivo || ''), creadaAt: d.data().creadaAt?.toMillis?.() || 0 })),
    dispositivo,
  );
  const ref = db.collection(COLECCION).doc();
  const lote = db.batch();
  for (const id of cerrar) {
    lote.update(db.doc(`${COLECCION}/${id}`), { activa: false, cerradaAt: FieldValue.serverTimestamp(), cerradaPor: 'reemplazada' });
    cacheSesion.delete(id);
  }
  lote.set(ref, { uid: u.uid, dispositivo, nombre, activa: true, creadaAt: FieldValue.serverTimestamp(), cerradaAt: null, cerradaPor: null });
  await lote.commit();
  const customToken = await getAuth(firebaseApp()).createCustomToken(u.uid, claimsReloj(ref.id, u.proveedor));
  return { customToken, sesionId: ref.id };
}

/**
 * POST /auth/reloj/cerrar: { dispositivo? } desde el iPhone (o el propio reloj).
 * Sin dispositivo cierra todas las sesiones de reloj de la cuenta. Desde el
 * reloj solo cierra la suya. Responde cuántas cerró.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function cerrarSesionesReloj(u: Quien, b: any) {
  const db = firestore();
  let docs;
  if (u.reloj) {
    const d = await db.doc(`${COLECCION}/${u.reloj}`).get();
    docs = d.exists && d.data()?.uid === u.uid && d.data()?.activa === true ? [d] : [];
  } else {
    const dispositivo = b?.dispositivo != null ? validarDispositivo(b.dispositivo) : null;
    let q = db.collection(COLECCION).where('uid', '==', u.uid).where('activa', '==', true);
    if (dispositivo) q = q.where('dispositivo', '==', dispositivo);
    docs = (await q.get()).docs;
  }
  const lote = db.batch();
  for (const d of docs) {
    lote.update(d.ref, { activa: false, cerradaAt: FieldValue.serverTimestamp(), cerradaPor: u.reloj ? 'reloj' : 'iphone' });
    cacheSesion.delete(d.id);
  }
  if (docs.length) await lote.commit();
  return { cerradas: docs.length };
}

/** ¿Sigue activa la sesión de reloj `id` de esta cuenta? (con caché de 30 s) */
export async function sesionRelojActiva(id: string, uid: string): Promise<boolean> {
  const c = cacheSesion.get(id);
  if (c && c.hasta > Date.now()) return c.vigente;
  if (!/^[A-Za-z0-9]{10,40}$/.test(id)) return false;
  const d = await firestore().doc(`${COLECCION}/${id}`).get();
  const vigente = sesionVigente(d.exists ? d.data() : null, uid);
  cacheSesion.set(id, { vigente, hasta: Date.now() + CACHE_SESION_MS });
  return vigente;
}

/** Olvidar lo guardado de una cuenta (al revocarla, para que valga de inmediato). */
export const olvidarCuenta = (uid: string) => { cacheCuenta.delete(uid); };

/**
 * ¿El token de esta cuenta fue revocado o la cuenta está deshabilitada o borrada?
 * Equivale a verifyIdToken(token, true) pero consulta la cuenta una vez por minuto.
 */
export async function cuentaRevocada(uid: string, authTimeSeg: number): Promise<boolean> {
  let c = cacheCuenta.get(uid);
  if (!c || c.hasta <= Date.now()) {
    let usuario: { disabled?: boolean; tokensValidAfterTime?: string | null } | null = null;
    try {
      const r = await getAuth(firebaseApp()).getUser(uid);
      usuario = { disabled: r.disabled, tokensValidAfterTime: r.tokensValidAfterTime ?? null };
    } catch (e) {
      if ((e as { code?: string })?.code !== 'auth/user-not-found') throw e;
    }
    c = { usuario, hasta: Date.now() + CACHE_CUENTA_MS };
    cacheCuenta.set(uid, c);
  }
  return tokenRevocado(c.usuario, authTimeSeg);
}

/** Error para una sesión cerrada (el reloj la reconoce por el código). */
export const sesionCerrada = () => new ErrorPedido('sesion_cerrada', 'La sesión se cerró. Vuelve a entrar desde el iPhone', 401);
