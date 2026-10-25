import { FieldValue } from 'firebase-admin/firestore';
import { firestore } from '../../../config/firestore';
import { ErrorPedido } from '../reglas/armado';
import { PedidoDoc } from '../reglas/transiciones';
import { planInstruccion, planEntendido, planIndicaciones } from '../reglas/incidencias';
import type { Usuario } from '../../../middlewares/require-user';

/**
 * Incidencias de reparto (CarPlay, CP-2 y CP-4). El aviso al domiciliario lo
 * manda el scheduler al ver cambiar `instruccionCaja`.
 */
async function enTransaccion<T>(id: string, fn: (p: PedidoDoc, tx: FirebaseFirestore.Transaction, ref: FirebaseFirestore.DocumentReference) => T) {
  const db = firestore();
  const ref = db.doc(`orders/${id}`);
  return db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    if (!snap.exists) throw new ErrorPedido('no_existe', 'El pedido no existe', 404);
    return fn(snap.data() as PedidoDoc, tx, ref);
  });
}

/** La caja: Esperar, Reintentar o Regresar. Sube la versión (el domiciliario debe releer). */
export function darInstruccion(u: Usuario, id: string, tipo: unknown) {
  return enTransaccion(id, (p, tx, ref) => {
    const plan = planInstruccion(p, u, tipo);
    const versionActual = Number(p.version) || 0;
    // La misma instrucción otra vez (doble toque): no se repite el aviso.
    if (plan.igual) return { id, instruccionCaja: p.instruccionCaja, version: versionActual, sinCambios: true };
    const ahora = FieldValue.serverTimestamp();
    const version = versionActual + 1;
    tx.update(ref, { instruccionCaja: { ...plan.instruccionCaja, at: ahora }, version, updatedAt: ahora });
    tx.set(ref.collection('historial').doc(), {
      at: ahora, por: u.email || u.uid, rol: 'caja', accion: 'instruccion',
      de: null, a: null, motivo: plan.instruccionCaja.texto, status: p.status ?? null, version,
    });
    return { id, instruccionCaja: { ...plan.instruccionCaja, at: Date.now() }, version, sinCambios: false };
  });
}

/** El domiciliario: «Entendido». No mueve la etapa ni la versión. */
export function entenderInstruccion(u: Usuario, id: string) {
  return enTransaccion(id, (p, tx, ref) => {
    const plan = planEntendido(p, u);
    if (plan.yaEstaba) return { id, tipo: p.instruccionCaja.tipo, entendido: true, sinCambios: true };
    const ahora = FieldValue.serverTimestamp();
    tx.update(ref, { 'instruccionCaja.entendidoAt': ahora, updatedAt: ahora });
    tx.set(ref.collection('historial').doc(), {
      at: ahora, por: u.email || u.uid, rol: 'domiciliario', accion: 'instruccion_entendida',
      de: null, a: null, motivo: p.instruccionCaja.texto ?? null, status: p.status ?? null, version: Number(p.version) || 0,
    });
    return { id, tipo: p.instruccionCaja.tipo, entendido: true, sinCambios: false };
  });
}

/** La caja escribe (o borra) las indicaciones breves para el domiciliario. */
export function fijarIndicaciones(u: Usuario, id: string, texto: unknown) {
  return enTransaccion(id, (p, tx, ref) => {
    const plan = planIndicaciones(p, u, texto);
    if ((p.indicacionesBreves ?? null) === plan.indicacionesBreves) return { id, indicacionesBreves: plan.indicacionesBreves, sinCambios: true };
    const ahora = FieldValue.serverTimestamp();
    tx.update(ref, { indicacionesBreves: plan.indicacionesBreves, indicacionesAt: ahora, indicacionesPor: u.email || u.uid, updatedAt: ahora });
    return { id, indicacionesBreves: plan.indicacionesBreves, sinCambios: false };
  });
}
