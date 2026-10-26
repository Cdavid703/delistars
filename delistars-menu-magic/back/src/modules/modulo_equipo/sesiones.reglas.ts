/**
 * «Mis sesiones» del equipo (especificación §6.3). Lógica pura; el servicio
 * (sesiones.service.ts) guarda en sesiones_equipo/{id}.
 *
 * Cada aparato del equipo registra su sesión: { uid, email, nombre, aparato,
 * navegador, sedeId, rol, activa, creadaAt, vistaAt, claveHash }. El id lo
 * crea el aparato; la `clave` solo la conoce ese aparato y sirve para cerrar su
 * propia sesión sin token (al cambiar de empleado ya no hay sesión de quien se va).
 * Una sesión cerrada no se reabre: ese aparato sale y, si vuelve a entrar,
 * registra una nueva. No se impone una sola sesión a la vez.
 */
import { ErrorPedido } from '../modulo_pedidos/reglas/armado';
import type { Usuario } from '../../middlewares/require-user';
import { SEDES } from '../modulo_pedidos/reglas/sedes';

// (Las sedes salen de reglas/sedes y no de require-user, que importa este módulo.)
const TODAS_LAS_SEDES = Object.keys(SEDES);

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type Sesion = Record<string, any>;

export const ROLES_SESION = ['caja', 'domiciliario', 'admin'];
/** Sin usarse en este tiempo, la sesión se muestra como «sin uso» (sigue abierta). */
export const SIN_USO_MS = 14 * 24 * 3600 * 1000;

export const idSesionValido = (id: unknown): id is string => typeof id === 'string' && /^[A-Za-z0-9]{16,40}$/.test(id);
export const esEquipo = (u: Usuario) => !u.reloj && (u.esAdmin || u.esCaja || u.esDomiciliario);

const corto = (v: unknown, max: number) => (typeof v === 'string' ? v.trim().replace(/\s+/g, ' ').slice(0, max) : '');

/** Lo que manda el aparato al registrarse o reportar que sigue en uso. */
export function validarRegistro(u: Usuario, b: Sesion) {
  if (!esEquipo(u)) throw new ErrorPedido('sin_permiso', 'Solo para el equipo', 403);
  if (!idSesionValido(b?.sesionId)) throw new ErrorPedido('sesion', 'Falta el id de la sesión de este aparato');
  return {
    id: b.sesionId as string,
    aparato: corto(b?.aparato, 40) || 'Aparato',
    navegador: corto(b?.navegador, 40),
    sedeId: TODAS_LAS_SEDES.includes(b?.sedeId) ? b.sedeId : null,
    rol: ROLES_SESION.includes(b?.rol) ? b.rol : null,
  };
}

/** ¿Puede esta persona ver o cerrar esta sesión? La suya, o cualquiera si es admin. */
export function puedeManejar(u: Usuario, s: Sesion | null): boolean {
  return !!s && (s.uid === u.uid || (u.esAdmin && !u.reloj));
}

/** Cómo se ve una sesión en la lista (sin la clave). */
export function vistaSesion(id: string, s: Sesion, ahora = Date.now()) {
  const ms = (t: unknown) => (t as { toMillis?: () => number })?.toMillis?.() ?? (typeof t === 'number' ? t : null);
  const vista = ms(s.vistaAt);
  return {
    id, email: s.email || '', nombre: s.nombre || '', aparato: s.aparato || 'Aparato', navegador: s.navegador || '',
    sedeId: s.sedeId ?? null, rol: s.rol ?? null, activa: s.activa === true,
    creadaAt: ms(s.creadaAt), vistaAt: vista,
    sinUso: s.activa === true && vista != null && ahora - vista > SIN_USO_MS,
  };
}

/** ¿Sigue valiendo esta sesión para esta cuenta? (la revisa el servidor en cada llamada). */
export const sesionVigente = (s: Sesion | null | undefined, uid: string) => !s || (s.uid === uid && s.activa === true);
