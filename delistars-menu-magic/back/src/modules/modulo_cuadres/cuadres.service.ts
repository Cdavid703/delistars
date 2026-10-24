import { FieldValue } from 'firebase-admin/firestore';
import { firestore } from '../../config/firestore';
import { ErrorPedido } from '../modulo_pedidos/reglas/armado';
import type { Usuario } from '../../middlewares/require-user';
import { planEntrega, planConfirmarEntrega, planFondo, planResponderFondo, planCorregirFondo, planResolver, Doc } from './reglas';

/**
 * Cuadres de efectivo (§13.2, §13.3): los movimientos viven en cuadres/{id} y
 * solo los escribe el servidor. Cada cambio deja una línea en su historial.
 */
function valores(plan: Doc): Doc {
  const out: Doc = {};
  for (const [k, v] of Object.entries(plan)) {
    if (k.startsWith('__union:')) out[k.slice('__union:'.length)] = FieldValue.arrayUnion(v);
    else out[k] = v;
  }
  return out;
}

async function aplicar(id: string, u: Usuario, accion: string, planDe: (m: Doc) => Doc, extra?: (tx: FirebaseFirestore.Transaction, m: Doc, plan: Doc) => Promise<void> | void) {
  const db = firestore();
  const ref = db.doc(`cuadres/${id}`);
  return db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    if (!snap.exists) throw new ErrorPedido('no_existe', 'Ese movimiento no existe', 404);
    const m = { id, ...snap.data() } as Doc;
    const plan = planDe(m);
    await extra?.(tx, m, plan);
    const ahora = FieldValue.serverTimestamp();
    tx.update(ref, { ...valores(plan), actualizadoAt: ahora });
    tx.set(ref.collection('historial').doc(), { at: ahora, por: u.email || u.uid, accion, de: m.estado, a: plan.estado ?? m.estado, monto: plan.monto ?? m.monto, montoRecibido: plan.montoRecibido ?? m.montoRecibido ?? null });
    return { id, estado: plan.estado ?? m.estado, diferencia: plan.diferencia ?? m.diferencia ?? null };
  });
}

/** El domiciliario propone una entrega (los pedidos que cubre se validan contra Firestore). */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function crearEntrega(u: Usuario, b: any) {
  const db = firestore();
  const ids: string[] = Array.isArray(b?.pedidos) ? b.pedidos.map(String).slice(0, 50) : [];
  const docs = ids.length ? await db.getAll(...ids.map((id) => db.doc(`orders/${id}`))) : [];
  const pedidos = docs.map((d) => { if (!d.exists) throw new ErrorPedido('pedido', 'Uno de los pedidos no existe', 404); return d.data() as Doc; });
  const doc = planEntrega(u, b, pedidos);
  // Un pedido no puede ir en dos entregas a la vez (se contaría doble).
  for (let i = 0; i < ids.length; i += 30) {
    const abiertas = await db.collection('cuadres').where('pedidos', 'array-contains-any', ids.slice(i, i + 30)).get();
    if (abiertas.docs.some((d) => d.data().tipo === 'entrega' && d.data().estado === 'propuesto')) {
      throw new ErrorPedido('pedido', 'Uno de los pedidos ya está en una entrega que la caja no ha confirmado', 409);
    }
  }
  const ref = db.collection('cuadres').doc();
  const ahora = FieldValue.serverTimestamp();
  const batch = db.batch();
  batch.set(ref, { ...doc, creadoAt: ahora, actualizadoAt: ahora });
  batch.set(ref.collection('historial').doc(), { at: ahora, por: u.email || u.uid, accion: 'proponer', de: null, a: 'propuesto', monto: doc.monto, montoRecibido: null });
  await batch.commit();
  return { id: ref.id, estado: 'propuesto' };
}

/**
 * La caja confirma lo recibido. Con o sin diferencia, los pedidos que cubría
 * la entrega quedan cuadrados (la plata del pedido ya se cobró; la diferencia
 * es del movimiento y la resuelve administración).
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const confirmarEntrega = (u: Usuario, id: string, b: any) => aplicar(id, u, 'confirmar', (m) => planConfirmarEntrega(m, u, b), async (tx, m) => {
  const db = firestore();
  const ahora = FieldValue.serverTimestamp();
  const refs = ((m.pedidos as string[]) || []).map((oid) => db.doc(`orders/${oid}`));
  // En una transacción todas las lecturas van antes de cualquier escritura.
  const snaps = refs.length ? await tx.getAll(...refs) : [];
  for (const snap of snaps) {
    if (snap.exists && snap.data()?.status === 'pending_cuadre') {
      tx.update(snap.ref, { status: 'completed', completedAt: ahora, cuadreId: id, updatedAt: ahora });
    }
  }
});

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function crearFondo(u: Usuario, b: any) {
  const db = firestore();
  const doc = planFondo(u, b);
  const ref = db.collection('cuadres').doc();
  const ahora = FieldValue.serverTimestamp();
  const batch = db.batch();
  batch.set(ref, { ...doc, creadoAt: ahora, actualizadoAt: ahora });
  batch.set(ref.collection('historial').doc(), { at: ahora, por: u.email || u.uid, accion: 'fondo', de: null, a: 'propuesto', monto: doc.monto, montoRecibido: null });
  await batch.commit();
  return { id: ref.id, estado: 'propuesto' };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const responderFondo = (u: Usuario, id: string, b: any) => aplicar(id, u, 'responder', (m) => planResponderFondo(m, u, b));
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const corregirFondo = (u: Usuario, id: string, b: any) => aplicar(id, u, 'corregir', (m) => planCorregirFondo(m, u, b));
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const resolver = (u: Usuario, id: string, b: any) => aplicar(id, u, 'resolver', (m) => planResolver(m, u, b));
