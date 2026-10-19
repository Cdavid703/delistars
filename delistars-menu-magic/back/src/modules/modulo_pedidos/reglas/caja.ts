/**
 * Acciones de caja y domiciliario que no son "una etapa" (lógica pura). Escriben
 * los MISMOS campos que hoy escribe la web (cashier/OrderDetail.jsx →
 * sendQuote, cashier/AssignDeliveryDetail.jsx → handleSend, delivery/
 * DeliveryPanel.jsx → accept, OrderDetail → markCashReceived).
 */
import { etapaDe, terminado, masAvanzada } from '../../../shared/etapas';
import { aplicarSaldo } from '../../../shared/devolucion';
import { ErrorPedido } from './armado';
import type { PedidoDoc } from './transiciones';
import type { Usuario } from '../../../middlewares/require-user';

const AHORA = '__ahora__';
const precio = (v: unknown, nombre: string) => {
  const n = Number(v);
  if (!Number.isFinite(n) || n < 0 || n > 5_000_000) throw new ErrorPedido('precio', `${nombre} no válido`);
  return Math.round(n);
};

export interface PlanCaja { campos: Record<string, unknown>; etapa: string; cambiaEtapa: boolean; sobrante: number }

function exigeCaja(u: Usuario) {
  if (!u.esCaja && !u.esAdmin) throw new ErrorPedido('sin_permiso', 'Solo la caja puede hacer esto', 403);
}
function exigeActivo(p: PedidoDoc) {
  if (terminado(p)) throw new ErrorPedido('terminado', 'El pedido ya terminó', 409);
  const { excepcion } = etapaDe(p);
  if (excepcion) throw new ErrorPedido('bloqueado', 'El pedido tiene un trámite pendiente', 409);
}

