import { describe, it, expect } from 'vitest';
import { planEntrega, planConfirmarEntrega, planFondo, planResponderFondo, planCorregirFondo, planResolver, transferenciaPendiente } from './reglas';
import { ErrorPedido } from '../modulo_pedidos/reglas/armado';

const falla = (fn: () => unknown, codigo: string, status?: number) => {
  try { fn(); } catch (e) {
    expect((e as ErrorPedido).codigo).toBe(codigo);
    if (status) expect((e as ErrorPedido).status).toBe(status);
    return;
  }
  throw new Error(`esperaba error ${codigo}`);
};
const usuario = (extra: Record<string, unknown>) => ({
  uid: 'u', email: 'x@x.co', anonimo: false, nombre: 'X', esAdmin: false, esCaja: false, esDomiciliario: false, esMercadeo: false,
  sedes: { caja: [], domiciliario: [] }, ...extra,
}) as any;
const domi = usuario({ uid: 'd', email: 'Domi@x.co', nombre: 'Juan', esDomiciliario: true, sedes: { caja: [], domiciliario: ['santa_lucia'] } });
const otroDomi = usuario({ uid: 'd2', email: 'otro@x.co', esDomiciliario: true, sedes: { caja: [], domiciliario: ['santa_lucia'] } });
const caja = usuario({ uid: 'c', email: 'caja@x.co', nombre: 'Vale', esCaja: true, sedes: { caja: ['santa_lucia'], domiciliario: [] } });
const cajaOtra = usuario({ uid: 'c2', email: 'c2@x.co', esCaja: true, sedes: { caja: ['santa_teresita'], domiciliario: [] } });
const admin = usuario({ uid: 'a', email: 'admin@x.co', esAdmin: true });
const T = 1_700_000_000_000;
const pedido = (extra = {}) => ({ status: 'pending_cuadre', payment: 'Efectivo', totalPrice: 21000, driverEmail: 'domi@x.co', sedeId: 'santa_lucia', ...extra });

