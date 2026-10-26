import { FieldValue } from 'firebase-admin/firestore';
import { firestore } from '../../../config/firestore';
import { ErrorPedido } from '../reglas/armado';
import { PedidoDoc } from '../reglas/transiciones';
import { planInstruccion, planEntendido, planIndicaciones, planDevolverPlata } from '../reglas/incidencias';
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

/** La caja le devuelve la plata a un pedido que volvió a la sede. */
export function devolverPlata(u: Usuario, id: string) {
  const db = firestore();
  return enTransaccion(id, (p, tx, ref) => {
    const plan = planDevolverPlata(p, u);
    const ahora = FieldValue.serverTimestamp();
    const pesos = (n: number) => `$${n.toLocaleString('es-CO')}`;
    const partes = [
      plan.monto ? `te devolvemos ${pesos(plan.monto)}: entra a tu pedido y elige si los quieres por transferencia${p.clientEmail ? ' o como saldo a favor' : ''}` : '',
      plan.saldo ? `el saldo a favor que usaste (${pesos(plan.saldo)}) ya volvió a tu cuenta` : '',
    ].filter(Boolean);
    if (p.clientUid) {
      for (const cid of plan.creditos) {
        tx.set(db.doc(`customers/${p.clientUid}/credits/${cid}`), { estado: 'disponible', usadoEnOrderId: null, usadoAt: null }, { merge: true });
      }
    }
    tx.update(ref, {
      ...(plan.devolucion ? { devolucion: plan.devolucion } : {}),
      ...(plan.creditos.length ? { 'saldoAplicado.devuelto': true } : {}),
      clientMessages: FieldValue.arrayUnion({
        role: 'cashier', name: u.nombre || 'Caja', ts: Date.now(),
        text: `Tu pedido volvió a la sede y no se pudo entregar. ${partes.join('; y ')}.`,
      }),
      updatedAt: ahora,
    });
    tx.set(ref.collection('historial').doc(), {
      at: ahora, por: u.email || u.uid, rol: 'caja', accion: 'devolver_plata',
      de: null, a: null, motivo: partes.join('; '), status: p.status ?? null, version: Number(p.version) || 0,
    });
    return { id, devolucion: plan.devolucion, saldoDevuelto: plan.saldo };
  });
}
