import { ErrorPedido } from '../modulo_pedidos/reglas/armado';
import type { PedidoDoc } from '../modulo_pedidos/reglas/transiciones';
import type { Usuario } from '../../middlewares/require-user';
import { motivoNoReclamable, revisarReclamo, ESTADOS } from '../../shared/reclamos';

/**
 * Reclamos (especificación §14). Reglas puras, sin Firestore: quién puede
 * hacer qué con una ficha y cómo cambia. El servicio las aplica en transacciones.
 *
 *   recibido → en_revision → propuesta → resuelto
 *                     ↑__________|  (el cliente dice que el problema sigue)
 *   cualquiera abierto → cierre_administrativo (solo administración, con motivo)
 *
 * Reembolso (§14.2): la caja lo solicita con la propuesta; administración lo
 * autoriza (o lo rechaza) antes de que el cliente vea la propuesta; el cliente
 * elige saldo o transferencia al aceptar; la ejecución queda registrada aparte.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type Doc = Record<string, any>;
export type Lado = 'cliente' | 'caja' | 'admin';

const MAX_TEXTO = 800;
const T: Record<string, string> = {
  categoria: 'Elige qué falló: la comida o la entrega',
  motivo: 'Elige el motivo de la lista',
  descripcion: 'Cuéntanos un poco más (mínimo 10 letras)',
  largo: 'El texto es muy largo',
  sin_cuenta: 'Para reportar un problema primero vincula el pedido a tu cuenta',
  no_entregado: 'Solo se puede reportar un pedido ya entregado',
  vencido: 'Los problemas se reportan hasta 24 horas después de la entrega',
};

const texto = (v: unknown, min: number, codigo = 'texto'): string => {
  const t = String(v ?? '').replace(/\s+/g, ' ').trim();
  if (t.length < min) throw new ErrorPedido(codigo, T[codigo] || 'Escribe algo antes de enviar', 422);
  if (t.length > MAX_TEXTO) throw new ErrorPedido('largo', T.largo, 422);
  return t;
};
const finalizado = (r: Doc) => !!(ESTADOS as Record<string, { final: boolean }>)[r.estado]?.final;

/** Desde qué lado habla esta persona en este reclamo; null si no le toca. */
export function ladoDe(r: Doc, u: Usuario): Lado | null {
  if (r.clientUid && r.clientUid === u.uid) return 'cliente';
  if (u.esAdmin) return 'admin';
  if (u.esCaja && r.categoria === 'producto' && (u.sedes?.caja ?? []).includes(r.sedeId)) return 'caja';
  return null;
}
const equipo = (r: Doc, u: Usuario): Lado => {
  const lado = ladoDe(r, u);
  if (lado !== 'caja' && lado !== 'admin') throw new ErrorPedido('sin_permiso', 'Este caso lo atiende otra parte del equipo', 403);
  if (finalizado(r)) throw new ErrorPedido('cerrado', 'Este caso ya está cerrado', 409);
  return lado;
};
const nombre = (u: Usuario, lado: Lado) => u.nombre || (lado === 'admin' ? 'Administración' : lado === 'caja' ? 'Caja' : 'Cliente');

/** La ficha nueva que arma el cliente a partir de su pedido entregado. */
export function planCrear(p: PedidoDoc & Doc, orderId: string, u: Usuario, b: Doc, ahora = Date.now()): Doc {
  if (!p.clientUid || p.clientUid !== u.uid) throw new ErrorPedido('sin_permiso', 'Solo el cliente del pedido puede reportar un problema', 403);
  const no = motivoNoReclamable(p, ahora);
  if (no) throw new ErrorPedido(no, T[no], 409);
  const r = revisarReclamo((b || {}) as { categoria: string; motivo: string; descripcion: string }) as Doc;
  if (r.error) throw new ErrorPedido(r.error, T[r.error], 422);
  return {
    orderId, orderNumber: p.orderNumber ?? null, sedeId: p.sedeId || '', sedeName: p.sedeName || '',
    clientUid: u.uid, clientEmail: u.email || p.clientEmail || null, clientNombre: u.nombre || p.name || 'Cliente',
    driverEmail: p.driverEmail || null, totalPrice: Number(p.totalPrice) || 0, payment: p.payment || null,
    categoria: r.categoria, motivo: r.motivo, descripcion: r.descripcion, atiende: r.atiende,
    estado: 'recibido', propuesta: null, reembolso: null, cierre: null, resueltoAt: null, resolucion: null,
    mensajes: [{ role: 'client', name: u.nombre || p.name || 'Cliente', text: r.descripcion, ts: ahora }],
  };
}

