import { ErrorPedido } from '../modulo_pedidos/reglas/armado';
import type { Usuario } from '../../middlewares/require-user';
import { diferenciaDe, efectivoCobrado, porCuadrar, montoValido, transferenciaPendiente } from '../../shared/cuadres';

export { transferenciaPendiente };

/**
 * Cuadres de efectivo (especificación §13.2 y §13.3). Reglas puras:
 *
 *   entrega  domiciliario propone → caja confirma lo recibido
 *            (igual → confirmado; distinto → con_diferencia, con motivo,
 *             y queda para administración → resuelto)
 *   fondo    caja propone → domiciliario confirma, o rechaza diciendo cuánto
 *            recibió → caja corrige (queda la corrección) → vuelve a propuesto
 *
 * Ningún paso reescribe un monto anterior: las correcciones se agregan.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type Doc = Record<string, any>;

const T: Record<string, string> = {
  monto: 'Escribe un monto en pesos mayor que cero',
  motivo: 'Escribe el motivo de la diferencia',
  nota: 'Escribe una nota de cómo se resolvió',
};
const monto = (v: unknown, codigo = 'monto'): number => {
  const n = montoValido(v as string | number);
  if (n == null) throw new ErrorPedido(codigo, T[codigo], 422);
  return n;
};
const textoMin = (v: unknown, min: number, codigo: string): string => {
  const t = String(v ?? '').replace(/\s+/g, ' ').trim();
  if (t.length < min) throw new ErrorPedido(codigo, T[codigo], 422);
  return t.slice(0, 300);
};
const correo = (u: Usuario) => (u.email || '').toLowerCase();
const cajaDeSede = (u: Usuario, sedeId: string) => u.esAdmin || (u.esCaja && (u.sedes?.caja ?? []).includes(sedeId));
const domiDeSede = (u: Usuario, sedeId: string) => u.esDomiciliario && (u.sedes?.domiciliario ?? []).includes(sedeId);

/** El domiciliario propone una entrega de efectivo (parcial o final). */
export function planEntrega(u: Usuario, b: Doc, pedidos: Doc[], ahora = Date.now()): Doc {
  const sedeId = String(b?.sedeId || '');
  if (!sedeId || !domiDeSede(u, sedeId)) throw new ErrorPedido('sin_permiso', 'Solo un domiciliario de la sede entrega efectivo', 403);
  const m = monto(b?.monto);
  const ids: string[] = Array.isArray(b?.pedidos) ? b.pedidos.map(String).slice(0, 50) : [];
  for (const p of pedidos) {
    if (String(p.driverEmail || '').toLowerCase() !== correo(u)) throw new ErrorPedido('pedido', 'Uno de los pedidos no es tuyo', 422);
    if (!porCuadrar(p)) throw new ErrorPedido('pedido', 'Uno de los pedidos ya está cuadrado', 409);
    if (p.sedeId && p.sedeId !== sedeId) throw new ErrorPedido('pedido', 'Uno de los pedidos es de otra sede', 422);
  }
  const esperado = pedidos.reduce((s, p) => s + efectivoCobrado(p), 0);
  return {
    tipo: 'entrega', sedeId, driverEmail: correo(u), driverName: u.nombre || correo(u), monto: m, montoRecibido: null,
    pedidos: ids, parciales: ids.length && Array.isArray(b?.parciales) ? b.parciales.map(String).slice(0, 20) : [],
    esperadoPedidos: esperado, estado: 'propuesto', diferencia: null, motivo: null, nota: b?.nota ? String(b.nota).trim().slice(0, 300) : null,
    creadoPor: correo(u), creadoAt: ahora, confirmadoPor: null, confirmadoAt: null, correcciones: [], resolucion: null,
  };
}

/** La caja confirma cuánto efectivo recibió de verdad. */
export function planConfirmarEntrega(m: Doc, u: Usuario, b: Doc, ahora = Date.now()): Doc {
  if (m.tipo !== 'entrega') throw new ErrorPedido('tipo', 'Esto no es una entrega de efectivo', 422);
  if (!cajaDeSede(u, m.sedeId)) throw new ErrorPedido('sin_permiso', 'Solo la caja de la sede confirma lo recibido', 403);
  if (m.estado !== 'propuesto') throw new ErrorPedido('estado', 'Esta entrega ya se confirmó', 409);
  const recibido = b?.montoRecibido == null || b.montoRecibido === '' ? Number(m.monto) : monto(b.montoRecibido, 'monto');
  const dif = diferenciaDe(m.monto, recibido);
  if (dif === 0) return { estado: 'confirmado', montoRecibido: recibido, diferencia: 0, confirmadoPor: correo(u), confirmadoAt: ahora };
  const motivo = textoMin(b?.motivo, 5, 'motivo');
  return { estado: 'con_diferencia', montoRecibido: recibido, diferencia: dif, motivo, confirmadoPor: correo(u), confirmadoAt: ahora };
}

