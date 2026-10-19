/**
 * Pago del pedido (lógica pura). Escribe los MISMOS campos que la web
 * (src/utils/pagoAdelantado.js → camposPago y ClientPanel → confirmPaymentMethod /
 * sendBill / handleUploadReceipt) para que caja, domiciliario y cuadre no noten
 * diferencia.
 *
 * Dos momentos:
 *   · En `enviado`, si el total ya se conoce (recoger, o domicilio con tarifa
 *     automática): pago adelantado, como el checkout de la web.
 *   · Después de que la caja confirma/cotiza (hay totalPrice): pago tras cotización.
 * Se puede llamar otra vez para corregir el billete o agregar el comprobante.
 */
import { etapaDe, terminado } from '../../../shared/etapas';
import { ErrorPedido } from './armado';
import type { PedidoDoc } from './transiciones';

export const METODOS = ['Efectivo', 'Transferencia', 'Nequi', 'Mixto'];
export const llevaComprobante = (m: string) => ['Transferencia', 'Nequi', 'Mixto'].includes(m);

/** Total conocido antes de que la caja cotice: productos + domicilio automático (o recoger). */
export function totalConocido(p: PedidoDoc): number | null {
  if (p.totalPrice != null) return Number(p.totalPrice);
  const productos = Number(p.quotedPrice);
  if (!(productos > 0)) return null;
  if (p.deliveryMode === 'pickup') return productos;
  if (p.deliveryPriceAuto && p.deliveryPrice != null) return productos + Number(p.deliveryPrice);
  return null;
}

/** El comprobante debe estar en receipts/{id}/ del bucket del proyecto. */
export function comprobanteValido(url: unknown, id: string, bucket: string): url is string {
  if (typeof url !== 'string' || !bucket) return false;
  const prefijo = `https://firebasestorage.googleapis.com/v0/b/${bucket}/o/receipts%2F${encodeURIComponent(id)}%2F`;
  return url.startsWith(prefijo) && url.length < 2000;
}

export interface PlanPago {
  campos: Record<string, unknown>;
  total: number;
  adelantado: boolean;
  faltaComprobante: boolean;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function planPago(p: PedidoDoc, id: string, uid: string, b: any, bucket: string): PlanPago {
  if (!p.clientUid || p.clientUid !== uid) throw new ErrorPedido('sin_permiso', 'Solo el cliente del pedido elige el pago', 403);
  if (terminado(p)) throw new ErrorPedido('terminado', 'El pedido ya terminó', 409);
  const { etapa, excepcion } = etapaDe(p);
  if (excepcion) throw new ErrorPedido('bloqueado', 'El pedido tiene un trámite pendiente; escríbele a la sede', 409);
  if (['llego', 'entregado'].includes(etapa)) throw new ErrorPedido('tarde', 'Ya no se puede cambiar el pago', 409);
  const adelantado = etapa === 'enviado';
  const total = adelantado ? totalConocido(p) : (p.totalPrice != null ? Number(p.totalPrice) : null);
  if (total == null) {
    throw new ErrorPedido('sin_cotizar', adelantado
      ? 'La sede todavía no ha cotizado el domicilio; podrás pagar cuando lo confirme'
      : 'La sede todavía no ha cotizado tu pedido', 409);
  }

  // El saldo a favor (Fase 3, siguiente paso) puede dejar el total en 0.
  if (total === 0) {
    return { campos: { payment: 'Saldo a favor', cashOnDelivery: false, ...(adelantado ? { pagoAdelantado: true, totalPrice: 0 } : {}) }, total, adelantado, faltaComprobante: false };
  }

  const metodo = b?.metodo;
  if (!METODOS.includes(metodo)) throw new ErrorPedido('metodo', 'Elige cómo vas a pagar: Efectivo, Transferencia, Nequi o Mixto');
  const campos: Record<string, unknown> = {
    payment: metodo,
    cashOnDelivery: metodo === 'Efectivo' || metodo === 'Mixto',
    ...(adelantado ? {
      pagoAdelantado: true,
      totalPrice: total,
      deliveryPrice: p.deliveryMode === 'pickup' ? 0 : Number(p.deliveryPrice) || 0,
    } : {}),
  };

  if (metodo === 'Efectivo' || metodo === 'Mixto') {
    const parteEfectivo = metodo === 'Efectivo' ? total : Number(b?.mixtoEfectivo);
    if (metodo === 'Mixto') {
      const ef = Number(b?.mixtoEfectivo), tr = Number(b?.mixtoTransferencia);
      if (!(ef > 0) || !(tr > 0)) throw new ErrorPedido('mixto', 'Indica cuánto pagas en efectivo y cuánto por transferencia');
      if (ef + tr !== total) throw new ErrorPedido('mixto', `Efectivo + transferencia debe sumar el total ($${total.toLocaleString('es-CO')})`);
      Object.assign(campos, { mixtoEfectivo: String(ef), mixtoTransferencia: String(tr) });
    }
    // Con qué billete paga (para el cambio). `billete` = parteEfectivo significa "exacto".
    if (b?.billete != null) {
      const billete = Number(b.billete);
      if (!(billete > 0) || billete > 1_000_000) throw new ErrorPedido('billete', 'El billete no es válido');
      if (billete < parteEfectivo) throw new ErrorPedido('billete', 'El billete no alcanza para lo que pagas en efectivo');
      Object.assign(campos, { cashBillAmount: billete, cashChange: billete - parteEfectivo, billSentAt: '__ahora__' });
    } else if (adelantado) {
      throw new ErrorPedido('billete', 'Dinos con qué billete vas a pagar (o el valor exacto)');
    }
  } else {
    // Al pasar a transferencia se limpia un billete anterior.
    Object.assign(campos, { cashBillAmount: null, cashChange: null });
  }

  let faltaComprobante = false;
  if (llevaComprobante(metodo)) {
    if (b?.comprobante?.url != null) {
      if (!comprobanteValido(b.comprobante.url, id, bucket)) {
        throw new ErrorPedido('comprobante', 'El comprobante debe subirse a la carpeta del pedido (receipts/<id>/)');
      }
      Object.assign(campos, {
        transferReceiptUrl: b.comprobante.url,
        transferReceiptName: typeof b.comprobante.nombre === 'string' ? b.comprobante.nombre.slice(0, 120) : 'comprobante',
      });
    } else if (!p.transferReceiptUrl) {
      faltaComprobante = true;
    }
  }
  return { campos, total, adelantado, faltaComprobante };
}
