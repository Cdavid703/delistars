import { FieldValue } from 'firebase-admin/firestore';
import { firestore } from '../../config/firestore';
import { ErrorPedido } from '../modulo_pedidos/reglas/armado';
import type { PedidoDoc } from '../modulo_pedidos/reglas/transiciones';
import type { Usuario } from '../../middlewares/require-user';
import { datosDevolucion } from '../modulo_cuenta/reglas';
import { ABIERTOS } from '../../shared/reclamos';
import { planCrear, planRevisar, planProponer, planAutorizar, planResponder, planCerrar, planMensaje, Doc } from './reglas';

/**
 * Reclamos (§14): la ficha vive en reclamos/{id}; solo la escribe el servidor.
 * Cada cambio deja una línea en reclamos/{id}/historial y actualiza
 * `actualizadoAt` (la pantalla ordena por ahí).
 */

/** Marcadores del plan → valores de Firestore ('__union:<campo>' = arrayUnion). */
function valores(plan: Doc): Doc {
  const out: Doc = {};
  for (const [k, v] of Object.entries(plan)) {
    if (k.startsWith('__union:')) out[k.slice('__union:'.length)] = FieldValue.arrayUnion(v);
    else out[k] = v;
  }
  return out;
}

async function aplicar(id: string, u: Usuario, accion: string, planDe: (r: Doc) => Doc | Promise<Doc>, extra?: (tx: FirebaseFirestore.Transaction, r: Doc, plan: Doc) => void) {
  const db = firestore();
  const ref = db.doc(`reclamos/${id}`);
  return db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    if (!snap.exists) throw new ErrorPedido('no_existe', 'Ese caso no existe', 404);
    const r = { id, ...snap.data() } as Doc;
    const plan = await planDe(r);
    const ahora = FieldValue.serverTimestamp();
    tx.update(ref, { ...valores(plan), actualizadoAt: ahora });
    tx.set(ref.collection('historial').doc(), {
      at: ahora, por: u.email || u.uid, accion, de: r.estado, a: plan.estado ?? r.estado,
      reembolso: plan['reembolso.estado'] ?? plan.reembolso?.estado ?? null,
    });
    extra?.(tx, r, plan);
    return { id, estado: plan.estado ?? r.estado, reembolso: plan['reembolso.estado'] ?? plan.reembolso?.estado ?? r.reembolso?.estado ?? null };
  });
}

/** El cliente reporta un problema de su pedido entregado. Uno abierto por pedido. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function crearReclamo(u: Usuario, b: any) {
  const db = firestore();
  const orderId = String(b?.orderId || '');
  if (!orderId) throw new ErrorPedido('pedido', 'Falta el pedido', 422);
  const pedido = await db.doc(`orders/${orderId}`).get();
  if (!pedido.exists) throw new ErrorPedido('no_existe', 'El pedido no existe', 404);
  const p = pedido.data() as PedidoDoc & Doc;
  const doc = planCrear(p, orderId, u, b);
  const abiertos = await db.collection('reclamos').where('orderId', '==', orderId).where('estado', 'in', ABIERTOS).limit(1).get();
  if (!abiertos.empty) throw new ErrorPedido('abierto', 'Ya hay un caso abierto para este pedido', 409);
  const ref = db.collection('reclamos').doc();
  const ahora = FieldValue.serverTimestamp();
  const batch = db.batch();
  batch.set(ref, { ...doc, creadoAt: ahora, actualizadoAt: ahora });
  batch.set(ref.collection('historial').doc(), { at: ahora, por: u.email || u.uid, accion: 'crear', de: null, a: 'recibido', reembolso: null });
  batch.update(db.doc(`orders/${orderId}`), { reclamoId: ref.id, reclamoEstado: 'recibido', updatedAt: ahora });
  await batch.commit();
  return { id: ref.id, estado: 'recibido' };
}

export const revisar = (u: Usuario, id: string) => aplicar(id, u, 'revisar', (r) => planRevisar(r, u), marcarPedido);
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const proponer = (u: Usuario, id: string, b: any) => aplicar(id, u, 'proponer', (r) => planProponer(r, u, b), marcarPedido);
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const autorizar = (u: Usuario, id: string, b: any) => aplicar(id, u, 'autorizar', (r) => planAutorizar(r, u, b), marcarPedido);
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const cerrar = (u: Usuario, id: string, b: any) => aplicar(id, u, 'cerrar', (r) => planCerrar(r, u, b), marcarPedido);
export const mensaje = (u: Usuario, id: string, texto: unknown) => aplicar(id, u, 'mensaje', (r) => planMensaje(r, u, texto));

/** El estado del caso también va en el pedido, para la tarjeta sin otra consulta. */
function marcarPedido(tx: FirebaseFirestore.Transaction, r: Doc, plan: Doc) {
  if (!plan.estado || !r.orderId) return;
  tx.update(firestore().doc(`orders/${r.orderId}`), { reclamoEstado: plan.estado, updatedAt: FieldValue.serverTimestamp() });
}

/**
 * El cliente responde. Si acepta con reembolso: saldo → crédito en su cuenta
 * ya mismo (id fijo: no se duplica); transferencia → queda para la caja en
 * devoluciones_saldo (la misma franja que ya usa para el saldo de cuentas
 * eliminadas), con los datos bancarios validados.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function responder(u: Usuario, id: string, b: any) {
  const db = firestore();
  let datos: Doc | null = null;
  return aplicar(id, u, 'responder', (r) => {
    const plan = planResponder(r, u, b);
    if (plan['reembolso.eleccion'] === 'transferencia') {
      const d = datosDevolucion(b?.datos);
      if ('errores' in d) throw new ErrorPedido('datos', d.errores.join('. '), 422);
      datos = d.datos;
      plan['reembolso.datos'] = datos;
    }
    return plan;
  }, (tx, r, plan) => {
    marcarPedido(tx, r, plan);
    const monto = Number(r.reembolso?.monto) || 0;
    const ahora = FieldValue.serverTimestamp();
    if (plan['reembolso.eleccion'] === 'saldo' && monto > 0) {
      tx.set(db.doc(`customers/${r.clientUid}/credits/rec_${id}`), {
        sedeId: r.sedeId || '', monto, estado: 'disponible', origenOrderId: r.orderId, motivo: 'reclamo', reclamoId: id,
        creadoPor: 'servidor', createdAt: ahora, usadoEnOrderId: null, usadoAt: null,
      }, { merge: true });
    }
    if (plan['reembolso.eleccion'] === 'transferencia' && monto > 0) {
      tx.set(db.doc(`devoluciones_saldo/rec_${id}`), {
        uid: r.clientUid, nombre: r.clientNombre || 'Cliente', sedeId: r.sedeId || '', monto, datos,
        estado: 'por_transferir', origen: 'reclamo', reclamoId: id, orderId: r.orderId, orderNumber: r.orderNumber ?? null, creadoAt: ahora,
      });
    }
  });
}

/** La caja marcó la transferencia del reclamo como hecha: el reembolso queda ejecutado. */
export async function reembolsoEjecutado(reclamoId: string, por: string) {
  await firestore().doc(`reclamos/${reclamoId}`).update({
    'reembolso.estado': 'ejecutado', 'reembolso.ejecutadoAt': FieldValue.serverTimestamp(), 'reembolso.ejecutadoPor': por,
    actualizadoAt: FieldValue.serverTimestamp(),
  }).catch(() => { /* el reclamo pudo borrarse; la devolución ya quedó marcada */ });
}
