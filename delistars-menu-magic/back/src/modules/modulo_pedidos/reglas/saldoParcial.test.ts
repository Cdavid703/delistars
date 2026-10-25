import { describe, it, expect } from 'vitest';
import { planCotizar } from './caja';
import { planPago } from './pago';
import type { Usuario } from '../../../middlewares/require-user';

const admin = { uid: 'adm', email: 'a@x.co', esAdmin: true, esCaja: true, sedes: { caja: ['santa_lucia'], domiciliario: [] } } as unknown as Usuario;

describe('saldo por partes (§14.3)', () => {
  it('la caja cotiza descontando solo lo que eligió el cliente; lo demás sobra', () => {
    const p = { status: 'pending', etapa: 'enviado', deliveryMode: 'pickup', sedeId: 'santa_lucia', saldoAplicado: { ids: ['c1'], monto: 50000, limite: 12000 } };
    const plan = planCotizar(p, admin, { quotedPrice: 30000 }, 50000);
    expect(plan.campos).toMatchObject({ totalPrice: 18000, 'saldoAplicado.usado': 12000, 'saldoAplicado.sobrante': 38000 });
    expect(plan.sobrante).toBe(38000);
  });
  it('sin tope sigue como antes: todo lo posible', () => {
    const p = { status: 'pending', etapa: 'enviado', deliveryMode: 'pickup', sedeId: 'santa_lucia', saldoAplicado: { ids: ['c1'], monto: 50000 } };
    expect(planCotizar(p, admin, { quotedPrice: 30000 }, 50000).campos).toMatchObject({ totalPrice: 0, 'saldoAplicado.usado': 30000 });
  });
  it('pago adelantado: paga la diferencia con otro medio', () => {
    const p = { status: 'pending', etapa: 'enviado', deliveryMode: 'pickup', clientUid: 'u1', quotedPrice: 30000, saldoAplicado: { ids: ['c1'], monto: 50000, limite: 10000 } };
    const r = planPago(p, 'o1', 'u1', { metodo: 'Efectivo', billete: 20000 }, 'bucket');
    expect(r.total).toBe(20000);
    expect(r.campos).toMatchObject({ 'saldoAplicado.usado': 10000, 'saldoAplicado.sobrante': 40000, cashChange: 0 });
  });
});
