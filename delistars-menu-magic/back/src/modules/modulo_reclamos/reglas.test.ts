import { describe, it, expect } from 'vitest';
import { planCrear, planRevisar, planProponer, planAutorizar, planResponder, planCerrar, planMensaje, ladoDe } from './reglas';
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
  uid: 'u', email: 'x@x.co', anonimo: false, nombre: 'Ana', esAdmin: false, esCaja: false, esDomiciliario: false, esMercadeo: false,
  sedes: { caja: [], domiciliario: [] }, ...extra,
}) as any;
const cliente = usuario({ uid: 'cli-1', email: 'ana@x.co', nombre: 'Ana' });
const caja = usuario({ uid: 'caja-1', email: 'caja@x.co', esCaja: true, nombre: 'Valentina', sedes: { caja: ['santa_lucia'], domiciliario: [] } });
const cajaOtra = usuario({ uid: 'caja-2', esCaja: true, sedes: { caja: ['santa_teresita'], domiciliario: [] } });
const admin = usuario({ uid: 'a-1', email: 'andres@x.co', esAdmin: true, nombre: 'Andrés' });
const T = 1_700_000_000_000;
const pedido = { clientUid: 'cli-1', clientEmail: 'ana@x.co', name: 'Ana', status: 'completed', etapa: 'entregado', deliveredAt: T,
  sedeId: 'santa_lucia', sedeName: 'Santa Lucía', orderNumber: '12', totalPrice: 42500, payment: 'Efectivo', driverEmail: 'domi@x.co' } as any;
const base = { categoria: 'producto', motivo: 'Faltó un producto', descripcion: 'Faltó la gaseosa del combo' };

