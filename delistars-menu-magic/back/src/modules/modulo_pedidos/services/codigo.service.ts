import { createHash } from 'crypto';
import { FieldValue } from 'firebase-admin/firestore';
import { firestore } from '../../../config/firestore';
import { ErrorPedido } from '../reglas/armado';
import { rolesDe, PedidoDoc } from '../reglas/transiciones';
import {
  generarCodigo, normalizarCodigo, codigoVigente, minutosBloqueo, sumarFallo, vistaPublica, Intentos,
} from '../reglas/codigo';
import type { Usuario } from '../../../middlewares/require-user';

/**
 * Código privado de los pedidos de caja (Fase 4, P-16). Se guarda:
 *  - en el pedido: `codigoPrivado: { codigo, creadoAt, creadoPor }` (lo ve la caja;
 *    el cliente no puede leer pedidos ajenos);
 *  - en `codigos_privados/{sha256(código)}` → { orderId }, para buscarlo
 *    (solo el servidor toca esa colección: las reglas la niegan a todos).
 * Los intentos fallidos van en `intentos_codigo/{sha256(ip)}`.
 */
const sha = (s: string) => createHash('sha256').update(s).digest('hex');

/** La caja (de la sede del pedido) o el admin genera el código; uno nuevo anula el anterior. */
export async function generarCodigoPedido(u: Usuario, id: string) {
  const db = firestore();
  const ref = db.doc(`orders/${id}`);
  return db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    if (!snap.exists) throw new ErrorPedido('no_existe', 'El pedido no existe', 404);
    const p = snap.data() as PedidoDoc;
    const roles = rolesDe(u, p);
    if (!roles.includes('caja') && !roles.includes('admin')) {
      throw new ErrorPedido('sin_permiso', 'Solo la caja de la sede genera el código', 403);
    }
    if (p.clientUid) throw new ErrorPedido('ya_tiene_cuenta', 'Este pedido ya está en la cuenta del cliente: lo sigue desde ahí', 409);
    if (!codigoVigente(p)) throw new ErrorPedido('vencido', 'El pedido terminó hace más de 30 días', 409);

    const codigo = generarCodigo();
    const anterior = p.codigoPrivado?.codigo;
    if (anterior) tx.delete(db.doc(`codigos_privados/${sha(anterior)}`));
    tx.set(db.doc(`codigos_privados/${sha(codigo)}`), { orderId: id, creadoAt: FieldValue.serverTimestamp() });
    tx.update(ref, {
      codigoPrivado: { codigo, creadoAt: FieldValue.serverTimestamp(), creadoPor: u.email || u.uid },
      updatedAt: FieldValue.serverTimestamp(),
    });
    return { id, codigo, reemplazo: !!anterior };
  });
}

/**
 * Busca el pedido de un código. Cuenta los fallos por conexión: con 5 seguidos
 * se bloquea 15 minutos (así nadie puede probar códigos al azar).
 */
async function pedidoDeCodigo(texto: unknown, ip: string): Promise<{ id: string; p: PedidoDoc }> {
  const db = firestore();
  const intentosRef = db.doc(`intentos_codigo/${sha(ip || 'sin-ip')}`);
  const intentos = (await intentosRef.get()).data() as Intentos | undefined;
  const faltan = minutosBloqueo(intentos);
  if (faltan) throw new ErrorPedido('bloqueado', `Demasiados intentos. Espera ${faltan} min e intenta de nuevo`, 429);

  const fallo = async () => {
    const n = sumarFallo(intentos);
    await intentosRef.set({ ...n, actualizadoAt: FieldValue.serverTimestamp() });
    return new ErrorPedido('codigo_invalido', n.bloqueadoHasta
      ? 'Ese código no es válido. Por seguridad, espera 15 min antes de intentar de nuevo'
      : 'Ese código no es válido. Revísalo: son 8 letras y números', 404);
  };

  const codigo = normalizarCodigo(texto);
  if (!codigo) throw await fallo();
  const indice = await db.doc(`codigos_privados/${sha(codigo)}`).get();
  const id = indice.data()?.orderId as string | undefined;
  const snap = id ? await db.doc(`orders/${id}`).get() : null;
  const p = snap?.exists ? (snap.data() as PedidoDoc) : null;
  // El índice puede quedar de un código anulado: manda el que tiene el pedido.
  if (!id || !p || p.codigoPrivado?.codigo !== codigo) throw await fallo();
  if (!codigoVigente(p)) throw new ErrorPedido('vencido', 'Este código ya venció: el pedido terminó hace más de 30 días', 410);
  return { id, p };
}

/** Ver el pedido con el código (sin cuenta). */
export async function verConCodigo(texto: unknown, ip: string) {
  const { id, p } = await pedidoDeCodigo(texto, ip);
  return vistaPublica(id, p);
}

/** Guardar el pedido en la cuenta de quien tiene el código (P-15: después sale en "Mis pedidos"). */
export async function vincularConCodigo(u: Usuario, texto: unknown, ip: string) {
  if (u.anonimo || !u.email) throw new ErrorPedido('cuenta_obligatoria', 'Entra con tu cuenta para guardar el pedido', 403);
  const { id } = await pedidoDeCodigo(texto, ip);
  const db = firestore();
  const ref = db.doc(`orders/${id}`);
  return db.runTransaction(async (tx) => {
    const p = (await tx.get(ref)).data() as PedidoDoc;
    if (p.clientUid === u.uid) return { id, vinculado: true };
    if (p.clientUid) throw new ErrorPedido('ya_tiene_cuenta', 'Este pedido ya está guardado en otra cuenta', 409);
    const ahora = FieldValue.serverTimestamp();
    tx.update(ref, { clientUid: u.uid, clientEmail: u.email, vinculadoAt: ahora, updatedAt: ahora });
    tx.set(ref.collection('historial').doc(), {
      at: ahora, por: u.email, rol: 'cliente', accion: 'vincular',
      de: null, a: null, motivo: 'Guardó el pedido en su cuenta con el código privado',
      status: p.status ?? null, version: Number(p.version) || 0,
    });
    return { id, vinculado: true };
  });
}
