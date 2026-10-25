import { describe, it, expect } from 'vitest';
import { validarPedidoCaja, puedeCrearCaja, pagoCaja } from './pedidoCaja';
import { ErrorPedido } from './armado';

const falla = (fn: () => unknown, codigo: string) => {
  try { fn(); } catch (e) { expect((e as ErrorPedido).codigo).toBe(codigo); return; }
  throw new Error(`esperaba error ${codigo}`);
};
const base = { sedeId: 'santa_lucia', deliveryMode: 'pickup', nombre: 'Ana', telefono: '300 123 4567' };

describe('pedido de caja desde el catálogo (§10.1)', () => {
  it('lo crea la caja de la sede o administración', () => {
    expect(() => puedeCrearCaja({ esAdmin: false, sedes: { caja: ['santa_lucia'] } }, 'santa_lucia')).not.toThrow();
    expect(() => puedeCrearCaja({ esAdmin: true, sedes: { caja: [] } }, 'santa_teresita')).not.toThrow();
    falla(() => puedeCrearCaja({ esAdmin: false, sedes: { caja: ['santa_lucia'] } }, 'santa_teresita'), 'sin_permiso');
  });
  it('recoger: nombre y teléfono; canal presencial por defecto', () => {
    const d = validarPedidoCaja(base);
    expect(d).toMatchObject({ modo: 'pickup', nombre: 'Ana', phoneKey: '3001234567', canal: 'presencial', direccion: '', domicilioManual: null });
    expect(validarPedidoCaja({ ...base, canal: 'whatsapp' }).canal).toBe('whatsapp');
    falla(() => validarPedidoCaja({ ...base, nombre: '' }), 'nombre');
    falla(() => validarPedidoCaja({ ...base, telefono: '123' }), 'telefono');
    falla(() => validarPedidoCaja({ ...base, deliveryMode: 'x' }), 'modo');
  });
  it('domicilio: dirección y (ubicación o valor a mano)', () => {
    const dom = { ...base, deliveryMode: 'delivery', direccion: 'Cra. 87 #48E-3' };
    falla(() => validarPedidoCaja(dom), 'domicilio');
    expect(validarPedidoCaja({ ...dom, deliveryPrice: '5000' }).domicilioManual).toBe(5000);
    expect(validarPedidoCaja({ ...dom, coords: { lat: 6.26, lng: -75.6 } }).coords).toEqual({ lat: 6.26, lng: -75.6 });
    falla(() => validarPedidoCaja({ ...dom, direccion: 'x' }), 'direccion');
    falla(() => validarPedidoCaja({ ...dom, deliveryPrice: -1 }), 'domicilio');
  });
  it('pago: efectivo con billete, mixto que suma el total, transferencia', () => {
    expect(pagoCaja({ metodo: 'Efectivo', billete: 50000 }, 38000)).toMatchObject({ payment: 'Efectivo', cashOnDelivery: true, cashBillAmount: 50000, cashChange: 12000 });
    expect(pagoCaja({ metodo: 'Transferencia' }, 38000)).toEqual({ payment: 'Transferencia', cashOnDelivery: false });
    expect(pagoCaja({ metodo: 'Mixto', mixtoEfectivo: 20000, mixtoTransferencia: 18000 }, 38000)).toMatchObject({ mixtoEfectivo: '20000', cashOnDelivery: true });
    falla(() => pagoCaja({ metodo: 'Mixto', mixtoEfectivo: 20000, mixtoTransferencia: 10000 }, 38000), 'mixto');
    falla(() => pagoCaja({ metodo: 'Efectivo', billete: 20000 }, 38000), 'billete');
    falla(() => pagoCaja({ metodo: 'Cheque' }, 38000), 'metodo');
  });
});
