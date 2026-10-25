/**
 * Código promocional, premios de fidelización y saldo a favor al crear un
 * pedido (lógica pura). Igual que el checkout de la web (ClientPanel →
 * handleSubmit y services/firebase.js → redeemLoyaltyRewards / usarSaldo).
 */
import { validarCodigo, CODIGOS } from '../../../shared/codigos';
import { saldoDisponible, aplicarSaldo, limiteDeSaldo } from '../../../shared/devolucion';
import { ErrorPedido } from './armado';

/** Espejo de LOYALTY_REWARD en src/services/firebase.js. */
export const PREMIO_NOMBRE = 'Hamburguesa Especial + Perro Grande con tocineta';
export const lineaPremio = (n: number) => `${n}x ${PREMIO_NOMBRE} — GRATIS (premio fidelización, NO cobrar)`;

export interface Premio { id: string; sedeId: string; status: string; expiresAtMs: number | null }
export interface Credito { id: string; sedeId: string; estado: string; monto: number }

/** Premios a canjear: los vigentes de la sede, primero los que vencen antes. */
export function elegirPremios(premios: Premio[], sedeId: string, cantidad: unknown, ahora = Date.now()): string[] {
  if (cantidad == null || cantidad === 0) return [];
  if (!Number.isInteger(cantidad) || (cantidad as number) < 0) throw new ErrorPedido('premios', 'Cantidad de premios no válida');
  const vigentes = premios
    .filter((r) => r.sedeId === sedeId && r.status === 'available' && (r.expiresAtMs ?? Infinity) > ahora)
    .sort((a, b) => (a.expiresAtMs ?? Infinity) - (b.expiresAtMs ?? Infinity));
  if ((cantidad as number) > vigentes.length) {
    throw new ErrorPedido('premios', vigentes.length
      ? `Solo tienes ${vigentes.length} premio${vigentes.length > 1 ? 's' : ''} disponible${vigentes.length > 1 ? 's' : ''} en esta sede`
      : 'No tienes premios disponibles en esta sede');
  }
  return vigentes.slice(0, cantidad as number).map((r) => r.id);
}

/** Valida el código contra el pedido ya armado. Devuelve el código normalizado o null. */
export function revisarCodigo(texto: unknown, itemsTexto: string, yaLoUso: boolean, ahora = Date.now()): string | null {
  if (texto == null || texto === '') return null;
  const r = validarCodigo(String(texto), { items: itemsTexto, tieneCuenta: true, yaLoUso, ahora });
  if (!r.ok) throw new ErrorPedido('codigo', r.motivo ?? 'Ese código no se puede usar');
  return r.codigo ?? null;
}
export const lineaCodigo = (codigo: string) => (CODIGOS as Record<string, { linea: string }>)[codigo].linea;

/** Saldo de la sede que se aplicará (todo el disponible, como la web). */
export function elegirSaldo(creditos: Credito[], sedeId: string, usar: unknown) {
  if (!usar) return null;
  const ids = creditos.filter((c) => c.estado === 'disponible' && c.sedeId === sedeId).map((c) => c.id);
  const monto = saldoDisponible(creditos, sedeId);
  if (!ids.length || !(monto > 0)) throw new ErrorPedido('saldo', 'No tienes saldo a favor en esta sede');
  return { ids, monto };
}

export { aplicarSaldo, limiteDeSaldo };
