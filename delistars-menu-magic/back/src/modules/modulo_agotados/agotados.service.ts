import { FieldValue } from 'firebase-admin/firestore';
import { firestore } from '../../config/firestore';
import { ErrorPedido } from '../modulo_pedidos/reglas/armado';
import type { Usuario } from '../../middlewares/require-user';
import { ProductsRepository } from '../modulo_products/repositories/products.repository';
import { puedeMarcar, idProducto, idsDespues } from './reglas';

/**
 * agotados/{sedeId} = { ids: number[], nombres: { [id]: nombre }, actualizadoAt }
 * (lectura pública: el menú y la app lo escuchan en vivo). Cada cambio deja
 * agotados/{sedeId}/historial/{auto} = { idProducto, nombre, agotado, por, at }
 * (lo lee el equipo; ahí queda quién lo marcó).
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function marcarAgotado(u: Usuario, b: any) {
  const sedeId = String(b?.sedeId || '');
  puedeMarcar(u, sedeId);
  const id = idProducto(b?.idProducto);
  if (typeof b?.agotado !== 'boolean') throw new ErrorPedido('agotado', 'Falta decir si queda agotado (true) o disponible (false)', 422);
  const producto = await new ProductsRepository().getById(id);
  if (!producto) throw new ErrorPedido('producto', 'Ese producto no existe en el menú', 404);
  const nombre = String(producto.nombre_producto || '');
  const db = firestore();
  const ref = db.doc(`agotados/${sedeId}`);
  return db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    const { ids, cambio } = idsDespues(snap.data()?.ids, id, b.agotado);
    if (cambio) {
      const ahora = FieldValue.serverTimestamp();
      tx.set(ref, {
        ids,
        nombres: { [String(id)]: b.agotado ? nombre : FieldValue.delete() },
        actualizadoAt: ahora,
      }, { merge: true });
      tx.set(ref.collection('historial').doc(), { idProducto: id, nombre, agotado: b.agotado, por: u.email || u.uid, at: ahora });
    }
    return { sedeId, idProducto: id, agotado: b.agotado, ids, cambio };
  });
}
