import { createHash } from 'crypto';
import { FieldValue, Timestamp } from 'firebase-admin/firestore';
import { getAuth } from 'firebase-admin/auth';
import { firebaseApp, firestore } from '../../config/firestore';
import { reembolsoEjecutado } from '../modulo_reclamos/reclamos.service';
import { ErrorPedido } from '../modulo_pedidos/reglas/armado';
import { SEDES } from '../modulo_pedidos/reglas/sedes';
import type { Usuario } from '../../middlewares/require-user';
import {
  pendientesDeCuenta, saldoPorSede, datosDevolucion, sesionReciente, listaParaBorrar, camposAnonimos, PLAZO_MS,
} from './reglas';

/**
 * Eliminar la cuenta (Fase 4, paso 4; P-25). Colecciones (solo el servidor escribe):
 *  - eliminaciones/{uid}: { estado: pendiente | cancelada | ejecutada, solicitadaAt, ejecutarDesde }
 *  - devoluciones_saldo/{uid}_{sedeId}: saldo a favor que la caja de esa sede
 *    le transfiere antes de borrar (la caja lo lee para verlo y lo marca por la API).
 */
const ms = (t: unknown) => (t as Timestamp | undefined)?.toMillis?.() ?? null;
const sha = (s: string) => createHash('sha256').update(s).digest('hex');

async function datosDeCuenta(uid: string) {
  const db = firestore();
  const [elim, pedidos, devs, creditos] = await Promise.all([
    db.doc(`eliminaciones/${uid}`).get(),
    db.collection('orders').where('clientUid', '==', uid).get(),
    db.collection('devoluciones_saldo').where('uid', '==', uid).get(),
    db.collection(`customers/${uid}/credits`).get(),
  ]);
  return {
    elim: elim.exists ? elim.data()! : null,
    pedidos: pedidos.docs.map((d) => ({ id: d.id, p: d.data() })),
    devoluciones: devs.docs.map((d) => ({ id: d.id, d: d.data() })),
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    creditos: creditos.docs.map((d) => ({ id: d.id, ...d.data() }) as Record<string, any>),
  };
}

/** Lo que ve el cliente en "Eliminar mi cuenta". */
export async function estadoEliminacion(u: Usuario) {
  const x = await datosDeCuenta(u.uid);
  const activa = x.elim?.estado === 'pendiente';
  return {
    solicitud: activa ? { solicitadaAt: ms(x.elim!.solicitadaAt), ejecutarDesde: ms(x.elim!.ejecutarDesde) } : null,
    pendientes: pendientesDeCuenta(x.pedidos, x.devoluciones),
    // Saldo que aún tiene (antes de pedir la eliminación): se le transfiere.
    saldo: saldoPorSede(x.creditos),
  };
}

/** ¿Tiene una eliminación en curso? (mientras tanto no puede pedir). */
export async function eliminacionPendiente(uid: string): Promise<boolean> {
  const d = await firestore().doc(`eliminaciones/${uid}`).get();
  return d.exists && d.data()?.estado === 'pendiente';
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function solicitarEliminacion(u: Usuario, b: any) {
  if (u.anonimo || !u.email) throw new ErrorPedido('cuenta_obligatoria', 'Entra con tu cuenta', 403);
  if (!sesionReciente(u.autenticadoAt)) {
    throw new ErrorPedido('sesion_vieja', 'Por seguridad, vuelve a entrar con tu cuenta y confirma de nuevo', 401);
  }
  const db = firestore();
  const x = await datosDeCuenta(u.uid);
  if (x.elim?.estado === 'pendiente') return estadoEliminacion(u);

  const saldo = saldoPorSede(x.creditos);
  let datos: Record<string, unknown> | null = null;
  if (Object.keys(saldo).length) {
    const r = datosDevolucion(b?.datosDevolucion);
    if ('errores' in r) throw new ErrorPedido('datos_devolucion', `Para devolverte tu saldo: ${r.errores.join('. ')}`);
    datos = r.datos;
  }
  const perfil = (await db.doc(`customers/${u.uid}`).get()).data() || {};
  const ahora = Date.now();
  const batch = db.batch();
  batch.set(db.doc(`eliminaciones/${u.uid}`), {
    uid: u.uid, email: u.email, estado: 'pendiente',
    solicitadaAt: FieldValue.serverTimestamp(),
    ejecutarDesde: Timestamp.fromMillis(ahora + PLAZO_MS),
  });
  // El saldo de cada sede queda apartado para transferírselo (ya no se puede usar).
  for (const [sedeId, monto] of Object.entries(saldo)) {
    const ids = x.creditos.filter((c) => c.estado === 'disponible' && c.sedeId === sedeId).map((c) => c.id);
    batch.set(db.doc(`devoluciones_saldo/${u.uid}_${sedeId}`), {
      uid: u.uid, sedeId, sedeName: SEDES[sedeId]?.nombre || sedeId, monto, creditoIds: ids,
      nombre: perfil.name || u.nombre || '', datos, estado: 'por_transferir',
      creadoAt: FieldValue.serverTimestamp(), motivo: 'eliminar_cuenta',
    });
    for (const id of ids) batch.update(db.doc(`customers/${u.uid}/credits/${id}`), { estado: 'en_devolucion' });
  }
  await batch.commit();
  return estadoEliminacion(u);
}

/** Arrepentirse: la cuenta sigue. El saldo que aún no se transfirió vuelve a estar disponible. */
export async function cancelarEliminacion(u: Usuario) {
  const db = firestore();
  const x = await datosDeCuenta(u.uid);
  if (x.elim?.estado !== 'pendiente') return estadoEliminacion(u);
  const batch = db.batch();
  batch.update(db.doc(`eliminaciones/${u.uid}`), { estado: 'cancelada', canceladaAt: FieldValue.serverTimestamp() });
  for (const { id, d } of x.devoluciones) {
    if (d.estado !== 'por_transferir') continue;
    batch.delete(db.doc(`devoluciones_saldo/${id}`));
    for (const cid of d.creditoIds || []) batch.update(db.doc(`customers/${u.uid}/credits/${cid}`), { estado: 'disponible' });
  }
  await batch.commit();
  return estadoEliminacion(u);
}

/** La caja de la sede (o el admin) marca que ya le transfirió el saldo. */
export async function marcarSaldoTransferido(u: Usuario, id: string) {
  const db = firestore();
  const ref = db.doc(`devoluciones_saldo/${id}`);
  return db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    if (!snap.exists) throw new ErrorPedido('no_existe', 'Esa devolución no existe', 404);
    const d = snap.data()!;
    if (!u.esAdmin && !(u.sedes?.caja ?? []).includes(d.sedeId)) throw new ErrorPedido('sin_permiso', 'Solo la caja de esa sede', 403);
    if (d.estado === 'transferida') return { id, estado: 'transferida' };
    tx.update(ref, { estado: 'transferida', transferidaAt: FieldValue.serverTimestamp(), transferidaPor: u.email || u.uid });
    for (const cid of d.creditoIds || []) tx.update(db.doc(`customers/${d.uid}/credits/${cid}`), { estado: 'devuelto' });
    return { id, estado: 'transferida', reclamoId: (d.reclamoId as string) || null };
  }).then(async (r) => {
    // Devolución de un reclamo (§14.2): el reembolso del caso queda ejecutado.
    if (r.reclamoId) await reembolsoEjecutado(r.reclamoId, u.email || u.uid);
    return { id: r.id, estado: r.estado };
  });
}

