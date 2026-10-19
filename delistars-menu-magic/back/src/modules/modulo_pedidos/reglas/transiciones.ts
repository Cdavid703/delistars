/**
 * Valida y planea una transición de etapa (lógica pura). Las reglas salen de
 * TRANSICIONES en shared/etapas.js (copia idéntica de src/utils/etapas.js).
 * Además escribe el `status` viejo equivalente para que las pantallas actuales
 * de la web sigan funcionando mientras migran.
 */
import { etapaDe, terminado, TRANSICIONES, EXCEPCIONES as EXC } from '../../../shared/etapas';

const EXCEPCIONES = EXC as Record<string, { texto: string; final: boolean }>;
import { ErrorPedido } from './armado';
import { totalConocido } from './pago';
import { aplicarSaldo, devolucionInicial } from '../../../shared/devolucion';
import type { Usuario } from '../../../middlewares/require-user';

export type Rol = 'admin' | 'caja' | 'domiciliario' | 'cliente';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type PedidoDoc = Record<string, any>;

export function rolesDe(u: Usuario, p: PedidoDoc): Rol[] {
  const roles: Rol[] = [];
  if (u.esAdmin) roles.push('admin');
  if (u.esCaja) roles.push('caja');
  if (u.esDomiciliario && u.email && (p.driverEmail || '').toLowerCase() === u.email) roles.push('domiciliario');
  if (p.clientUid && p.clientUid === u.uid) roles.push('cliente');
  return roles;
}

export interface Plan {
  rol: Rol;
  etapa: string;
  excepcion: string | null;
  motivo: string | null;
  /** Campos extra para el pedido: status viejo y marcas de tiempo (nombres de campo → 'ahora' o valor). */
  extras: Record<string, unknown>;
}

const AHORA = '__ahora__';
export const esAhora = (v: unknown) => v === AHORA;

export function planTransicion(p: PedidoDoc, a: string, u: Usuario, motivoRaw?: unknown): Plan {
  const actual = etapaDe(p);
  if (terminado(p)) throw new ErrorPedido('terminado', 'El pedido ya terminó', 409);
  const roles = rolesDe(u, p);
  if (!roles.length) throw new ErrorPedido('sin_permiso', 'No puedes cambiar este pedido', 403);

  const delTipo = TRANSICIONES.filter((t: { a: string; tipos?: string[] }) => t.a === a && (!t.tipos || t.tipos.includes(actual.tipo)));
  if (!delTipo.length) throw new ErrorPedido('transicion_invalida', `No existe la transición a ${a}`, 400);
  const posibles = delTipo.filter((t: { desde: string[] }) => !t.desde.length || t.desde.includes(actual.etapa));
  if (!posibles.length) throw new ErrorPedido('transicion_invalida', `No se puede pasar de ${actual.etapa} a ${a}`, 409);
  const t = posibles.find((x: { roles: string[] }) => x.roles.some((r) => roles.includes(r as Rol)));
  if (!t) throw new ErrorPedido('sin_permiso', 'Tu rol no puede hacer este cambio', 403);
  if (t.bloquea && actual.excepcion && t.bloquea.includes(actual.excepcion))
    throw new ErrorPedido('bloqueado', `Primero hay que resolver: ${EXCEPCIONES[actual.excepcion].texto}`, 409);
  const motivo = typeof motivoRaw === 'string' ? motivoRaw.trim().slice(0, 300) : '';
  if (t.motivo && !motivo) throw new ErrorPedido('motivo', 'Este cambio necesita un motivo');

  const rol = t.roles.find((r: string) => roles.includes(r as Rol)) as Rol;
  const extras: Record<string, unknown> = {};

  if (a.startsWith('excepcion:')) {
    const exc = a.slice('excepcion:'.length);
    // Si ya había pagado por transferencia queda la devolución por elegir (igual que la web).
    const devolucion = exc === 'rechazado' || exc === 'cancelado' ? devolucionInicial(p) : null;
    if (exc === 'rechazado') {
      const quien = u.nombre || u.email || 'Cajero';
      const ts = Date.now();
      Object.assign(extras, {
        status: 'rejected', rejectionReason: motivo,
        // `__union:<campo>` = se agrega al arreglo (el servicio lo vuelve arrayUnion).
        '__union:comments': { role: 'cashier', name: quien, text: `❌ Pedido rechazado. Motivo: ${motivo}`, ts },
        ...(devolucion ? {
          devolucion,
          '__union:clientMessages': {
            role: 'cashier', name: quien, ts: ts + 1,
            text: `Lo sentimos, tu pedido fue rechazado. Motivo: ${motivo}. ` +
              `Como ya pagaste $${devolucion.monto.toLocaleString('es-CO')} por transferencia, te los devolvemos: ` +
              'entra a tu pedido y elige si los quieres de vuelta por transferencia' +
              (p.clientEmail ? ' o como saldo a favor para tu próximo pedido.' : '.'),
          },
        } : {}),
      });
    }
    if (exc === 'cancelado') Object.assign(extras, {
      status: 'cancelled', cancelReason: motivo || 'Cancelado por el cliente', cancelledAt: AHORA,
      ...(devolucion ? { devolucion } : {}),
    });
    return { rol, etapa: actual.etapa, excepcion: exc, motivo: motivo || (exc === 'cancelado' ? 'Cancelado por el cliente' : null), extras };
  }

  switch (a) {
    case 'confirmado': {
      Object.assign(extras, { status: 'quoted', quotedAt: AHORA });
      // Si el total ya se conoce (recoger o domicilio automático), queda como cotización.
      const total = totalConocido(p);
      if (p.totalPrice == null && total != null) {
        // Saldo a favor: se descuenta y lo que sobre vuelve a la cuenta (el servicio crea ese saldo).
        const s = Number(p.saldoAplicado?.monto) > 0 ? aplicarSaldo(total, Number(p.saldoAplicado.monto)) : null;
        Object.assign(extras, {
          totalPrice: s ? s.aPagar : total,
          deliveryPrice: p.deliveryMode === 'pickup' ? 0 : Number(p.deliveryPrice) || 0,
          ...(s ? { 'saldoAplicado.usado': s.usado, 'saldoAplicado.sobrante': s.sobrante } : {}),
          ...(s && s.aPagar === 0 && !p.payment ? { payment: 'Saldo a favor', cashOnDelivery: false } : {}),
        });
      }
      break;
    }
    case 'en_preparacion': Object.assign(extras, { status: 'preparing', preparingAt: AHORA }); break;
    case 'listo':          Object.assign(extras, { listoAt: AHORA }); break;
    case 'en_camino':      Object.assign(extras, { status: 'in_transit', inTransitAt: AHORA }); break;
    case 'llego':          Object.assign(extras, { status: 'arrived', arrivedAt: AHORA }); break;
    case 'entregado': {
      const efectivo = actual.tipo === 'domicilio' && (p.cashOnDelivery || p.payment === 'Efectivo' || p.payment === 'Mixto');
      Object.assign(extras, efectivo
        ? { status: 'pending_cuadre', deliveredAt: AHORA }
        : { status: 'completed', deliveredAt: AHORA, completedAt: AHORA });
      break;
    }
  }
  // Avanzar de etapa resuelve una excepción temporal.
  const excepcion = actual.excepcion && EXCEPCIONES[actual.excepcion]?.final ? actual.excepcion : null;
  return { rol, etapa: a, excepcion, motivo: excepcion ? actual.motivo : null, extras };
}
