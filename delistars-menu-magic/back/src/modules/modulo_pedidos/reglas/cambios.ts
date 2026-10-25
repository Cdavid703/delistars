/**
 * Cambios al pedido (Fase 7; especificación §9.2). Lógica pura.
 *
 * - La caja propone un cambio (productos, cantidades, total) solo antes de
 *   En preparación. El pedido queda con la excepción «cambio pendiente» y la
 *   propuesta guardada aparte: el original no se toca hasta que el cliente acepte.
 * - El cliente acepta (se aplica) o rechaza (queda el original).
 * - Con pago adelantado o saldo a favor aplicado, el total no puede cambiar:
 *   no se cobra ni se devuelve nada a escondidas (§9.2, pendiente de diseño).
 * - El cliente puede agregar algo mientras el pedido esté en Enviado; después,
 *   le escribe a la sede y ella propone el cambio.
 */
import { etapaDe } from '../../../shared/etapas';
import { ErrorPedido } from './armado';
import { lineaPremio, lineaCodigo } from './beneficios';
import type { PedidoDoc } from './transiciones';
import { coordsValidas } from './sedes';

const AHORA = '__ahora__';
const texto = (v: unknown, max: number) => (typeof v === 'string' ? v.trim().slice(0, max) : '');
const precio = (v: unknown, nombre: string) => {
  const n = Number(v);
  if (!Number.isFinite(n) || n < 0 || n > 5_000_000) throw new ErrorPedido('precio', `${nombre} no válido`);
  return Math.round(n);
};

/** Dirección nueva propuesta por la caja (W-5), ya medida por el servidor. */
export interface DireccionPropuesta {
  fullAddress: string;
  barrio: string;
  reference: string;
  addrLat: number;
  addrLng: number;
  deliveryKm: number;
  /** Tarifa por recorrido desde la sede del pedido. */
  precio: number;
}

export interface Propuesta {
  items: string;
  quotedPrice: number;
  deliveryPrice: number;
  totalPrice: number;
  motivo: string;
  direccion?: Omit<DireccionPropuesta, 'precio'>;
}

/**
 * Lo que manda la caja para cambiar la dirección (W-5): { texto, coords, barrio?, referencia? }.
 * Solo domicilios, y con la ubicación del buscador: sin coordenadas no se puede
 * verificar la cobertura ni calcular la tarifa.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function validarDireccionPropuesta(p: PedidoDoc, d: any) {
  if (p.deliveryMode === 'pickup') throw new ErrorPedido('recoge', 'Este pedido es para recoger en la sede: no tiene dirección', 409);
  const fullAddress = texto(d?.texto, 200);
  if (fullAddress.length < 5) throw new ErrorPedido('direccion', 'Escribe la dirección nueva');
  if (!coordsValidas(d?.coords)) throw new ErrorPedido('coords', 'Elige la dirección en el buscador para ubicarla en el mapa');
  return { fullAddress, barrio: texto(d?.barrio, 80), reference: texto(d?.referencia, 200), coords: { lat: Number(d.coords.lat), lng: Number(d.coords.lng) } };
}

/** Lo que la caja propone. El total nuevo se calcula aquí, nunca lo manda la pantalla. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function validarPropuesta(p: PedidoDoc, b: any, dir?: DireccionPropuesta): Propuesta {
  const { excepcion } = etapaDe(p);
  if (excepcion) throw new ErrorPedido('bloqueado', 'El pedido tiene un trámite pendiente; resuélvelo primero', 409);
  // Con dirección nueva, los productos y su precio quedan como están si la caja no los toca.
  const items = texto(b?.items ?? (dir ? p.items : ''), 3000);
  if (items.length < 3) throw new ErrorPedido('items', 'Escribe los productos del pedido');
  const motivo = texto(b?.motivo, 300);
  if (motivo.length < 3) throw new ErrorPedido('motivo', 'Cuéntale al cliente por qué cambia el pedido');
  const pickup = p.deliveryMode === 'pickup';
  const quotedPrice = precio(b?.quotedPrice ?? (dir ? p.quotedPrice : undefined), 'Precio de productos');
  // La tarifa de una dirección nueva la calcula el servidor por recorrido; no la escribe la caja.
  const deliveryPrice = pickup ? 0 : dir ? dir.precio : (b?.deliveryPrice != null ? precio(b.deliveryPrice, 'Precio del domicilio') : Number(p.deliveryPrice) || 0);
  const totalPrice = quotedPrice + deliveryPrice;

  const totalActual = (Number(p.quotedPrice) || 0) + (pickup ? 0 : Number(p.deliveryPrice) || 0);
  const cambiaTotal = totalPrice !== totalActual;
  const cambiaDireccion = !!dir && (dir.fullAddress !== String(p.fullAddress || '').trim() || dir.addrLat !== p.addrLat || dir.addrLng !== p.addrLng);
  if (items === String(p.items || '').trim() && !cambiaTotal && !cambiaDireccion) throw new ErrorPedido('sin_cambios', 'No cambiaste nada del pedido');
  if (cambiaTotal && p.pagoAdelantado) {
    throw new ErrorPedido('pagado', 'Este pedido ya está pagado: el total no puede cambiar. Si no lo puedes preparar igual, cancélalo y el cliente pide de nuevo', 409);
  }
  if (cambiaTotal && Number(p.saldoAplicado?.monto) > 0) {
    throw new ErrorPedido('saldo', 'Este pedido usa saldo a favor: el total no puede cambiar. Si no lo puedes preparar igual, cancélalo y el cliente pide de nuevo', 409);
  }
  // Lo gratis del pedido (premio, código) no puede desaparecer con el cambio.
  const n = Number(p.loyaltyRedemption?.count) || 0;
  if (n > 0 && !items.includes(lineaPremio(n))) throw new ErrorPedido('premio', 'El pedido lleva un premio de fidelización: deja su línea tal cual');
  if (p.codigoPromo && !items.includes(lineaCodigo(String(p.codigoPromo)))) throw new ErrorPedido('codigo', 'El pedido lleva un código promocional: deja su línea tal cual');
  if (!dir) return { items, quotedPrice, deliveryPrice, totalPrice, motivo };
  const { precio: _precio, ...direccion } = dir;
  return { items, quotedPrice, deliveryPrice, totalPrice, motivo, direccion };
}

/** Cómo estaba la dirección antes de la propuesta (para mostrar «antes → ahora»). */
export function direccionAnterior(p: PedidoDoc) {
  return {
    fullAddress: p.fullAddress ?? '', barrio: p.barrio ?? '', reference: p.reference ?? '',
    addrLat: p.addrLat ?? null, addrLng: p.addrLng ?? null, deliveryKm: p.deliveryKm ?? null,
  };
}