/** El equipo toma el caso: recibido → en revisión. */
export function planRevisar(r: Doc, u: Usuario): Doc {
  const lado = equipo(r, u);
  if (r.estado !== 'recibido') throw new ErrorPedido('estado', 'El caso ya estaba en revisión', 409);
  return { estado: 'en_revision', revisadoPor: u.email || u.uid, revisadoLado: lado };
}

/**
 * El equipo propone una solución; con reembolso, la caja lo solicita y el caso
 * se queda en revisión hasta que administración lo autorice. Si lo propone
 * administración, el reembolso nace autorizado y el cliente lo ve de una.
 */
export function planProponer(r: Doc, u: Usuario, b: Doc, ahora = Date.now()): Doc {
  const lado = equipo(r, u);
  if (r.estado === 'propuesta') throw new ErrorPedido('estado', 'Ya hay una propuesta esperando al cliente', 409);
  const t = texto(b?.texto, 5);
  const monto = b?.reembolso == null || b.reembolso === '' ? 0 : Number(b.reembolso);
  if (!Number.isInteger(monto) || monto < 0) throw new ErrorPedido('reembolso', 'El reembolso debe ser un valor entero en pesos', 422);
  if (monto > Math.max(Number(r.totalPrice) || 0, 0) && (r.totalPrice || 0) > 0) throw new ErrorPedido('reembolso', 'El reembolso no puede superar el total del pedido', 422);
  const propuesta = { texto: t, por: u.email || u.uid, lado, at: ahora };
  const mensaje = { role: lado === 'admin' ? 'admin' : 'cashier', name: nombre(u, lado), text: t, ts: ahora };
  if (monto > 0) {
    const autorizado = lado === 'admin';
    return {
      estado: autorizado ? 'propuesta' : 'en_revision', propuesta,
      reembolso: {
        monto, estado: autorizado ? 'autorizado' : 'solicitado',
        solicitadoPor: u.email || u.uid, solicitadoAt: ahora,
        autorizadoPor: autorizado ? u.email || u.uid : null, autorizadoAt: autorizado ? ahora : null,
        eleccion: null, datos: null, ejecutadoAt: null,
      },
      '__union:mensajes': mensaje,
    };
  }
  return { estado: 'propuesta', propuesta, reembolso: r.reembolso?.estado === 'rechazado' ? r.reembolso : null, '__union:mensajes': mensaje };
}

/** Administración autoriza el monto (puede ajustarlo) o lo rechaza con motivo. */
export function planAutorizar(r: Doc, u: Usuario, b: Doc, ahora = Date.now()): Doc {
  if (!u.esAdmin) throw new ErrorPedido('sin_permiso', 'Solo administración autoriza reembolsos', 403);
  if (finalizado(r)) throw new ErrorPedido('cerrado', 'Este caso ya está cerrado', 409);
  if (r.reembolso?.estado !== 'solicitado') throw new ErrorPedido('estado', 'No hay un reembolso pendiente de autorizar', 409);
  if (b?.rechazar) {
    const motivo = texto(b.motivo, 5, 'motivo');
    return {
      estado: 'en_revision',
      'reembolso.estado': 'rechazado', 'reembolso.autorizadoPor': u.email || u.uid, 'reembolso.autorizadoAt': ahora, 'reembolso.motivoRechazo': motivo,
      '__union:mensajes': { role: 'admin', name: nombre(u, 'admin'), text: `Reembolso no autorizado: ${motivo}`, ts: ahora, interno: true },
    };
  }
  const monto = b?.monto == null || b.monto === '' ? Number(r.reembolso.monto) : Number(b.monto);
  if (!Number.isInteger(monto) || monto <= 0) throw new ErrorPedido('reembolso', 'El monto debe ser un entero mayor que cero', 422);
  if ((r.totalPrice || 0) > 0 && monto > Number(r.totalPrice)) throw new ErrorPedido('reembolso', 'El reembolso no puede superar el total del pedido', 422);
  return {
    estado: 'propuesta',
    'reembolso.monto': monto, 'reembolso.estado': 'autorizado', 'reembolso.autorizadoPor': u.email || u.uid, 'reembolso.autorizadoAt': ahora,
  };
}

/**
 * El cliente responde a la propuesta: la acepta (y, si hay reembolso, elige
 * saldo o transferencia) o dice que el problema sigue.
 */