describe('reclamos (§14)', () => {
  it('el cliente crea la ficha de su pedido entregado, dentro del plazo', () => {
    const r = planCrear(pedido, 'o1', cliente, base, T + 1000);
    expect(r).toMatchObject({ orderId: 'o1', estado: 'recibido', atiende: 'caja', categoria: 'producto', clientUid: 'cli-1', totalPrice: 42500 });
    expect(r.mensajes[0]).toMatchObject({ role: 'client', text: 'Faltó la gaseosa del combo' });
    falla(() => planCrear(pedido, 'o1', caja, base, T), 'sin_permiso', 403);
    falla(() => planCrear(pedido, 'o1', cliente, base, T + 25 * 3600000), 'vencido', 409);
    falla(() => planCrear({ ...pedido, status: 'in_transit', etapa: 'en_camino' }, 'o1', cliente, base, T), 'no_entregado', 409);
    falla(() => planCrear(pedido, 'o1', cliente, { ...base, descripcion: 'corto' }, T), 'descripcion', 422);
    expect(planCrear(pedido, 'o1', cliente, { categoria: 'entrega', motivo: 'Se demoró demasiado', descripcion: 'Una hora tarde y frío' }, T).atiende).toBe('admin');
  });

  it('cada caso lo atiende quien le toca: la caja lo de comida de su sede, administración todo', () => {
    const r = planCrear(pedido, 'o1', cliente, base, T);
    expect(ladoDe(r, cliente)).toBe('cliente');
    expect(ladoDe(r, caja)).toBe('caja');
    expect(ladoDe(r, cajaOtra)).toBeNull();
    expect(ladoDe(r, admin)).toBe('admin');
    const entrega = planCrear(pedido, 'o1', cliente, { categoria: 'entrega', motivo: 'Otro', descripcion: 'El domiciliario fue grosero' }, T);
    expect(ladoDe(entrega, caja)).toBeNull();
    falla(() => planRevisar(entrega, caja), 'sin_permiso', 403);
    expect(planRevisar(entrega, admin).estado).toBe('en_revision');
  });

  it('sin reembolso la propuesta llega directo al cliente; con reembolso de caja espera a administración', () => {
    const r = { ...planCrear(pedido, 'o1', cliente, base, T), estado: 'en_revision' };
    const sinPlata = planProponer(r, caja, { texto: 'Te mandamos la gaseosa ya mismo' }, T);
    expect(sinPlata.estado).toBe('propuesta');
    expect(sinPlata.reembolso).toBeNull();
    const conPlata = planProponer(r, caja, { texto: 'Te devolvemos la gaseosa', reembolso: 4500 }, T);
    expect(conPlata.estado).toBe('en_revision');
    expect(conPlata.reembolso).toMatchObject({ monto: 4500, estado: 'solicitado', solicitadoPor: 'caja@x.co' });
    const deAdmin = planProponer(r, admin, { texto: 'Te devolvemos todo', reembolso: 42500 }, T);
    expect(deAdmin.estado).toBe('propuesta');
    expect(deAdmin.reembolso.estado).toBe('autorizado');
    falla(() => planProponer(r, caja, { texto: 'Te devolvemos todo', reembolso: 99999 }, T), 'reembolso', 422);
    falla(() => planProponer(r, caja, { texto: 'Te devolvemos parte', reembolso: 10.5 }, T), 'reembolso', 422);
    falla(() => planProponer({ ...r, estado: 'propuesta' }, caja, { texto: 'otra' }, T), 'estado', 409);
  });

  it('administración autoriza (ajustando el monto) o rechaza con motivo', () => {
    const r = { ...planCrear(pedido, 'o1', cliente, base, T), estado: 'en_revision',
      reembolso: { monto: 4500, estado: 'solicitado' }, propuesta: { texto: 'x' } };
    falla(() => planAutorizar(r, caja, {}, T), 'sin_permiso', 403);
    const ok = planAutorizar(r, admin, { monto: 4000 }, T);
    expect(ok).toMatchObject({ estado: 'propuesta', 'reembolso.estado': 'autorizado', 'reembolso.monto': 4000 });
    expect(planAutorizar(r, admin, {}, T)['reembolso.monto']).toBe(4500);
    const no = planAutorizar(r, admin, { rechazar: true, motivo: 'El cliente ya recibió la gaseosa' }, T);
    expect(no).toMatchObject({ estado: 'en_revision', 'reembolso.estado': 'rechazado' });
    falla(() => planAutorizar({ ...r, reembolso: { estado: 'autorizado' } }, admin, {}, T), 'estado', 409);
  });

  it('el cliente acepta (eligiendo cómo recibir la plata) o dice que el problema sigue', () => {
    const r = { ...planCrear(pedido, 'o1', cliente, base, T), estado: 'propuesta', reembolso: { monto: 4500, estado: 'autorizado' } };
    falla(() => planResponder(r, caja, { acepta: true }, T), 'sin_permiso', 403);
    falla(() => planResponder(r, cliente, { acepta: true }, T), 'eleccion', 422);
    const saldo = planResponder(r, cliente, { acepta: true, eleccion: 'saldo' }, T);
    expect(saldo).toMatchObject({ estado: 'resuelto', resolucion: 'aceptada', 'reembolso.eleccion': 'saldo', 'reembolso.estado': 'ejecutado' });
    const transf = planResponder(r, cliente, { acepta: true, eleccion: 'transferencia' }, T);
    expect(transf['reembolso.estado']).toBe('elegido');
    const sigue = planResponder(r, cliente, { acepta: false, texto: 'Sigue faltando la gaseosa' }, T);
    expect(sigue.estado).toBe('en_revision');
    expect(planResponder({ ...r, reembolso: null }, cliente, { acepta: true }, T).estado).toBe('resuelto');
    falla(() => planResponder({ ...r, estado: 'en_revision' }, cliente, { acepta: true }, T), 'estado', 409);
  });

  it('cerrar sin acuerdo es solo de administración y con motivo; nadie escribe en un caso cerrado', () => {
    const r = { ...planCrear(pedido, 'o1', cliente, base, T), estado: 'en_revision' };
    falla(() => planCerrar(r, caja, { motivo: 'porque sí' }, T), 'sin_permiso', 403);
    falla(() => planCerrar(r, admin, { motivo: 'x' }, T), 'motivo', 422);
    const c = planCerrar(r, admin, { motivo: 'Reclamo repetido ya atendido' }, T);
    expect(c).toMatchObject({ estado: 'cierre_administrativo', cierre: { por: 'andres@x.co' } });
    expect(planMensaje(r, cliente, 'Hola', T)['__union:mensajes']).toMatchObject({ role: 'client' });
    falla(() => planMensaje({ ...r, estado: 'resuelto' }, cliente, 'Hola', T), 'cerrado', 409);
    falla(() => planMensaje(r, cajaOtra, 'Hola', T), 'sin_permiso', 403);
  });
});
