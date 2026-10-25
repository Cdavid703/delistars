/**
 * Agotado por sede (especificación §7.2, §16.1 y P-14; 25 oct 2026). Lógica pura.
 *
 * - El catálogo es el mismo para las dos sedes; «agotado» es solo de una sede.
 *   El producto sigue en el menú con la etiqueta «Agotado» y no se puede agregar.
 *   (El «disponible» del admin es otra cosa: esconde el producto en las dos sedes.)
 * - Lo marcan la caja de esa sede y administración; queda registrado quién y cuándo.
 * - No cambia precios ni es inventario: es un interruptor por producto y sede.
 */
import { ErrorPedido } from '../modulo_pedidos/reglas/armado';
import { TODAS_LAS_SEDES } from '../../middlewares/require-user';

export interface QuienMarca { esAdmin: boolean; sedes: { caja: string[] }; reloj?: string | null }

/** ¿Puede esta persona marcar agotados en esta sede? Caja de la sede o administración. */
export function puedeMarcar(u: QuienMarca, sedeId: string) {
  if (!TODAS_LAS_SEDES.includes(sedeId)) throw new ErrorPedido('sede', 'Sede no válida', 422);
  if (!u.esAdmin && !u.sedes.caja.includes(sedeId)) {
    throw new ErrorPedido('sin_permiso', 'Solo la caja de esta sede o administración marcan agotados', 403);
  }
}

/** Id de producto válido (entero positivo). */
export function idProducto(v: unknown): number {
  const n = Number(v);
  if (!Number.isInteger(n) || n <= 0) throw new ErrorPedido('producto', 'Producto no válido', 422);
  return n;
}

/** Lista nueva de ids agotados. Marcar lo que ya estaba (o desmarcar lo que no) no cambia nada. */
export function idsDespues(actuales: unknown, id: number, agotado: boolean): { ids: number[]; cambio: boolean } {
  const lista = Array.isArray(actuales) ? actuales.map(Number).filter((x) => Number.isInteger(x) && x > 0) : [];
  const ya = lista.includes(id);
  if (agotado === ya) return { ids: lista, cambio: false };
  return { ids: agotado ? [...lista, id] : lista.filter((x) => x !== id), cambio: true };
}
