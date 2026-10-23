/**
 * Entrar con Microsoft desde la app (pedido de la app del 22 oct 2026).
 * Firebase no acepta en la app un token de Microsoft obtenido fuera de su
 * ventana; la app lo manda aquí, el servidor lo verifica y devuelve un token de
 * Firebase de la MISMA cuenta que esa persona usa con Microsoft en la web.
 * Lógica pura.
 *
 * Identificador: Firebase guarda como "uid" de microsoft.com el `oid` del token
 * (no el `sub`, que cambia por aplicación). En cuentas personales (Hotmail,
 * Outlook) el oid viene relleno: 00000000-0000-0000-4b2e-abcdefghijkl ↔ 4b2eabcdefghijkl.
 * (docs de Firebase: «Authenticate Using Microsoft», sección del ID token).
 */
import { ErrorPedido } from '../modulo_pedidos/reglas/armado';

/** Inquilino de las cuentas personales de Microsoft. */
export const TENANT_PERSONAL = '9188040d-6c67-4c5b-b112-36a304b66dad';
const RELLENO = /^00000000-0000-0000-/;

/** El uid que Firebase usa para microsoft.com a partir del `oid` del token. */
export function uidFirebaseDeMicrosoft(oid: unknown): string {
  if (typeof oid !== 'string' || !oid) throw new ErrorPedido('token_microsoft', 'El token de Microsoft no trae el identificador de la cuenta', 401);
  return RELLENO.test(oid) ? oid.replace(RELLENO, '').replace(/-/g, '') : oid;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type Claims = Record<string, any>;

/** Revisa lo que la firma no cubre: emisor del inquilino y nonce de la app. */
export function revisarClaims(c: Claims, nonce: unknown) {
  if (typeof c.tid !== 'string' || c.iss !== `https://login.microsoftonline.com/${c.tid}/v2.0`) {
    throw new ErrorPedido('token_microsoft', 'El token no viene de Microsoft', 401);
  }
  if (typeof nonce !== 'string' || !nonce || c.nonce !== nonce) {
    throw new ErrorPedido('token_microsoft', 'El inicio de sesión no coincide: vuelve a intentarlo', 401);
  }
}

/** Correo y nombre del token (el correo solo si parece correo). */
export function perfilDe(c: Claims): { email: string | null; nombre: string } {
  const cand = [c.email, c.preferred_username].find((x) => typeof x === 'string' && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(x));
  return { email: cand ? String(cand).toLowerCase() : null, nombre: typeof c.name === 'string' ? c.name.slice(0, 80) : '' };
}