/** La caja registra plata que le dio al domiciliario para dar cambio. */
export function planFondo(u: Usuario, b: Doc, ahora = Date.now()): Doc {
  const sedeId = String(b?.sedeId || '');
  if (!sedeId || !cajaDeSede(u, sedeId)) throw new ErrorPedido('sin_permiso', 'Solo la caja de la sede entrega fondos', 403);
  const driverEmail = String(b?.driverEmail || '').toLowerCase();
  if (!driverEmail.includes('@')) throw new ErrorPedido('domiciliario', 'Elige el domiciliario', 422);
  const m = monto(b?.monto);
  return {
    tipo: 'fondo', sedeId, driverEmail, driverName: String(b?.driverName || driverEmail), monto: m, montoRecibido: null,
    pedidos: [], estado: 'propuesto', diferencia: null, motivo: null, nota: b?.nota ? String(b.nota).trim().slice(0, 300) : null,
    creadoPor: correo(u), creadoAt: ahora, confirmadoPor: null, confirmadoAt: null, correcciones: [], resolucion: null,
  };
}

/** El domiciliario confirma el fondo o dice cuánto recibió de verdad. */
export function planResponderFondo(m: Doc, u: Usuario, b: Doc, ahora = Date.now()): Doc {
  if (m.tipo !== 'fondo') throw new ErrorPedido('tipo', 'Esto no es un fondo para cambio', 422);
  if (String(m.driverEmail || '').toLowerCase() !== correo(u)) throw new ErrorPedido('sin_permiso', 'Este fondo es de otro domiciliario', 403);
  if (m.estado !== 'propuesto') throw new ErrorPedido('estado', 'Este fondo ya se respondió', 409);
  if (b?.acepta) return { estado: 'confirmado', montoRecibido: Number(m.monto), diferencia: 0, confirmadoPor: correo(u), confirmadoAt: ahora };
  const recibido = monto(b?.montoRecibido);
  if (recibido === Number(m.monto)) throw new ErrorPedido('monto', 'Si recibiste ese mismo valor, confírmalo', 422);
  return { estado: 'rechazado', montoRecibido: recibido, diferencia: diferenciaDe(m.monto, recibido), confirmadoPor: null, confirmadoAt: null, respondidoAt: ahora };
}

/** La caja corrige el monto de un fondo que el domiciliario no aceptó; queda la corrección. */
export function planCorregirFondo(m: Doc, u: Usuario, b: Doc, ahora = Date.now()): Doc {
  if (m.tipo !== 'fondo') throw new ErrorPedido('tipo', 'Esto no es un fondo para cambio', 422);
  if (!cajaDeSede(u, m.sedeId)) throw new ErrorPedido('sin_permiso', 'Solo la caja de la sede corrige el fondo', 403);
  if (m.estado !== 'rechazado') throw new ErrorPedido('estado', 'Solo se corrige un fondo que el domiciliario no aceptó', 409);
  const nuevo = monto(b?.monto);
  return {
    estado: 'propuesto', monto: nuevo, montoRecibido: null, diferencia: null,
    '__union:correcciones': { anterior: Number(m.monto), monto: nuevo, por: correo(u), at: ahora, recibidoSegunDomiciliario: m.montoRecibido ?? null },
  };
}

/** Administración resuelve una entrega con diferencia (sin tocar los montos). */
export function planResolver(m: Doc, u: Usuario, b: Doc, ahora = Date.now()): Doc {
  if (!u.esAdmin) throw new ErrorPedido('sin_permiso', 'Solo administración resuelve diferencias', 403);
  if (m.estado !== 'con_diferencia') throw new ErrorPedido('estado', 'Este movimiento no tiene una diferencia pendiente', 409);
  const nota = textoMin(b?.nota, 5, 'nota');
  return { estado: 'resuelto', resolucion: { por: correo(u), at: ahora, nota } };
}
