/**
 * Código privado de un pedido creado por la caja (Fase 4, decisión P-16).
 * Lógica pura: el servicio (codigo.service.ts) guarda y consulta.
 *
 * - 8 caracteres sin los que se confunden (0/O, 1/I/L): se muestra K7QM-4ZP9.
 *   No es el número del pedido.
 * - Sirve mientras el pedido esté en curso y 30 días después de terminado.
 * - La caja puede generar uno nuevo: el anterior deja de servir.
 * - 5 intentos fallidos desde la misma conexión la bloquean 15 minutos.
 */
import { randomInt } from 'crypto';
import { etapaDe, terminado } from '../../../shared/etapas';
import type { PedidoDoc } from './transiciones';

export const ALFABETO = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
export const LARGO = 8;
export const VIGENCIA_MS = 30 * 24 * 3600 * 1000;
export const MAX_FALLOS = 5;
export const BLOQUEO_MS = 15 * 60 * 1000;

/** Código nuevo, ya con guion (K7QM-4ZP9). `azar` se puede reemplazar en las pruebas. */
export function generarCodigo(azar: (n: number) => number = randomInt): string {
  let c = '';
  for (let i = 0; i < LARGO; i++) c += ALFABETO[azar(ALFABETO.length)];
  return `${c.slice(0, 4)}-${c.slice(4)}`;
}

/** Lo que escribió la persona → forma canónica (K7QM-4ZP9), o null si no puede ser un código. */
export function normalizarCodigo(texto: unknown): string | null {
  if (typeof texto !== 'string') return null;
  const c = texto.toUpperCase().replace(/[\s-]/g, '');
  if (c.length !== LARGO || [...c].some((x) => !ALFABETO.includes(x))) return null;
  return `${c.slice(0, 4)}-${c.slice(4)}`;
}

const ms = (v: unknown): number | null => {
  const t = v as { toMillis?: () => number } | number | null | undefined;
  if (typeof t === 'number') return t;
  return t?.toMillis?.() ?? null;
};

/** ¿Todavía sirve el código de este pedido? En curso, o terminado hace menos de 30 días. */
export function codigoVigente(p: PedidoDoc, ahora = Date.now()): boolean {
  if (!terminado(p)) return true;
  const fin = ms(p.completedAt) ?? ms(p.cancelledAt) ?? ms(p.deliveredAt) ?? ms(p.updatedAt) ?? ms(p.createdAt);
  return fin == null || ahora - fin < VIGENCIA_MS;
}

export interface Intentos { fallos: number; desde: number | null; bloqueadoHasta: number | null }

/** ¿Está bloqueada esta conexión? Devuelve los minutos que faltan (0 = no). */
export function minutosBloqueo(i: Intentos | undefined, ahora = Date.now()): number {
  if (!i?.bloqueadoHasta || i.bloqueadoHasta <= ahora) return 0;
  return Math.ceil((i.bloqueadoHasta - ahora) / 60000);
}

/** Suma un intento fallido. Los fallos viejos (más de 15 min) se olvidan. */
export function sumarFallo(i: Intentos | undefined, ahora = Date.now()): Intentos {
  const vigente = i && i.desde != null && ahora - i.desde < BLOQUEO_MS && !(i.bloqueadoHasta && i.bloqueadoHasta <= ahora);
  const fallos = (vigente ? i!.fallos : 0) + 1;
  return {
    fallos,
    desde: vigente ? i!.desde : ahora,
    bloqueadoHasta: fallos >= MAX_FALLOS ? ahora + BLOQUEO_MS : null,
  };
}

/**
 * Lo que ve quien tiene el código: lo necesario para seguir el pedido, sin
 * datos de la caja ni del domiciliario más allá de su nombre.
 */
export function vistaPublica(id: string, p: PedidoDoc) {
  const e = etapaDe(p);
  return {
    id,
    orderNumber: p.orderNumber ?? null,
    sedeId: p.sedeId ?? null,
    sedeName: p.sedeName ?? null,
    deliveryMode: p.deliveryMode === 'pickup' ? 'pickup' : 'delivery',
    etapa: e.etapa,
    excepcion: e.excepcion,
    excepcionMotivo: e.motivo ?? null,
    status: p.status ?? null,
    nombre: typeof p.name === 'string' ? p.name.split(' ')[0] : '',
    items: p.items ?? '',
    direccion: p.deliveryMode === 'pickup' ? '' : (p.fullAddress ?? ''),
    productos: p.quotedPrice ?? null,
    domicilio: p.deliveryPrice ?? null,
    total: p.totalPrice ?? null,
    pago: p.payment ?? '',
    domiciliario: p.driverName ?? null,
    creadoAt: ms(p.createdAt),
    vinculado: !!p.clientUid,
  };
}
