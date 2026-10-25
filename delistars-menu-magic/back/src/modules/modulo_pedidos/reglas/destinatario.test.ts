import { describe, it, expect } from 'vitest';
import { planPago } from './pago';

// Pedido para otra persona (§7.3): quién paga decide el medio.
const base = {
  status: 'pending', etapa: 'enviado', deliveryMode: 'delivery', clientUid: 'u1',
  quotedPrice: 30000, deliveryPrice: 5000, deliveryPriceAuto: true,
};
const paraAna = (paga: string) => ({ ...base, destinatario: { nombre: 'Ana', telefono: '3001234567', paga, token: 't' } });

describe('pago de un pedido para otra persona', () => {
  it('si paga quien recibe: solo efectivo, y el billete puede quedar sin decir', () => {
    const r = planPago(paraAna('destinatario'), 'o1', 'u1', { metodo: 'Efectivo' }, 'bucket');
    expect(r.campos).toMatchObject({ payment: 'Efectivo', cashOnDelivery: true, totalPrice: 35000 });
    expect(() => planPago(paraAna('destinatario'), 'o1', 'u1', { metodo: 'Nequi' }, 'bucket')).toThrow(/efectivo/);
  });
  it('si paga quien pidió: Transferencia o Nequi, no efectivo', () => {
    const r = planPago(paraAna('comprador'), 'o1', 'u1', { metodo: 'Nequi' }, 'bucket');
    expect(r.campos).toMatchObject({ payment: 'Nequi', cashOnDelivery: false });
    expect(() => planPago(paraAna('comprador'), 'o1', 'u1', { metodo: 'Efectivo', billete: 50000 }, 'bucket')).toThrow(/Transferencia o Nequi/);
  });
  it('un pedido normal sigue pidiendo el billete en efectivo', () => {
    expect(() => planPago(base, 'o1', 'u1', { metodo: 'Efectivo' }, 'bucket')).toThrow(/billete/);
  });
});
