import { createHash } from 'crypto';
import { firestore } from '../../../config/firestore';
import { ErrorPedido } from '../reglas/armado';

/**
 * Idempotencia: el cliente manda `Idempotency-Key` (un UUID por intento de
 * pedido). Si reintenta con la misma clave y el mismo cuerpo (se cayó la red,
 * tocó dos veces) recibe la MISMA respuesta y no se crea un pedido repetido.
 * Misma clave con otro cuerpo → 422. Mientras el primero se procesa → 409.
 * Se guarda en idempotencia/{sha256(uid:clave)} (solo el servidor la toca).
 */
export interface Respuesta { status: number; body: unknown }

const sha = (s: string) => createHash('sha256').update(s).digest('hex');

export async function conIdempotencia(uid: string, clave: unknown, cuerpo: unknown, fn: () => Promise<Respuesta>): Promise<Respuesta> {
  if (typeof clave !== 'string' || !/^[A-Za-z0-9_-]{8,100}$/.test(clave)) {
    throw new ErrorPedido('idempotencia', 'Falta el encabezado Idempotency-Key (8 a 100 letras, números, - o _)', 400);
  }
  const hash = sha(JSON.stringify(cuerpo ?? null));
  const ref = firestore().doc(`idempotencia/${sha(`${uid}:${clave}`)}`);
  try {
    await ref.create({ uid, hash, estado: 'en_proceso', creadoAt: new Date(), venceAt: new Date(Date.now() + 24 * 3600 * 1000) });
  } catch (e) {
    if ((e as { code?: number }).code !== 6) throw e; // 6 = ALREADY_EXISTS
    const d = (await ref.get()).data() || {};
    if (d.hash !== hash) throw new ErrorPedido('idempotencia_distinta', 'Esa Idempotency-Key ya se usó con otro contenido', 422);
    if (d.estado !== 'listo') throw new ErrorPedido('en_proceso', 'Ese pedido se está procesando; intenta en unos segundos', 409);
    return { status: d.status, body: d.body };
  }
  try {
    const r = await fn();
    await ref.update({ estado: 'listo', status: r.status, body: r.body });
    return r;
  } catch (err) {
    // Falló: se libera la clave para que el cliente pueda reintentar.
    await ref.delete().catch(() => undefined);
    throw err;
  }
}

/**
 * Igual, pero la clave es opcional (W-4): sin `Idempotency-Key` se ejecuta
 * directo, como antes; con clave, un reintento devuelve la misma respuesta y no
 * repite la acción (un mensaje no sale dos veces). Para rutas que la web ya
 * usaba sin clave y que el reloj necesita poder reintentar.
 */
export async function conIdempotenciaOpcional(uid: string, clave: unknown, cuerpo: unknown, fn: () => Promise<Respuesta>): Promise<Respuesta> {
  if (clave == null || clave === '') return fn();
  return conIdempotencia(uid, clave, cuerpo, fn);
}
