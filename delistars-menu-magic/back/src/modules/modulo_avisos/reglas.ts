/**
 * Aparatos que reciben avisos push (Fase 6, especificación §18). Lógica pura.
 * Cada tipo de token se guarda con su proveedor: los de la web (FCM del
 * navegador), los de la app por Expo y, cuando haya cuenta de Apple, los
 * nativos. No son equivalentes: el scheduler envía cada uno por su camino.
 */
import { createHash } from 'crypto';
import { ErrorPedido } from '../modulo_pedidos/reglas/armado';

export const PROVEEDORES = ['expo', 'fcm'] as const;
export const PLATAFORMAS = ['android', 'ios', 'web'] as const;
export type Proveedor = typeof PROVEEDORES[number];

export interface Dispositivo { token: string; proveedor: Proveedor; plataforma: typeof PLATAFORMAS[number] }

/** Valida lo que manda la app y devuelve el aparato limpio. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function validarDispositivo(b: any): Dispositivo {
  const token = typeof b?.token === 'string' ? b.token.trim() : '';
  const proveedor = b?.proveedor;
  const plataforma = b?.plataforma;
  if (!PROVEEDORES.includes(proveedor)) throw new ErrorPedido('proveedor', 'proveedor debe ser expo o fcm');
  if (!PLATAFORMAS.includes(plataforma)) throw new ErrorPedido('plataforma', 'plataforma debe ser android, ios o web');
  if (token.length < 20 || token.length > 4096) throw new ErrorPedido('token', 'Token de aviso no válido');
  if (proveedor === 'expo' && !/^(Exponent|Expo)PushToken\[[^\]]+\]$/.test(token)) {
    throw new ErrorPedido('token', 'El token de Expo no tiene el formato esperado (ExponentPushToken[...])');
  }
  return { token, proveedor, plataforma };
}

/** Id del documento del token (no se guarda el token como id). */
export const idDeToken = (token: string) => createHash('sha256').update(token).digest('hex').slice(0, 40);