/**
 * Borra las cuentas cuyo plazo venció y que ya no tienen nada pendiente.
 * Corre cada 6 horas en el servidor. Devuelve cuántas borró.
 */
export async function ejecutarEliminaciones(ahora = Date.now()): Promise<number> {
  const db = firestore();
  // Un solo filtro (sin índice compuesto); el plazo se revisa aquí.
  const pendientes = await db.collection('eliminaciones').where('estado', '==', 'pendiente').get();
  let borradas = 0;
  for (const e of pendientes.docs.filter((d) => (ms(d.data().ejecutarDesde) ?? Infinity) <= ahora)) {
    const uid = e.id;
    try {
      const x = await datosDeCuenta(uid);
      if (!listaParaBorrar(ms(x.elim?.ejecutarDesde) ?? ahora, pendientesDeCuenta(x.pedidos, x.devoluciones), ahora)) continue;
      // 1) Pedidos: quedan para la contabilidad, sin datos personales.
      for (let i = 0; i < x.pedidos.length; i += 400) {
        const batch = db.batch();
        for (const { id } of x.pedidos.slice(i, i + 400)) batch.update(db.doc(`orders/${id}`), camposAnonimos() as FirebaseFirestore.UpdateData<FirebaseFirestore.DocumentData>);
        await batch.commit();
      }
      // 2) Devoluciones de saldo: queda el monto y la fecha, sin datos de la cuenta bancaria.
      for (const { id } of x.devoluciones) {
        await db.doc(`devoluciones_saldo/${id}`).update({ datos: FieldValue.delete(), nombre: 'Cliente eliminado' });
      }
      // 3) Perfil, direcciones, premios y saldo.
      await db.recursiveDelete(db.doc(`customers/${uid}`));
      // 4) El acceso (requiere el rol de administrador de Firebase Authentication).
      try {
        await getAuth(firebaseApp()).deleteUser(uid);
      } catch (err) {
        const code = (err as { code?: string })?.code;
        if (code !== 'auth/user-not-found') throw err;
      }
      await e.ref.update({
        estado: 'ejecutada', ejecutadaAt: FieldValue.serverTimestamp(),
        email: FieldValue.delete(), emailSha: sha(String(x.elim?.email || '')),
      });
      borradas++;
    } catch (err) {
      console.error(`[cuenta] no se pudo borrar ${uid}:`, (err as Error)?.message || err);
    }
  }
  return borradas;
}

/** Programa la tarea: al arrancar (con un minuto de margen) y cada 6 horas. */
export function programarEliminaciones() {
  const correr = () => ejecutarEliminaciones()
    .then((n) => { if (n) console.log(`[cuenta] cuentas borradas: ${n}`); })
    .catch((err) => console.error('[cuenta] eliminaciones:', err?.message || err));
  setTimeout(correr, 60_000);
  setInterval(correr, 6 * 3600 * 1000);
}
