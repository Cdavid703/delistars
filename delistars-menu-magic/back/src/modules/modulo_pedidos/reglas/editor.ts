/**
 * Un solo editor por pedido (especificación §10.3; 25 oct 2026). Lógica pura.
 *
 * - Varios cajeros pueden ver un pedido; solo uno lo edita. El que abre el
 *   detalle toma el control si está libre y lo suelta al cerrarlo.
 * - Si otro lo tiene, se ve quién y desde cuándo. Para cambiarlo hay que
 *   «Tomar control» con un motivo; al anterior se le avisa y deja de poder
 *   guardar de inmediato (lo revisan el servidor y las reglas de Firestore).
 * - No hay desbloqueo automático por inactividad (no se aprobó).
 */
import { ErrorPedido } from './armado';
import type { PedidoDoc } from './transiciones';

export interface Editor { uid: string; email: string; nombre: string }

/** Si otra persona tiene el control, no se puede editar. */
export function revisarEditor(p: PedidoDoc, u: { uid: string }) {
  const e = p.editor;
  if (e?.uid && e.uid !== u.uid) {
    throw new ErrorPedido('otro_editor', `${e.nombre || e.email || 'Otra persona'} está editando este pedido. Toma el control para cambiarlo`, 409);
  }
}

export type PlanEditor =
  | { cambio: false }
  | { cambio: true; editor: Editor | null; anterior: Editor | null; motivo: string | null; accion: 'tomar' | 'tomar_control' | 'soltar' };

/**
 * tomar: si está libre (o ya es suyo) lo toma sin motivo; si lo tiene otro,
 * exige motivo (es «Tomar control»). soltar: solo quien lo tiene.
 */
export function planEditor(p: PedidoDoc, u: Editor, accion: unknown, motivoRaw?: unknown): PlanEditor {
  const actual: Editor | null = p.editor?.uid ? p.editor : null;
  if (accion === 'soltar') {
    if (!actual || actual.uid !== u.uid) return { cambio: false };
    return { cambio: true, editor: null, anterior: actual, motivo: null, accion: 'soltar' };
  }
  if (accion !== 'tomar') throw new ErrorPedido('accion', 'Acción no válida (tomar o soltar)', 422);
  if (actual?.uid === u.uid) return { cambio: false };
  if (!actual) return { cambio: true, editor: u, anterior: null, motivo: null, accion: 'tomar' };
  const motivo = typeof motivoRaw === 'string' ? motivoRaw.trim().slice(0, 200) : '';
  if (motivo.length < 3) throw new ErrorPedido('motivo', `${actual.nombre || actual.email} está editando este pedido: escribe por qué tomas el control`, 422);
  return { cambio: true, editor: u, anterior: actual, motivo, accion: 'tomar_control' };
}
