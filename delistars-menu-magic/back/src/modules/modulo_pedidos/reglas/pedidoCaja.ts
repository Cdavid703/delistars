/**
 * Pedido de la caja desde el catálogo (especificación §10.1; 25 oct 2026).
 * Lógica pura.
 *
 * La caja toma pedidos presenciales, por teléfono o por WhatsApp sin exigir
 * cuenta al comprador. Elige los productos del catálogo y el servidor los
 * cobra con los precios del menú (igual que el pedido del cliente). El pedido
 * nace confirmado: la caja ya sabe el total y cómo paga.
 */
import { ErrorPedido } from './armado';
import { METODOS } from './pago';
import { SEDES, normalizarTelefono, coordsValidas } from './sedes';

export const CANALES = ['presencial', 'telefono', 'whatsapp'] as const;
export type Canal = typeof CANALES[number];

const texto = (v: unknown, max: number) => (typeof v === 'string' ? v.trim().slice(0, max) : '');

/** Caja de esa sede o administración (nunca una sesión de reloj: no trae roles). */
export function puedeCrearCaja(u: { esAdmin: boolean; sedes: { caja: string[] } }, sedeId: string) {
  if (!SEDES[sedeId]) throw new ErrorPedido('sede', 'Sede no válida');
  if (!u.esAdmin && !u.sedes.caja.includes(sedeId)) {
    throw new ErrorPedido('sin_permiso', 'Solo la caja de esta sede o administración crean pedidos aquí', 403);
  }
}

export interface DatosPedidoCaja {
  sedeId: string;
  modo: 'delivery' | 'pickup';
  nombre: string;
  telefono: string;
  phoneKey: string;
  direccion: string;
  coords: { lat: number; lng: number } | null;
  barrio: string;
  referencia: string;
  notas: string;
  canal: Canal;
  /** Valor del domicilio que escribió la caja (null = calcularlo por recorrido). */
  domicilioManual: number | null;
}

/** Datos del comprador y la entrega. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function validarPedidoCaja(b: any): DatosPedidoCaja {
  const sedeId = String(b?.sedeId || '');
  if (!SEDES[sedeId]) throw new ErrorPedido('sede', 'Sede no válida');
  const modo = b?.deliveryMode;
  if (modo !== 'delivery' && modo !== 'pickup') throw new ErrorPedido('modo', 'Elige si es domicilio o si recoge en la sede');
  const nombre = texto(b?.nombre, 80);
  if (!nombre) throw new ErrorPedido('nombre', 'Escribe el nombre del cliente');
  const phoneKey = normalizarTelefono(b?.telefono);
  if (!phoneKey) throw new ErrorPedido('telefono', 'El teléfono debe tener 10 dígitos');
  const direccion = modo === 'delivery' ? texto(b?.direccion, 200) : '';
  if (modo === 'delivery' && direccion.length < 5) throw new ErrorPedido('direccion', 'Escribe la dirección de entrega');
  const coords = modo === 'delivery' && b?.coords != null ? b.coords : null;
  if (coords && !coordsValidas(coords)) throw new ErrorPedido('coords', 'La ubicación no es válida');
  const canal: Canal = (CANALES as readonly string[]).includes(b?.canal) ? b.canal : 'presencial';
  let domicilioManual: number | null = null;
  if (modo === 'delivery' && b?.deliveryPrice != null && b.deliveryPrice !== '') {
    const n = Number(b.deliveryPrice);
    if (!Number.isFinite(n) || n < 0 || n > 200_000) throw new ErrorPedido('domicilio', 'El valor del domicilio no es válido');
    domicilioManual = Math.round(n);
  }
  if (modo === 'delivery' && domicilioManual == null && !coords) {
    throw new ErrorPedido('domicilio', 'Ubica la dirección en el buscador o escribe el valor del domicilio');
  }
  return {
    sedeId, modo, nombre, telefono: texto(b?.telefono, 20), phoneKey, direccion, coords,
    barrio: texto(b?.barrio, 80), referencia: texto(b?.referencia, 200), notas: texto(b?.notas, 300), canal, domicilioManual,
  };
}

/** Cómo paga: los mismos campos que escribe la web al pagar (payment, billete, mixto). */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function pagoCaja(b: any, total: number): Record<string, unknown> {
  const metodo = b?.metodo;
  if (!METODOS.includes(metodo)) throw new ErrorPedido('metodo', 'Elige cómo paga: Efectivo, Transferencia, Nequi o Mixto');
  const campos: Record<string, unknown> = { payment: metodo, cashOnDelivery: metodo === 'Efectivo' || metodo === 'Mixto' };
  if (metodo === 'Mixto') {
    const ef = Number(b?.mixtoEfectivo), tr = Number(b?.mixtoTransferencia);
    if (!(ef > 0) || !(tr > 0)) throw new ErrorPedido('mixto', 'Indica cuánto paga en efectivo y cuánto por transferencia');
    if (ef + tr !== total) throw new ErrorPedido('mixto', `Efectivo + transferencia debe sumar el total ($${total.toLocaleString('es-CO')})`);
    Object.assign(campos, { mixtoEfectivo: String(ef), mixtoTransferencia: String(tr) });
  }
  if ((metodo === 'Efectivo' || metodo === 'Mixto') && b?.billete != null && b.billete !== '') {
    const parte = metodo === 'Efectivo' ? total : Number(b.mixtoEfectivo);
    const billete = Number(b.billete);
    if (!(billete > 0) || billete > 1_000_000) throw new ErrorPedido('billete', 'El billete no es válido');
    if (billete < parte) throw new ErrorPedido('billete', 'El billete no alcanza para lo que paga en efectivo');
    Object.assign(campos, { cashBillAmount: billete, cashChange: billete - parte });
  }
  return campos;
}
