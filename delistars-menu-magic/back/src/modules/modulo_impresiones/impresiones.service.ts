import { FieldValue } from 'firebase-admin/firestore';
import { firestore } from '../../config/firestore';
import { ErrorPedido } from '../modulo_pedidos/reglas/armado';
import type { Usuario } from '../../middlewares/require-user';
import { planSolicitar, planPrueba, planTomar, planResultado, planRevisar, planDescartar, resumenPedido, Doc } from './reglas';

/**
 * Trabajos de impresión en impresiones/{id} (solo los escribe el servidor).
 * El pedido lleva el resumen `comanda` del último trabajo, sin cambiar su
 * versión (imprimir no es modificar el pedido).
 */
const esPruebas = () => process.env.FIREBASE_PROJECT_ID === 'delistars-pruebas';

function valores(plan: Doc): Doc {
  const out: Doc = {};
  for (const [k, v] of Object.entries(plan)) {
    if (k.startsWith('__union:')) out[k.slice('__union:'.length)] = FieldValue.arrayUnion(v);
    else out[k] = v;
  }
  return out;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function solicitar(u: Usuario, b: any) {
  const db = firestore();
  const orderId = String(b?.orderId || '');
  if (!orderId) throw new ErrorPedido('pedido', 'Falta el pedido', 422);
  const orderRef = db.doc(`orders/${orderId}`);
  const ref = db.collection('impresiones').doc();
  return db.runTransaction(async (tx) => {
    const snap = await tx.get(orderRef);
    if (!snap.exists) throw new ErrorPedido('no_existe', 'Ese pedido no existe', 404);
    const previos = (await tx.get(db.collection('impresiones').where('orderId', '==', orderId))).docs.map((d) => d.data());
    const ahora = Date.now();
    const j = planSolicitar(u, { id: orderId, ...snap.data() }, b, previos, esPruebas(), ahora);
    tx.set(ref, j);
    tx.update(orderRef, { comanda: resumenPedido(ref.id, j, 'pendiente', ahora) });
    return { id: ref.id, estado: j.estado, tipo: j.tipo };
  });
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function prueba(u: Usuario, b: any) {
  const ref = firestore().collection('impresiones').doc();
  const j = planPrueba(u, b);
  await ref.set(j);
  return { id: ref.id, estado: j.estado, tipo: j.tipo };
}

/** Aplica un paso a un trabajo y, si es el último de su pedido, actualiza el resumen. */
async function aplicar(id: string, planDe: (j: Doc, versionPedido: number | null, pedido: Doc | null) => Doc) {
  const db = firestore();
  const ref = db.doc(`impresiones/${id}`);
  return db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    if (!snap.exists) throw new ErrorPedido('no_existe', 'Ese trabajo de impresión no existe', 404);
    const j = snap.data() as Doc;
    const orderRef = j.orderId ? db.doc(`orders/${j.orderId}`) : null;
    const pedido = orderRef ? await tx.get(orderRef) : null;
    const p = pedido?.exists ? pedido.data() as Doc : null;
    const plan = planDe(j, p ? Number(p.version) || 1 : null, p);
    const ahora = Date.now();
    tx.update(ref, valores(plan));
    const estado = plan.estado ?? j.estado;
    if (orderRef && p && p.comanda?.impresionId === id && estado !== j.estado) {
      tx.update(orderRef, { comanda: resumenPedido(id, j, estado, ahora) });
    }
    return { id, estado, error: plan.error ?? null };
  });
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const tomar = (u: Usuario, id: string, b: any) => aplicar(id, (j, _v, p) => planTomar(j, u, b, p));
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const resultado = (u: Usuario, id: string, b: any) => aplicar(id, (j) => planResultado(j, u, b));
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const revisar = (u: Usuario, id: string, b: any) => aplicar(id, (j, v) => planRevisar(j, u, b, v));
export const descartar = (u: Usuario, id: string) => aplicar(id, (j) => planDescartar(j, u));
