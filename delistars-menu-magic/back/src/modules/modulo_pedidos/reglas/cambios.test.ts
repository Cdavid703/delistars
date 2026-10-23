import { describe, it, expect } from 'vitest';
import { validarPropuesta, camposAlAceptar, camposAlRechazar, validarAgregado, camposAlAgregar } from './cambios';
import { lineaPremio } from './beneficios';
import { ErrorPedido } from './armado';

const falla = (fn: () => unknown, codigo: string) => {
  try { fn(); } catch (e) { expect((e as ErrorPedido).codigo).toBe(codigo); return; }
  throw new Error(`esperaba error ${codigo}`);
};
const base = { status: 'quoted', etapa: 'confirmado', items: '1x Perro (= $17.000)', quotedPrice: 17000, deliveryPrice: 5000, totalPrice: 22000, deliveryMode: 'delivery' };

describe('cambios al pedido (§9.2)', () => {
  it('la propuesta calcula el total y exige motivo y algún cambio', () => {
    const c = validarPropuesta(base, { items: '1x Perro sin cebolla (= $17.000)', quotedPrice: 17000, motivo: 'Se acabó la cebolla' });
    expect(c).toMatchObject({ quotedPrice: 17000, deliveryPrice: 5000, totalPrice: 22000, motivo: 'Se acabó la cebolla' });
    falla(() => validarPropuesta(base, { items: base.items, quotedPrice: 17000, motivo: 'nada' }), 'sin_cambios');
    falla(() => validarPropuesta(base, { items: 'otro', quotedPrice: 17000, motivo: '' }), 'motivo');
    falla(() => validarPropuesta({ ...base, excepcion: 'cancelacion_solicitada' }, { items: 'otro', quotedPrice: 1, motivo: 'x y z' }), 'bloqueado');
  });
  it('no cambia el total si ya pagó o usa saldo; respeta premio y código', () => {
    falla(() => validarPropuesta({ ...base, pagoAdelantado: true }, { items: 'otro', quotedPrice: 20000, motivo: 'más caro' }), 'pagado');
    expect(validarPropuesta({ ...base, pagoAdelantado: true }, { items: 'otro producto', quotedPrice: 17000, motivo: 'mismo precio' }).totalPrice).toBe(22000);
    falla(() => validarPropuesta({ ...base, saldoAplicado: { monto: 5000 } }, { items: 'otro', quotedPrice: 20000, motivo: 'más caro' }), 'saldo');
    const conPremio = { ...base, loyaltyRedemption: { count: 1 }, items: `1x Perro (= $17.000)\n${lineaPremio(1)}` };
    falla(() => validarPropuesta(conPremio, { items: '1x Perro grande (= $19.000)', quotedPrice: 19000, motivo: 'cambio' }), 'premio');
    expect(validarPropuesta(conPremio, { items: `1x Perro grande (= $19.000)\n${lineaPremio(1)}`, quotedPrice: 19000, motivo: 'cambio' }).quotedPrice).toBe(19000);
  });
  it('aceptar aplica lo propuesto y recalcula el cambio del billete; rechazar solo registra', () => {
    const c = validarPropuesta({ ...base, cashBillAmount: 50000, cashChange: 28000 }, { items: 'x y z', quotedPrice: 30000, motivo: 'adición' });
    const a = camposAlAceptar({ ...base, cashBillAmount: 50000 }, c);
    expect(a).toMatchObject({ items: 'x y z', quotedPrice: 30000, deliveryPrice: 5000, totalPrice: 35000, cashChange: 15000, needsRequote: false });
    const b = camposAlAceptar({ ...base, cashBillAmount: 20000, totalPrice: 22000 }, c);
    expect(b.cashBillAmount).toBeNull();
    // Sin cotizar todavía: no hay total a cobrar que tocar.
    expect('totalPrice' in camposAlAceptar({ ...base, totalPrice: undefined, status: 'pending', etapa: 'enviado' }, c)).toBe(false);
    expect(camposAlRechazar()['cambioPropuesto.estado']).toBe('rechazado');
  });
  it('agregar: solo en Enviado, sin pago adelantado; suma la línea y avisa en el chat', () => {
    const enviado = { ...base, status: 'pending', etapa: 'enviado', totalPrice: undefined };
    expect(validarAgregado(enviado, '  una Coca-Cola ')).toBe('una Coca-Cola');
    falla(() => validarAgregado(base, 'algo'), 'tarde');
    falla(() => validarAgregado({ ...enviado, pagoAdelantado: true }, 'algo'), 'pagado');
    falla(() => validarAgregado(enviado, 'a'), 'texto');
    const c = camposAlAgregar(enviado, 'una Coca-Cola', 'Ana');
    expect(c.items).toBe('1x Perro (= $17.000)\n+ una Coca-Cola');
    expect(c.needsRequote).toBe(true);
    expect((c['__union:clientMessages'] as { text: string }).text).toContain('una Coca-Cola');
  });
});