/**
 * Cotizar / aceptar (sendQuote). `saldoReal` = suma de los saldos que de verdad
 * quedaron usados en este pedido (el servidor no confía en lo que dice el pedido).
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function planCotizar(p: PedidoDoc, u: Usuario, b: any, saldoReal: number | null): PlanCaja {
  exigeCaja(u);
  exigeActivo(p);
  const actual = etapaDe(p);
  if (!['enviado', 'confirmado'].includes(actual.etapa)) throw new ErrorPedido('tarde', 'Ya no se puede cotizar este pedido', 409);
  const qp = precio(b?.quotedPrice, 'Precio de productos');
  const dp = p.deliveryMode === 'pickup' ? 0 : precio(b?.deliveryPrice ?? 0, 'Precio del domicilio');
  const total = qp + dp;
  const s = saldoReal != null ? { ...aplicarSaldo(total, saldoReal), disponible: saldoReal } : null;
  const aCobrar = s ? s.aPagar : total;
  const numero = typeof b?.orderNumber === 'string' && b.orderNumber.trim() ? b.orderNumber.trim().slice(0, 10) : null;
  const campos: Record<string, unknown> = {
    status: 'quoted',
    ...(numero ? { orderNumber: numero } : {}),
    quotedPrice: qp,
    deliveryPrice: dp,
    totalPrice: aCobrar,
    ...(aCobrar === 0 && s && !p.payment ? { payment: 'Saldo a favor', cashOnDelivery: false } : {}),
    ...(s ? { 'saldoAplicado.monto': s.disponible, 'saldoAplicado.usado': s.usado, 'saldoAplicado.sobrante': s.sobrante } : {}),
    cashierNotes: typeof b?.cashierNotes === 'string' ? b.cashierNotes.trim().slice(0, 500) : (p.cashierNotes ?? ''),
    quotedAt: AHORA,
    // Pago adelantado en efectivo: si cambió el total se recalcula el cambio; si el
    // billete ya no alcanza se borra (que el domiciliario no salga con un cambio malo).
    ...(p.pagoAdelantado && p.payment === 'Efectivo' && p.cashBillAmount != null
      ? (Number(p.cashBillAmount) >= aCobrar ? { cashChange: Number(p.cashBillAmount) - aCobrar } : { cashBillAmount: null, cashChange: null })
      : {}),
    needsRequote: false,
  };
  const etapa = masAvanzada(actual.tipo, actual.etapa, 'confirmado');
  return { campos, etapa, cambiaEtapa: etapa !== actual.etapa, sobrante: s?.sobrante ?? 0 };
}

/** Asignar domiciliario (AssignDeliveryDetail). Puede traer también la cotización. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function planAsignar(p: PedidoDoc, u: Usuario, b: any, esDomiciliario: boolean): PlanCaja {
  exigeCaja(u);
  exigeActivo(p);
  const actual = etapaDe(p);
  if (actual.tipo !== 'domicilio') throw new ErrorPedido('recoger', 'Los pedidos para recoger no llevan domiciliario', 409);
  if (['en_camino', 'llego', 'entregado'].includes(actual.etapa)) throw new ErrorPedido('tarde', 'El pedido ya salió', 409);
  const email = typeof b?.driverEmail === 'string' ? b.driverEmail.toLowerCase().trim() : '';
  if (!email || !esDomiciliario) throw new ErrorPedido('domiciliario', 'Ese domiciliario no existe');
  const campos: Record<string, unknown> = {
    status: 'assigned',
    driverEmail: email,
    driverName: typeof b?.driverName === 'string' ? b.driverName.slice(0, 80) : email,
    driverPhone: typeof b?.driverPhone === 'string' ? b.driverPhone.slice(0, 20) : null,
    driverNotes: typeof b?.driverNotes === 'string' ? b.driverNotes.trim().slice(0, 300) : '',
    assignedAt: AHORA,
  };
  // La pantalla de asignar también cotiza y define el cobro en efectivo.
  if (b?.quotedPrice != null) {
    const qp = precio(b.quotedPrice, 'Precio de productos');
    const dp = precio(b.deliveryPrice ?? 0, 'Precio del domicilio');
    const efectivo = !!b.cashOnDelivery;
    Object.assign(campos, {
      quotedPrice: qp, deliveryPrice: dp, totalPrice: b.totalPrice != null ? precio(b.totalPrice, 'Total') : qp + dp,
      cashOnDelivery: efectivo,
      payExact: efectivo ? !!b.payExact : null,
      payAmount: efectivo && !b.payExact && b.payAmount != null ? precio(b.payAmount, 'Pago') : null,
      change: efectivo && !b.payExact && b.change != null ? precio(b.change, 'Cambio') : null,
    });
  }
  if (typeof b?.orderNumber === 'string' && b.orderNumber.trim()) campos.orderNumber = b.orderNumber.trim().slice(0, 10);
  const etapa = masAvanzada(actual.tipo, actual.etapa, 'confirmado');
  return { campos, etapa, cambiaEtapa: etapa !== actual.etapa, sobrante: 0 };
}

/** El domiciliario acepta el pedido asignado (hasta la Fase 5, que asigna sin aceptar). */
export function planAceptar(p: PedidoDoc, u: Usuario): PlanCaja {
  exigeActivo(p);
  if (!u.esDomiciliario || (p.driverEmail || '').toLowerCase() !== u.email) throw new ErrorPedido('sin_permiso', 'Este pedido no está asignado a ti', 403);
  if (p.status !== 'assigned') throw new ErrorPedido('tarde', 'Este pedido ya no está por aceptar', 409);
  const actual = etapaDe(p);
  return { campos: { status: 'accepted', acceptedAt: AHORA }, etapa: actual.etapa, cambiaEtapa: false, sobrante: 0 };
}

/** La caja recibe el efectivo del domiciliario (cuadre): pending_cuadre → completed. */
export function planCuadre(p: PedidoDoc, u: Usuario): PlanCaja {
  exigeCaja(u);
  if (p.status !== 'pending_cuadre') throw new ErrorPedido('tarde', 'Este pedido no está pendiente de cuadre', 409);
  return { campos: { status: 'completed', completedAt: AHORA }, etapa: 'entregado', cambiaEtapa: false, sobrante: 0 };
}