describe('cuadres de efectivo (§13.2, §13.3)', () => {
  it('el domiciliario propone una entrega con sus pedidos por cuadrar', () => {
    const e = planEntrega(domi, { sedeId: 'santa_lucia', monto: 42000, pedidos: ['a', 'b'] }, [pedido(), pedido()], T);
    expect(e).toMatchObject({ tipo: 'entrega', estado: 'propuesto', monto: 42000, esperadoPedidos: 42000, driverEmail: 'domi@x.co', pedidos: ['a', 'b'] });
    falla(() => planEntrega(caja, { sedeId: 'santa_lucia', monto: 1000 }, [], T), 'sin_permiso', 403);
    falla(() => planEntrega(domi, { sedeId: 'santa_lucia', monto: 0 }, [], T), 'monto', 422);
    falla(() => planEntrega(domi, { sedeId: 'santa_lucia', monto: 1000 }, [pedido({ driverEmail: 'otro@x.co' })], T), 'pedido', 422);
    falla(() => planEntrega(domi, { sedeId: 'santa_lucia', monto: 1000 }, [pedido({ status: 'completed' })], T), 'pedido', 409);
  });

  it('la caja confirma: igual cuadra, distinto queda con diferencia y motivo', () => {
    const e = planEntrega(domi, { sedeId: 'santa_lucia', monto: 42000 }, [], T);
    expect(planConfirmarEntrega(e, caja, {}, T)).toMatchObject({ estado: 'confirmado', montoRecibido: 42000, diferencia: 0, confirmadoPor: 'caja@x.co' });
    falla(() => planConfirmarEntrega(e, caja, { montoRecibido: 40000 }, T), 'motivo', 422);
    expect(planConfirmarEntrega(e, caja, { montoRecibido: 40000, motivo: 'Faltó un billete de 2.000' }, T))
      .toMatchObject({ estado: 'con_diferencia', montoRecibido: 40000, diferencia: -2000 });
    falla(() => planConfirmarEntrega(e, cajaOtra, {}, T), 'sin_permiso', 403);
    falla(() => planConfirmarEntrega(e, domi, {}, T), 'sin_permiso', 403);
    falla(() => planConfirmarEntrega({ ...e, estado: 'confirmado' }, caja, {}, T), 'estado', 409);
  });

  it('fondo para cambio: la caja lo da, el domiciliario confirma o dice cuánto recibió, la caja corrige', () => {
    const f = planFondo(caja, { sedeId: 'santa_lucia', driverEmail: 'DOMI@x.co', driverName: 'Juan', monto: 50000 }, T);
    expect(f).toMatchObject({ tipo: 'fondo', estado: 'propuesto', driverEmail: 'domi@x.co', monto: 50000 });
    falla(() => planFondo(domi, { sedeId: 'santa_lucia', driverEmail: 'domi@x.co', monto: 50000 }, T), 'sin_permiso', 403);
    falla(() => planFondo(caja, { sedeId: 'santa_lucia', driverEmail: '', monto: 50000 }, T), 'domiciliario', 422);
    expect(planResponderFondo(f, domi, { acepta: true }, T)).toMatchObject({ estado: 'confirmado', montoRecibido: 50000 });
    falla(() => planResponderFondo(f, otroDomi, { acepta: true }, T), 'sin_permiso', 403);
    falla(() => planResponderFondo(f, domi, { acepta: false, montoRecibido: 50000 }, T), 'monto', 422);
    const r = planResponderFondo(f, domi, { acepta: false, montoRecibido: 40000 }, T);
    expect(r).toMatchObject({ estado: 'rechazado', montoRecibido: 40000, diferencia: -10000 });
    falla(() => planCorregirFondo(f, caja, { monto: 40000 }, T), 'estado', 409);
    const c = planCorregirFondo({ ...f, ...r }, caja, { monto: 40000 }, T);
    expect(c).toMatchObject({ estado: 'propuesto', monto: 40000, montoRecibido: null });
    expect(c['__union:correcciones']).toMatchObject({ anterior: 50000, monto: 40000, recibidoSegunDomiciliario: 40000 });
  });

  it('solo administración resuelve diferencias, con nota', () => {
    const e = { ...planEntrega(domi, { sedeId: 'santa_lucia', monto: 42000 }, [], T), estado: 'con_diferencia', diferencia: -2000 };
    falla(() => planResolver(e, caja, { nota: 'Se descontó del pago' }, T), 'sin_permiso', 403);
    falla(() => planResolver(e, admin, { nota: 'ok' }, T), 'nota', 422);
    expect(planResolver(e, admin, { nota: 'Se descontó de los domicilios del día' }, T)).toMatchObject({ estado: 'resuelto', resolucion: { por: 'admin@x.co' } });
    falla(() => planResolver({ ...e, estado: 'confirmado' }, admin, { nota: 'nada que ver' }, T), 'estado', 409);
  });

  it('una entrega a domicilio pagada en digital no se marca entregada sin verificar la plata (§13.1)', () => {
    expect(transferenciaPendiente({ payment: 'Transferencia', deliveryMode: 'delivery' })).toBe(true);
    expect(transferenciaPendiente({ payment: 'Nequi', deliveryMode: 'delivery', transferValidated: true })).toBe(false);
    expect(transferenciaPendiente({ payment: 'Mixto', deliveryMode: 'delivery' })).toBe(true);
    expect(transferenciaPendiente({ payment: 'Efectivo', deliveryMode: 'delivery' })).toBe(false);
    expect(transferenciaPendiente({ payment: 'Transferencia', deliveryMode: 'pickup' })).toBe(false);
    expect(transferenciaPendiente({ payment: 'Saldo a favor', deliveryMode: 'delivery' })).toBe(false);
  });
});
