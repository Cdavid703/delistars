/**
 * Valida y planea una transición de etapa (lógica pura). Las reglas salen de
 * TRANSICIONES en shared/etapas.js (copia idéntica de src/utils/etapas.js).
 * Además escribe el `status` viejo equivalente para que las pantallas actuales
 * de la web sigan funcionando mientras migran.
 */
import { etapaDe, terminado, TRANSICIONES, EXCEPCIONES as EXC, MOTIVOS_NO_ENTREGA as MNE } from '../../../shared/etapas';

const MOTIVOS_NO_ENTREGA = MNE as Record<string, string>;

const EXCEPCIONES = EXC as Record<string, { texto: string; final: boolean }>;
import { transferenciaPendiente } from '../../modulo_cuadres/reglas';
import { ErrorPedido } from './armado';
import { revisarEditor } from './editor';
import { totalConocido } from './pago';
import { aplicarSaldo, devolucionInicial } from '../../../shared/devolucion';
import type { Usuario } from '../../../middlewares/require-user';

export type Rol = 'admin' | 'caja' | 'domiciliario' | 'cliente';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type PedidoDoc = Record<string, any>;

export function rolesDe(u: Usuario, p: PedidoDoc): Rol[] {
  const roles: Rol[] = [];
  if (u.esAdmin) roles.push('admin');
  // La caja solo en las sedes que tiene autorizadas (el admin en todas).
  if (u.esCaja && (!p.sedeId || (u.sedes?.caja ?? []).includes(p.sedeId))) roles.push('caja');
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

/** Motivo de «No puedo entregar»: el código, o su texto tal cual (CP-1). null si no es ninguno. */
export function motivoNoEntrega(m: unknown): string | null {
  if (typeof m !== 'string') return null;
  const t = m.trim();
  if (MOTIVOS_NO_ENTREGA[t]) return t;
  const porTexto = Object.entries(MOTIVOS_NO_ENTREGA).find(([, v]) => v.toLowerCase() === t.toLowerCase());
  return porTexto ? porTexto[0] : null;
}

/**
 * ¿El pedido ya está donde se pide llevarlo? (CP-5). Un reintento después de
 * un corte, aunque llegue con otra Idempotency-Key, no debe fallar ni repetir
 * nada: se responde lo que hay (`sinCambios: true`).
 */
export function yaEsta(p: PedidoDoc, a: string, motivoRaw?: unknown): boolean {
  const actual = etapaDe(p);
  if (a.startsWith('excepcion:')) {
    const exc = a.slice('excepcion:'.length);
    if (actual.excepcion !== exc) return false;
    return exc !== 'no_entregado' || p.incidencia?.motivo === motivoNoEntrega(motivoRaw);
  }
  return a !== 'seguir' && actual.etapa === a && (!actual.excepcion || !!EXCEPCIONES[actual.excepcion]?.final || a === 'entregado');
}

export function planTransicion(p: PedidoDoc, a: string, u: Usuario, motivoRaw?: unknown): Plan {
  const actual = etapaDe(p);
  if (terminado(p)) throw new ErrorPedido('terminado', 'El pedido ya terminó', 409);
  const roles = rolesDe(u, p);
  if (!roles.length) throw new ErrorPedido('sin_permiso', 'No puedes cambiar este pedido', 403);

  const delTipo = TRANSICIONES.filter((t: { a: string; tipos?: string[] }) => t.a === a && (!t.tipos || t.tipos.includes(actual.tipo)));
  if (!delTipo.length) throw new ErrorPedido('transicion_invalida', `No existe la transición a ${a}`, 400);
  // `solo`: la transición existe únicamente con esa excepción puesta (ej. aprobar
  // o negar una solicitud de cancelación).
  const posibles = delTipo.filter((t: { desde: string[]; solo?: string[] }) =>
    (!t.desde.length || t.desde.includes(actual.etapa)) && (!t.solo || (!!actual.excepcion && t.solo.includes(actual.excepcion))));
  if (!posibles.length) throw new ErrorPedido('transicion_invalida', `No se puede pasar de ${actual.etapa} a ${a}`, 409);
  const t = posibles.find((x: { roles: string[] }) => x.roles.some((r) => roles.includes(r as Rol)));
  if (!t) throw new ErrorPedido('sin_permiso', 'Tu rol no puede hacer este cambio', 403);
  if (t.bloquea && actual.excepcion && t.bloquea.includes(actual.excepcion))
    throw new ErrorPedido('bloqueado', `Primero hay que resolver: ${EXCEPCIONES[actual.excepcion].texto}`, 409);
  let motivo = typeof motivoRaw === 'string' ? motivoRaw.trim().slice(0, 300) : '';
  if (t.motivo && !motivo) throw new ErrorPedido('motivo', 'Este cambio necesita un motivo');
  // «No puedo entregar» (CP-1): solo los tres motivos cerrados.
  const codigoNoEntrega = a === 'excepcion:no_entregado' ? motivoNoEntrega(motivo) : null;
  if (a === 'excepcion:no_entregado') {
    if (!codigoNoEntrega) throw new ErrorPedido('motivo', `Motivo no válido. Usa uno de: ${Object.keys(MOTIVOS_NO_ENTREGA).join(', ')}`);
    motivo = MOTIVOS_NO_ENTREGA[codigoNoEntrega];
  }

  const rol = t.roles.find((r: string) => roles.includes(r as Rol)) as Rol;
  // Un solo editor (§10.3): la caja o el admin no cambian un pedido que tiene otro.
  if (rol === 'caja' || rol === 'admin') revisarEditor(p, u);
  const extras: Record<string, unknown> = {};

  // Seguir: la caja quita la excepción temporal y el pedido sigue donde estaba.
  // Si era un cambio propuesto, queda como retirado.
  if (a === 'seguir') {
    if (actual.excepcion === 'cambio_pendiente') extras['cambioPropuesto.estado'] = 'retirado';
    return { rol, etapa: actual.etapa, excepcion: null, motivo: null, extras };
  }

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
    // CP-1: la incidencia queda aparte; una instrucción anterior de la caja ya no aplica.
    if (exc === 'no_entregado') Object.assign(extras, {
      incidencia: { motivo: codigoNoEntrega, texto: motivo, at: AHORA, por: u.email || u.uid },
      instruccionCaja: null,
    });
    if (exc === 'regreso_declarado') Object.assign(extras, { regresoDeclaradoAt: AHORA });
    // CP-3: la caja lo recibió. Para las pantallas viejas queda cerrado (status
    // cancelled); la excepción `devuelto` dice que no fue una cancelación.
    if (exc === 'devuelto') Object.assign(extras, {
      status: 'cancelled', cancelReason: `Devuelto a la sede${p.incidencia?.texto ? `: ${p.incidencia.texto}` : ''}`,
      cancelledAt: AHORA, devueltoAt: AHORA, devueltoPor: u.email || u.uid,
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
        const s = Number(p.saldoAplicado?.monto) > 0 ? aplicarSaldo(total, Number(p.saldoAplicado.monto), p.saldoAplicado?.limite) : null;
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
      // §13.1: a domicilio con pago digital, la caja tiene que haber confirmado
      // la plata antes de que el domiciliario entregue (el comprobante no basta).
      if (transferenciaPendiente(p)) throw new ErrorPedido('transferencia_pendiente', 'La caja aún no confirma la transferencia: no entregues hasta que la verifique', 409);
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
