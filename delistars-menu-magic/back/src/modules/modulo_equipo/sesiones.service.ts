import { createHash, randomBytes } from 'crypto';
import { FieldValue } from 'firebase-admin/firestore';
import { getAuth } from 'firebase-admin/auth';
import { firebaseApp, firestore } from '../../config/firestore';
import { ErrorPedido } from '../modulo_pedidos/reglas/armado';
import type { Usuario } from '../../middlewares/require-user';
import { validarRegistro, puedeManejar, vistaSesion, sesionVigente, idSesionValido, esEquipo, Sesion } from './sesiones.reglas';

/** «Mis sesiones» del equipo (§6.3). Ver sesiones.reglas.ts. */
const COLECCION = 'sesiones_equipo';
const sha = (s: string) => createHash('sha256').update(s).digest('hex');
const CACHE_MS = 30_000;
const cache = new Map<string, { vigente: boolean; hasta: number }>();

/** El aparato se registra al entrar y luego reporta cada pocos minutos que sigue en uso. */
export async function registrarSesion(u: Usuario, b: Sesion) {
  const r = validarRegistro(u, b);
  const db = firestore();
  const ref = db.doc(`${COLECCION}/${r.id}`);
  return db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    const ahora = FieldValue.serverTimestamp();
    if (snap.exists) {
      const s = snap.data() as Sesion;
      if (s.uid !== u.uid) throw new ErrorPedido('sin_permiso', 'Esa sesión es de otra cuenta', 403);
      if (s.activa !== true) throw new ErrorPedido('sesion_cerrada', 'Esta sesión se cerró desde otro aparato. Vuelve a entrar', 409);
      tx.update(ref, { aparato: r.aparato, navegador: r.navegador, sedeId: r.sedeId, rol: r.rol, vistaAt: ahora });
      return { id: r.id, nueva: false };
    }
    // La clave solo la conoce este aparato: con ella cierra su sesión sin token.
    const clave = randomBytes(18).toString('base64url');
    tx.set(ref, {
      uid: u.uid, email: u.email, nombre: u.nombre || u.email, aparato: r.aparato, navegador: r.navegador,
      sedeId: r.sedeId, rol: r.rol, activa: true, claveHash: sha(clave), creadaAt: ahora, vistaAt: ahora,
      cerradaAt: null, cerradaPor: null,
    });
    return { id: r.id, nueva: true, clave };
  });
}

/** Las sesiones abiertas de la persona; con `todos` (solo admin), las de todo el equipo. */
export async function listarSesiones(u: Usuario, todos: boolean) {
  if (!esEquipo(u)) throw new ErrorPedido('sin_permiso', 'Solo para el equipo', 403);
  const col = firestore().collection(COLECCION);
  const q = todos && u.esAdmin ? col.where('activa', '==', true).limit(300) : col.where('uid', '==', u.uid).where('activa', '==', true).limit(50);
  const snap = await q.get();
  return snap.docs.map((d) => vistaSesion(d.id, d.data())).sort((a, b) => (b.vistaAt ?? 0) - (a.vistaAt ?? 0));
}

function marcarCerrada(ref: FirebaseFirestore.DocumentReference, por: string, motivo: string) {
  cache.delete(ref.id);
  return ref.update({ activa: false, cerradaAt: FieldValue.serverTimestamp(), cerradaPor: por, motivoCierre: motivo });
}

/** Cerrar una sesión (la propia en otro aparato, o cualquiera si es admin). */
export async function cerrarSesion(u: Usuario, id: string) {
  if (!idSesionValido(id)) throw new ErrorPedido('sesion', 'Sesión no válida', 404);
  const ref = firestore().doc(`${COLECCION}/${id}`);
  const s = (await ref.get()).data() ?? null;
  if (!puedeManejar(u, s)) throw new ErrorPedido('sin_permiso', 'No puedes cerrar esa sesión', 403);
  if (s!.activa !== true) return { id, cerrada: true, sinCambios: true };
  await marcarCerrada(ref, u.email || u.uid, s!.uid === u.uid ? 'la cerró desde otro aparato' : 'la cerró administración');
  return { id, cerrada: true, sinCambios: false };
}

/** El aparato cierra su propia sesión con su clave (al salir o al cambiar de empleado). */
export async function salirConClave(id: string, clave: unknown) {
  if (!idSesionValido(id) || typeof clave !== 'string' || clave.length < 20) throw new ErrorPedido('sesion', 'Sesión no válida', 404);
  const ref = firestore().doc(`${COLECCION}/${id}`);
  const s = (await ref.get()).data();
  if (!s || s.claveHash !== sha(clave)) throw new ErrorPedido('sesion', 'Sesión no válida', 404);
  if (s.activa === true) await marcarCerrada(ref, s.email || s.uid, 'salió en este aparato');
  return { id, cerrada: true };
}

/**
 * Cerrar en todos los aparatos: las sesiones registradas y además la cuenta en
 * Firebase (revokeRefreshTokens), así ningún aparato sigue entrando. La persona
 * misma, o administración para alguien del equipo (`email`).
 */
export async function cerrarTodas(u: Usuario, emailCrudo: unknown) {
  if (!esEquipo(u)) throw new ErrorPedido('sin_permiso', 'Solo para el equipo', 403);
  const email = typeof emailCrudo === 'string' ? emailCrudo.trim().toLowerCase() : '';
  let uid = u.uid;
  if (email && email !== u.email) {
    if (!u.esAdmin) throw new ErrorPedido('sin_permiso', 'Solo administración cierra las sesiones de otra persona', 403);
    uid = (await getAuth(firebaseApp()).getUserByEmail(email).catch(() => null))?.uid ?? '';
    if (!uid) throw new ErrorPedido('no_existe', 'No hay una cuenta con ese correo', 404);
  }
  const abiertas = await firestore().collection(COLECCION).where('uid', '==', uid).where('activa', '==', true).get();
  const quien = uid === u.uid ? 'cerró todas sus sesiones' : 'administración cerró todas sus sesiones';
  await Promise.all(abiertas.docs.map((d) => marcarCerrada(d.ref, u.email || u.uid, quien)));
  await getAuth(firebaseApp()).revokeRefreshTokens(uid);
  return { cerradas: abiertas.size };
}

/** Para require-user: ¿la sesión de este aparato sigue abierta? (30 s en memoria). */
export async function sesionEquipoActiva(id: string, uid: string): Promise<boolean> {
  if (!idSesionValido(id)) return true; // sin id válido no se revisa (aparatos viejos)
  const c = cache.get(id);
  if (c && c.hasta > Date.now()) return c.vigente;
  const d = await firestore().doc(`${COLECCION}/${id}`).get();
  const vigente = sesionVigente(d.exists ? d.data() : null, uid);
  cache.set(id, { vigente, hasta: Date.now() + CACHE_MS });
  return vigente;
}