/** Id corto de una propuesta: el cliente lo devuelve al responder (W-3). */
export const idPropuesta = (azar: () => number = Math.random) =>
  `prop_${Date.now().toString(36)}${Math.floor(azar() * 36 ** 6).toString(36).padStart(6, '0')}`;

/**
 * ¿La respuesta del cliente es a la propuesta que está pendiente? (W-3)
 * `propuestaId` y `version` son opcionales (la web vieja no los manda); si
 * llegan y no coinciden, la caja retiró esa propuesta o hizo otra: 409.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function revisarRespuesta(p: PedidoDoc, b: any) {
  const { excepcion } = etapaDe(p);
  const c = p.cambioPropuesto;
  if (excepcion !== 'cambio_pendiente' || c?.estado !== 'pendiente') {
    throw new ErrorPedido('sin_propuesta', 'No hay un cambio pendiente por responder', 409);
  }
  if (b?.propuestaId != null && b.propuestaId !== c.id) {
    throw new ErrorPedido('propuesta_reemplazada', 'La sede cambió la propuesta. Revisa la nueva antes de responder', 409);
  }
  const versionActual = Number(p.version) || 0;
  if (b?.version != null && Number(b.version) !== versionActual) {
    throw new ErrorPedido('version', `El pedido cambió mientras tanto (versión ${versionActual}). Revísalo de nuevo`, 409);
  }
}

/** Campos del pedido cuando el cliente acepta: queda con lo propuesto. */
export function camposAlAceptar(p: PedidoDoc, c: Propuesta): Record<string, unknown> {
  const campos: Record<string, unknown> = {
    items: c.items,
    quotedPrice: c.quotedPrice,
    needsRequote: false,
    'cambioPropuesto.estado': 'aceptado',
    'cambioPropuesto.respondidoAt': AHORA,
  };
  if (p.deliveryMode !== 'pickup' && (p.deliveryPrice != null || c.deliveryPrice > 0 || c.direccion)) campos.deliveryPrice = c.deliveryPrice;
  // Dirección nueva (W-5): el pedido queda con ella y con su tarifa por recorrido.
  if (c.direccion) {
    Object.assign(campos, {
      fullAddress: c.direccion.fullAddress, barrio: c.direccion.barrio, reference: c.direccion.reference,
      addrLat: c.direccion.addrLat, addrLng: c.direccion.addrLng, deliveryKm: c.direccion.deliveryKm,
      deliveryPriceAuto: true, deliveryPriceReview: false,
    });
  }
  // Ya cotizado: el total a cobrar es el nuevo (sin saldo ni pago adelantado: esos no cambian de total).
  if (p.totalPrice != null) {
    campos.totalPrice = c.totalPrice;
    // El billete que había elegido puede no alcanzar: se borra y lo vuelve a elegir.
    if (p.cashBillAmount != null) {
      if (Number(p.cashBillAmount) >= c.totalPrice) campos.cashChange = Number(p.cashBillAmount) - c.totalPrice;
      else { campos.cashBillAmount = null; campos.cashChange = null; }
    }
  }
  return campos;
}

/** Campos cuando el cliente rechaza: el original sigue, la propuesta queda registrada. */
export const camposAlRechazar = (): Record<string, unknown> => ({
  'cambioPropuesto.estado': 'rechazado',
  'cambioPropuesto.respondidoAt': AHORA,
});

/** Texto que el cliente agrega a su pedido en Enviado (la caja lo cotiza con eso). */
export function validarAgregado(p: PedidoDoc, v: unknown): string {
  const { etapa, excepcion } = etapaDe(p);
  if (etapa !== 'enviado') throw new ErrorPedido('tarde', 'La sede ya confirmó tu pedido: escríbele por el chat y ella te propone el cambio', 409);
  if (excepcion) throw new ErrorPedido('bloqueado', 'Tu pedido tiene un trámite pendiente', 409);
  if (p.pagoAdelantado) throw new ErrorPedido('pagado', 'Este pedido ya está pagado: para agregar algo escríbele a la sede por el chat', 409);
  const t = texto(v, 250);
  if (t.length < 3) throw new ErrorPedido('texto', 'Escribe qué quieres agregar');
  return t;
}

export function camposAlAgregar(p: PedidoDoc, t: string, nombre: string): Record<string, unknown> {
  return {
    items: `${String(p.items || '').trim()}\n+ ${t}`.trim(),
    needsRequote: true,
    '__union:clientMessages': { role: 'client', name: nombre || 'Cliente', text: `➕ Quiero agregar a mi pedido: ${t}`, ts: Date.now() },
  };
}
