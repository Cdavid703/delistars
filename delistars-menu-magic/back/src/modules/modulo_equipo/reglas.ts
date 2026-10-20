/**
 * Solicitud de acceso al equipo (lógica pura). Especificación §6: quien quiere
 * trabajar en caja o reparto se registra con su cuenta y pide acceso; un
 * administrador aprueba o rechaza. Al aprobar se escribe el mismo documento que
 * crea Panel → Usuarios (roles_cashiers / roles_drivers) más las sedes.
 */
import { ErrorPedido } from '../modulo_pedidos/reglas/armado';
import { TODAS_LAS_SEDES, Usuario } from '../../middlewares/require-user';

export const ROLES_SOLICITABLES = { caja: 'roles_cashiers', domiciliario: 'roles_drivers' } as const;
export type RolSolicitable = keyof typeof ROLES_SOLICITABLES;

export function rolesDeUsuario(u: Usuario): string[] {
  return [
    ...(u.esAdmin ? ['admin'] : []),
    ...(u.esCaja ? ['caja'] : []),
    ...(u.esDomiciliario ? ['domiciliario'] : []),
    ...(u.esMercadeo ? ['mercadeo'] : []),
    'cliente',
  ];
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function validarSolicitud(u: Usuario, b: any) {
  if (u.anonimo || !u.email) throw new ErrorPedido('cuenta_obligatoria', 'Para pedir acceso necesitas entrar con tu cuenta', 403);
  const nombre = typeof b?.nombre === 'string' ? b.nombre.trim().slice(0, 80) : '';
  if (nombre.length < 3) throw new ErrorPedido('nombre', 'Escribe tu nombre completo');
  const telefono = String(b?.telefono || '').replace(/\D/g, '');
  if (telefono.length < 10) throw new ErrorPedido('telefono', 'El teléfono debe tener 10 dígitos');
  const rol = b?.rol as RolSolicitable;
  if (!(rol in ROLES_SOLICITABLES)) throw new ErrorPedido('rol', 'El rol debe ser caja o domiciliario');
  if (!TODAS_LAS_SEDES.includes(b?.sedeId)) throw new ErrorPedido('sede', 'Sede no válida');
  const yaTiene = rol === 'caja' ? u.sedes.caja.includes(b.sedeId) : u.sedes.domiciliario.includes(b.sedeId);
  if (yaTiene) throw new ErrorPedido('ya_tiene_rol', 'Ya tienes ese acceso en esa sede', 409);
  return { nombre, telefono: telefono.slice(-10), rol, sedeId: b.sedeId as string };
}

/** Sedes con que queda el rol al aprobar: las que ya tenía + las aprobadas. */
export function sedesAlAprobar(existentes: string[] | null, aprobadas: string[]): string[] {
  const base = existentes && existentes.length ? existentes : [];
  return TODAS_LAS_SEDES.filter((s) => base.includes(s) || aprobadas.includes(s));
}
