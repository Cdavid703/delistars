import { describe, it, expect } from 'vitest';
import { planSolicitar, planPrueba, planTomar, planResultado, planRevisar, planDescartar } from './reglas';
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
const caja = usuario({ email: 'Caja@x.co', esCaja: true, sedes: { caja: ['santa_lucia'], domiciliario: [] } });
const cajaOtra = usuario({ email: 'c2@x.co', esCaja: true, sedes: { caja: ['santa_teresita'], domiciliario: [] } });
const domi = usuario({ esDomiciliario: true, sedes: { caja: [], domiciliario: ['santa_lucia'] } });
const T = 1_700_000_000_000;
const pedido = (extra = {}) => ({ id: 'o1', sedeId: 'santa_lucia', status: 'accepted', version: 1, orderNumber: '042', items: '1x Perro (= $17.000)', quotedPrice: 17000, deliveryPrice: 5000, totalPrice: 22000, deliveryMode: 'delivery', ...extra });

describe('impresión de comandas (§19)', () => {
  it('la caja de la sede pide la comanda; queda en cola con su contenido', () => {
    const j = planSolicitar(caja, pedido(), {}, [], false, T);
    expect(j).toMatchObject({ sedeId: 'santa_lucia', orderId: 'o1', version: 1, tipo: 'original', estado: 'pendiente', intento: 1, solicitante: 'caja@x.co', prueba: false });
    expect(j.texto).toContain('#042');
    expect(j.texto).not.toContain('(= $17.000)');
    falla(() => planSolicitar(cajaOtra, pedido(), {}, [], false, T), 'sin_permiso', 403);
    falla(() => planSolicitar(domi, pedido(), {}, [], false, T), 'sin_permiso', 403);
    falla(() => planSolicitar(caja, pedido({ status: 'cancelled' }), {}, [], false, T), 'cancelado', 409);
    expect(planSolicitar(caja, pedido(), {}, [], true, T).texto).toContain('PRUEBA — NO PREPARAR');
  });

  it('no hay dos en cola; una vigente ya impresa solo se repite como copia (motivo opcional); si cambió, sale actualizada', () => {
    falla(() => planSolicitar(caja, pedido(), {}, [{ estado: 'enviando' }], false, T), 'en_cola', 409);
    const impresa = pedido({ comanda: { estado: 'enviada', version: 1 } });
    falla(() => planSolicitar(caja, impresa, {}, [{ estado: 'enviada' }], false, T), 'ya_impresa', 409);
    expect(planSolicitar(caja, impresa, { copia: true }, [], false, T)).toMatchObject({ tipo: 'copia', motivo: null });
    expect(planSolicitar(caja, impresa, { copia: true, motivo: 'Se mojó' }, [], false, T)).toMatchObject({ tipo: 'copia', motivo: 'Se mojó' });
    falla(() => planSolicitar(caja, pedido(), { copia: true, motivo: 'Se mojó' }, [], false, T), 'sin_original', 409);
    const cambiado = pedido({ version: 2, comanda: { estado: 'enviada', version: 1 } });
    const a = planSolicitar(caja, cambiado, {}, [], false, T);
    expect(a.tipo).toBe('actualizada');
    expect(a.texto).toContain('ACTUALIZADA — versión 2');
  });

  it('el puente toma, imprime y avisa el resultado; un trabajo viejo no sale solo', () => {
    const j = planSolicitar(caja, pedido(), {}, [], false, T);
    falla(() => planTomar(j, caja, {}, null, T), 'puesto', 422);
    const t = planTomar(j, caja, { puesto: 'pc-caja' }, { version: 1, status: 'accepted' }, T + 1000);
    expect(t).toMatchObject({ estado: 'enviando', puesto: 'pc-caja' });
    falla(() => planTomar({ ...j, ...t }, caja, { puesto: 'otro' }, null, T), 'estado', 409);
    expect(planTomar(j, caja, { puesto: 'pc-caja' }, null, T + 11 * 60000)).toMatchObject({ estado: 'pendiente_reintento' });
    expect(planTomar(j, caja, { puesto: 'pc-caja' }, { version: 2, status: 'accepted' }, T)).toMatchObject({ estado: 'descartada' });
    expect(planTomar(j, caja, { puesto: 'pc-caja' }, { version: 1, status: 'cancelled' }, T)).toMatchObject({ estado: 'descartada' });
    const enviando = { ...j, ...t };
    falla(() => planResultado(enviando, caja, { puesto: 'otro', ok: true }, T), 'estado', 409);
    expect(planResultado(enviando, caja, { puesto: 'pc-caja', ok: true }, T)).toMatchObject({ estado: 'enviada' });
    expect(planResultado(enviando, caja, { puesto: 'pc-caja', ok: false, error: 'Sin papel' }, T)).toMatchObject({ estado: 'error', error: 'Sin papel' });
  });

  it('la caja revisa: si salió queda enviada; si no, reintenta (salvo que el pedido haya cambiado); o descarta', () => {
    const j = { ...planSolicitar(caja, pedido(), {}, [], false, T), estado: 'error', intento: 1 };
    expect(planRevisar(j, caja, { salio: true }, 1, T)).toMatchObject({ estado: 'enviada' });
    expect(planRevisar(j, caja, { salio: false }, 1, T)).toMatchObject({ estado: 'pendiente', intento: 2, liberadaAt: T });
    falla(() => planRevisar(j, caja, { salio: false }, 2, T), 'desactualizada', 409);
    const enDuda = { ...j, estado: 'enviando', tomadaAt: T };
    falla(() => planRevisar(enDuda, caja, {}, 1, T + 30000), 'estado', 409);
    expect(planRevisar(enDuda, caja, { salio: false }, 1, T + 3 * 60000)).toMatchObject({ estado: 'pendiente' });
    expect(planDescartar(j, caja, T)).toMatchObject({ estado: 'descartada' });
    falla(() => planDescartar({ ...j, estado: 'enviada' }, caja, T), 'estado', 409);
    falla(() => planRevisar(j, cajaOtra, { salio: true }, 1, T), 'sin_permiso', 403);
  });

  it('página de prueba de la impresora', () => {
    expect(planPrueba(caja, { sedeId: 'santa_lucia' }, T)).toMatchObject({ tipo: 'prueba', orderId: null, prueba: true, estado: 'pendiente' });
    falla(() => planPrueba(caja, { sedeId: 'santa_teresita' }, T), 'sin_permiso', 403);
  });
});