export function planResponder(r: Doc, u: Usuario, b: Doc, ahora = Date.now()): Doc {
  if (ladoDe(r, u) !== 'cliente') throw new ErrorPedido('sin_permiso', 'Solo el cliente responde a la propuesta', 403);
  if (r.estado !== 'propuesta') throw new ErrorPedido('estado', 'No hay una propuesta por responder', 409);
  if (!b?.acepta) {
    // El comentario es opcional (W-7): sin texto, el hilo dice que el problema sigue.
    const crudo = String(b?.texto ?? '').trim();
    const t = crudo ? texto(crudo, 1) : 'El problema sigue.';
    return { estado: 'en_revision', '__union:mensajes': { role: 'client', name: nombre(u, 'cliente'), text: t, ts: ahora }, propuestaRechazadaAt: ahora };
  }
  const plan: Doc = { estado: 'resuelto', resolucion: 'aceptada', resueltoAt: ahora };
  if (r.reembolso?.estado === 'autorizado') {
    const eleccion = b.eleccion;
    if (eleccion !== 'saldo' && eleccion !== 'transferencia') throw new ErrorPedido('eleccion', 'Elige cómo quieres tu plata: saldo o transferencia', 422);
    if (eleccion === 'saldo' && !r.clientEmail) throw new ErrorPedido('eleccion', 'El saldo a favor necesita una cuenta con correo', 422);
    plan['reembolso.eleccion'] = eleccion;
    plan['reembolso.elegidoAt'] = ahora;
    // Transferencia sin datos (W-6, desde el reloj): queda «faltan_datos» y la
    // caja todavía no ve nada por transferir; el cliente los completa después.
    plan['reembolso.estado'] = eleccion === 'saldo' ? 'ejecutado' : b.datos == null ? 'faltan_datos' : 'elegido';
    if (eleccion === 'saldo') plan['reembolso.ejecutadoAt'] = ahora;
  }
  return plan;
}

/**
 * El cliente eligió transferencia sin dejar sus datos (W-6): los completa, o
 * cambia a saldo a favor. Los datos los valida el servicio.
 */
export function planCompletarReembolso(r: Doc, u: Usuario, b: Doc, ahora = Date.now()): Doc {
  if (ladoDe(r, u) !== 'cliente') throw new ErrorPedido('sin_permiso', 'Solo el cliente completa su devolución', 403);
  if (r.reembolso?.estado !== 'faltan_datos') throw new ErrorPedido('estado', 'Esta devolución no está esperando tus datos', 409);
  const eleccion = b?.eleccion;
  if (eleccion !== 'saldo' && eleccion !== 'transferencia') throw new ErrorPedido('eleccion', 'Elige cómo quieres tu plata: saldo o transferencia', 422);
  if (eleccion === 'saldo' && !r.clientEmail) throw new ErrorPedido('eleccion', 'El saldo a favor necesita una cuenta con correo', 422);
  if (eleccion === 'transferencia' && b?.datos == null) throw new ErrorPedido('datos', 'Escribe a dónde te transferimos', 422);
  const plan: Doc = { 'reembolso.eleccion': eleccion, 'reembolso.elegidoAt': ahora, 'reembolso.estado': eleccion === 'saldo' ? 'ejecutado' : 'elegido' };
  if (eleccion === 'saldo') plan['reembolso.ejecutadoAt'] = ahora;
  return plan;
}

/** Administración cierra sin aceptación del cliente, con motivo obligatorio. */
export function planCerrar(r: Doc, u: Usuario, b: Doc, ahora = Date.now()): Doc {
  if (!u.esAdmin) throw new ErrorPedido('sin_permiso', 'Solo administración cierra un caso sin acuerdo', 403);
  if (finalizado(r)) throw new ErrorPedido('cerrado', 'Este caso ya está cerrado', 409);
  const motivo = texto(b?.motivo, 5, 'motivo');
  return {
    estado: 'cierre_administrativo', resolucion: 'cierre_administrativo', resueltoAt: ahora,
    cierre: { motivo, por: u.email || u.uid, at: ahora },
    '__union:mensajes': { role: 'admin', name: nombre(u, 'admin'), text: `Caso cerrado por administración: ${motivo}`, ts: ahora },
  };
}

/** Mensaje en el hilo del caso (cliente o quien lo atiende), mientras siga abierto. */
export function planMensaje(r: Doc, u: Usuario, textoCrudo: unknown, ahora = Date.now()): Doc {
  const lado = ladoDe(r, u);
  if (!lado) throw new ErrorPedido('sin_permiso', 'No puedes escribir en este caso', 403);
  if (finalizado(r)) throw new ErrorPedido('cerrado', 'Este caso ya está cerrado', 409);
  const t = texto(textoCrudo, 1);
  return { '__union:mensajes': { role: lado === 'cliente' ? 'client' : lado === 'admin' ? 'admin' : 'cashier', name: nombre(u, lado), text: t, ts: ahora } };
}
