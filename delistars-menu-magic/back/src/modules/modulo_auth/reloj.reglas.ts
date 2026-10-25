/**
 * Sesión propia del Apple Watch (pedidos W-1 y W-2 de la sesión del reloj,
 * 24 oct 2026). Lógica pura.
 *
 * El iPhone, con su sesión real, pide POST /auth/reloj → { customToken } de la
 * MISMA cuenta. El token lleva el claim `reloj` = id de la sesión
 * (sesiones_reloj/{id}); el reloj lo canjea con signInWithCustomToken y queda
 * con su propio refresh token. Así:
 *   - cerrar sesión en el iPhone revoca solo las sesiones de ese reloj
 *     (la web y la app siguen abiertas);
 *   - el servidor y las reglas de Firestore rechazan una sesión revocada
 *     aunque el reloj no se haya enterado;
 *   - una sesión de reloj solo actúa como cliente (nunca caja, admin,
 *     domiciliario ni mercadeo) y nunca cuenta como «ingreso reciente».
 */
import { ErrorPedido } from '../modulo_pedidos/reglas/armado';

/** Sesiones activas por cuenta: al pasar el tope se cierra la más vieja. */
export const MAX_SESIONES_RELOJ = 3;

/** Id del reloj que manda el iPhone (identifierForVendor o uno propio): 8–64 letras, números, - o _. */
export function validarDispositivo(v: unknown): string {
  if (typeof v !== 'string' || !/^[A-Za-z0-9_-]{8,64}$/.test(v)) {
    throw new ErrorPedido('dispositivo', 'Falta el identificador del reloj (8 a 64 letras, números, - o _)', 422);
  }
  return v;
}

/** Nombre opcional para reconocerlo en «Mi cuenta» (ej. «Apple Watch de David»). */
export function nombreDispositivo(v: unknown): string {
  return typeof v === 'string' ? v.replace(/\s+/g, ' ').trim().slice(0, 60) : '';
}

/** Quién puede pedir una sesión de reloj: una cuenta real, desde una sesión que no sea de reloj. */
export function puedeCrearSesion(u: { anonimo: boolean; email: string; reloj?: string | null }) {
  if (u.reloj) throw new ErrorPedido('desde_reloj', 'La sesión del reloj se pide desde el iPhone', 403);
  if (u.anonimo || !u.email) throw new ErrorPedido('cuenta_obligatoria', 'Para usar el reloj entra con tu cuenta en el iPhone', 403);
}

/** Claims del custom token. `prov` conserva cómo entró la cuenta (el token de reloj dice 'custom'). */
export function claimsReloj(sesionId: string, proveedor: string): Record<string, string> {
  return { reloj: sesionId, prov: proveedor || '' };
}

/** Sesiones a cerrar al crear una nueva: las del mismo reloj y, si pasan del tope, las más viejas. */
export function sesionesACerrar(
  activas: { id: string; dispositivo: string; creadaAt: number }[],
  dispositivo: string,
  max = MAX_SESIONES_RELOJ,
): string[] {
  const mismas = activas.filter((s) => s.dispositivo === dispositivo).map((s) => s.id);
  const otras = activas.filter((s) => s.dispositivo !== dispositivo).sort((a, b) => a.creadaAt - b.creadaAt);
  const sobran = Math.max(0, otras.length + 1 - max);
  return [...mismas, ...otras.slice(0, sobran).map((s) => s.id)];
}

/** ¿La sesión del reloj sigue valiendo para esta cuenta? */
export function sesionVigente(doc: { uid?: string; activa?: boolean } | null | undefined, uid: string): boolean {
  return !!doc && doc.activa === true && doc.uid === uid;
}

/**
 * ¿El token fue revocado? Firebase guarda `tokensValidAfterTime` al revocar los
 * refresh tokens de la cuenta; un token emitido antes no vale. Cuenta
 * deshabilitada → tampoco. (Lo mismo que verifyIdToken(token, true), con caché.)
 */
export function tokenRevocado(
  usuario: { disabled?: boolean; tokensValidAfterTime?: string | null } | null,
  authTimeSeg: number,
): boolean {
  if (!usuario || usuario.disabled) return true;
  const desde = usuario.tokensValidAfterTime ? Date.parse(usuario.tokensValidAfterTime) : 0;
  return Number.isFinite(desde) && desde > 0 && authTimeSeg * 1000 < desde;
}
