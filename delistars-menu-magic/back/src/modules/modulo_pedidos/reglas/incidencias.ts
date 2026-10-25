/**
 * Incidencias de reparto (CarPlay, CP-2 y CP-4). Lógica pura: el servicio
 * (incidencias.service.ts) lee, guarda y deja el historial.
 *
 *  - Instrucción de caja: tras «No puedo entregar», la caja le dice al
 *    domiciliario Esperar, Reintentar o Regresar. Es un aviso: no mueve la etapa.
 *    `orders/{id}.instruccionCaja = { tipo, texto, at, por, entendidoAt }`.
 *  - Entendido: el domiciliario acusa la instrucción (solo marca la hora).
 *  - Indicaciones breves: texto corto de la caja para el domiciliario
 *    (≤ 90 caracteres, se lee manejando). `indicacionesBreves`.
 */
import { etapaDe, terminado, INSTRUCCIONES_CAJA as IC } from '../../../shared/etapas';
import { ErrorPedido } from './armado';
import { rolesDe, PedidoDoc } from './transiciones';
import { revisarEditor } from './editor';
import type { Usuario } from '../../../middlewares/require-user';

export const INSTRUCCIONES_CAJA = IC as Record<string, string>;
export const MAX_INDICACIONES = 90;

const esEquipoDeCaja = (u: Usuario, p: PedidoDoc) => {
  const roles = rolesDe(u, p);
  return roles.includes('caja') || roles.includes('admin');
};

/** La caja da la instrucción. Solo con el pedido en «No se pudo entregar». */
export function planInstruccion(p: PedidoDoc, u: Usuario, tipo: unknown) {
  if (!esEquipoDeCaja(u, p)) throw new ErrorPedido('sin_permiso', 'Solo la caja de la sede da instrucciones', 403);
  if (typeof tipo !== 'string' || !INSTRUCCIONES_CAJA[tipo]) {
    throw new ErrorPedido('tipo', `Instrucción no válida. Usa una de: ${Object.keys(INSTRUCCIONES_CAJA).join(', ')}`);
  }
  const { excepcion } = etapaDe(p);
  if (excepcion !== 'no_entregado') throw new ErrorPedido('sin_incidencia', 'El domiciliario no ha reportado que no puede entregar', 409);
  revisarEditor(p, u);
  const igual = p.instruccionCaja?.tipo === tipo;
  return {
    igual,
    instruccionCaja: { tipo, texto: INSTRUCCIONES_CAJA[tipo], por: u.nombre || u.email || 'Caja', entendidoAt: null },
  };
}

/** El domiciliario del pedido dice «Entendido». Repetirlo no cambia la hora. */
export function planEntendido(p: PedidoDoc, u: Usuario) {
  if (!rolesDe(u, p).includes('domiciliario')) throw new ErrorPedido('sin_permiso', 'Solo el domiciliario del pedido', 403);
  if (!p.instruccionCaja?.tipo) throw new ErrorPedido('sin_instruccion', 'La caja no ha dado ninguna instrucción', 409);
  return { yaEstaba: !!p.instruccionCaja.entendidoAt };
}

/** Indicaciones breves de la caja. '' las borra. */
export function planIndicaciones(p: PedidoDoc, u: Usuario, texto: unknown) {
  if (!esEquipoDeCaja(u, p)) throw new ErrorPedido('sin_permiso', 'Solo la caja de la sede escribe las indicaciones', 403);
  if (terminado(p)) throw new ErrorPedido('terminado', 'El pedido ya terminó', 409);
  if (p.deliveryMode === 'pickup') throw new ErrorPedido('recoger', 'Las indicaciones son para el domiciliario: este pedido se recoge en la sede', 409);
  if (texto != null && typeof texto !== 'string') throw new ErrorPedido('texto', 'Las indicaciones deben ser texto');
  const limpio = String(texto ?? '').trim().replace(/\s+/g, ' ');
  if (limpio.length > MAX_INDICACIONES) throw new ErrorPedido('largo', `Máximo ${MAX_INDICACIONES} caracteres: se leen manejando`);
  revisarEditor(p, u);
  return { indicacionesBreves: limpio || null };
}
