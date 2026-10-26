import { describe, it, expect } from 'vitest';
import { planTransicion, yaEsta, motivoNoEntrega } from './transiciones';
import { planInstruccion, planEntendido, planIndicaciones, planDevolverPlata } from './incidencias';
import { revisarOrdenRuta } from './domiciliarios';
import { conSedeYTelefono } from '../../modulo_sedes/controllers/sede.controller';
import type { Usuario } from '../../../middlewares/require-user';

// Incidencias de reparto para CarPlay (CP-1 a CP-7).
const usuario = (x: Partial<Usuario>): Usuario => ({
  uid: 'u1', email: 'x@x.com', anonimo: false, nombre: '', esAdmin: false, esCaja: false, esDomiciliario: false, esMercadeo: false,
  proveedor: 'google.com', correoVerificado: true,
  sedes: { caja: x.esCaja ? ['santa_lucia'] : [], domiciliario: x.esDomiciliario ? ['santa_lucia'] : [] }, ...x,
} as Usuario);
const caja = usuario({ uid: 'c1', email: 'caja@x.com', esCaja: true, nombre: 'Laura' });
const dom = usuario({ uid: 'd1', email: 'dom@x.com', esDomiciliario: true });
const otroDom = usuario({ uid: 'd2', email: 'otro@x.com', esDomiciliario: true });

const llego = { sedeId: 'santa_lucia', deliveryMode: 'delivery', etapa: 'llego', excepcion: null, status: 'arrived', driverEmail: 'dom@x.com', version: 7 };
const noEntregado = { ...llego, excepcion: 'no_entregado', excepcionMotivo: 'El cliente no responde', incidencia: { motivo: 'no_responde', texto: 'El cliente no responde' } };

describe('CP-1 «No puedo entregar»', () => {
  it('acepta los tres motivos cerrados (código o texto) y guarda la incidencia', () => {
    const p = planTransicion(llego, 'excepcion:no_entregado', dom, 'no_puedo_acceder');
    expect(p.excepcion).toBe('no_entregado');
    expect(p.motivo).toBe('No puedo acceder a la dirección');
    expect(p.extras.incidencia).toMatchObject({ motivo: 'no_puedo_acceder', por: 'dom@x.com' });
    expect(p.extras.instruccionCaja).toBeNull();
    expect(motivoNoEntrega('el cliente rechaza el pedido')).toBe('rechaza_pedido');
  });
  it('rechaza un motivo libre', () => {
    expect(() => planTransicion(llego, 'excepcion:no_entregado', dom, 'se me pinchó la llanta')).toThrow(/Motivo no válido/);
  });
  it('solo el domiciliario del pedido y solo al llegar', () => {
    expect(() => planTransicion(llego, 'excepcion:no_entregado', otroDom, 'no_responde')).toThrow();
    expect(() => planTransicion({ ...llego, etapa: 'en_camino', status: 'in_transit' }, 'excepcion:no_entregado', dom, 'no_responde')).toThrow();
  });
  it('si reintenta y entrega, la incidencia se resuelve', () => {
    const p = planTransicion(noEntregado, 'entregado', dom);
    expect(p.etapa).toBe('entregado');
    expect(p.excepcion).toBeNull();
  });
});

describe('CP-2 instrucción de caja', () => {
  it('la caja da la instrucción solo con «No se pudo entregar»', () => {
    const r = planInstruccion(noEntregado, caja, 'regresar');
    expect(r.instruccionCaja).toMatchObject({ tipo: 'regresar', texto: 'Regresa a la sede con el pedido', por: 'Laura', entendidoAt: null });
    expect(() => planInstruccion(llego, caja, 'esperar')).toThrow(/no ha reportado/);
    expect(() => planInstruccion(noEntregado, caja, 'volar')).toThrow(/no válida/);
    expect(() => planInstruccion(noEntregado, dom, 'esperar')).toThrow(/Solo la caja/);
  });
  it('la misma instrucción otra vez no se repite', () => {
    expect(planInstruccion({ ...noEntregado, instruccionCaja: { tipo: 'esperar' } }, caja, 'esperar').igual).toBe(true);
  });
  it('respeta el editor del pedido', () => {
    expect(() => planInstruccion({ ...noEntregado, editor: { uid: 'otra', nombre: 'Pedro' } }, caja, 'esperar')).toThrow(/Pedro/);
  });
  it('el domiciliario acusa; repetirlo no cambia nada', () => {
    expect(planEntendido({ ...noEntregado, instruccionCaja: { tipo: 'esperar', entendidoAt: null } }, dom).yaEstaba).toBe(false);
    expect(planEntendido({ ...noEntregado, instruccionCaja: { tipo: 'esperar', entendidoAt: 123 } }, dom).yaEstaba).toBe(true);
    expect(() => planEntendido(noEntregado, dom)).toThrow(/ninguna instrucción/);
    expect(() => planEntendido({ ...noEntregado, instruccionCaja: { tipo: 'esperar' } }, otroDom)).toThrow();
  });
});

describe('CP-3 regreso en dos pasos', () => {
  it('el domiciliario declara el regreso solo tras «No se pudo entregar»', () => {
    const p = planTransicion(noEntregado, 'excepcion:regreso_declarado', dom);
    expect(p.excepcion).toBe('regreso_declarado');
    expect(p.extras.regresoDeclaradoAt).toBeDefined();
    expect(() => planTransicion(llego, 'excepcion:regreso_declarado', dom)).toThrow();
  });
  it('la caja confirma que lo recibió: queda devuelto y cerrado para las pantallas viejas', () => {
    const p = planTransicion({ ...noEntregado, excepcion: 'regreso_declarado' }, 'excepcion:devuelto', caja);
    expect(p.excepcion).toBe('devuelto');
    expect(p.extras).toMatchObject({ status: 'cancelled', cancelReason: 'Devuelto a la sede: El cliente no responde', devueltoPor: 'caja@x.com' });
    expect(() => planTransicion({ ...noEntregado, excepcion: 'regreso_declarado' }, 'excepcion:devuelto', dom)).toThrow();
  });
});

describe('CP-4 indicaciones breves', () => {
  it('máximo 90 caracteres; vacío las borra', () => {
    expect(planIndicaciones(llego, caja, '  Portería   norte, timbre 3 ').indicacionesBreves).toBe('Portería norte, timbre 3');
    expect(planIndicaciones(llego, caja, '').indicacionesBreves).toBeNull();
    expect(() => planIndicaciones(llego, caja, 'x'.repeat(91))).toThrow(/90/);
    expect(() => planIndicaciones(llego, dom, 'hola')).toThrow(/Solo la caja/);
    expect(() => planIndicaciones({ ...llego, deliveryMode: 'pickup' }, caja, 'hola')).toThrow();
  });
});

describe('CP-5 reintentos tras un corte', () => {
  it('si ya está en la etapa pedida, no es un error', () => {
    expect(yaEsta(llego, 'llego')).toBe(true);
    expect(yaEsta({ ...llego, etapa: 'entregado', status: 'completed' }, 'entregado')).toBe(true);
    expect(yaEsta(noEntregado, 'excepcion:no_entregado', 'no_responde')).toBe(true);
    expect(yaEsta(noEntregado, 'excepcion:no_entregado', 'rechaza_pedido')).toBe(false);
    expect(yaEsta(llego, 'entregado')).toBe(false);
    expect(yaEsta(noEntregado, 'llego')).toBe(false);
  });
});

describe('CP-6 y CP-7', () => {
  it('las sedes traen sedeId y teléfono para marcar', () => {
    expect(conSedeYTelefono({ nombre_sede: 'Santa Lucia, Medellin', telefono_sede: '+57 313 506 5720' })).toMatchObject({ sedeId: 'santa_lucia', telefono: '+573135065720' });
    expect(conSedeYTelefono({ nombre_sede: 'Santa Teresita, Medellín', telefono_sede: '315 063 4084' })).toMatchObject({ sedeId: 'santa_teresita', telefono: '+573150634084' });
  });
  it('orden de ruta: ids válidos, sin repetidos, máximo 10', () => {
    expect(revisarOrdenRuta(['Y20OTc5DSSz10ut7g4cE', 'oFEay2Qd5NQ8vI7OJFzI', 'Y20OTc5DSSz10ut7g4cE'])).toEqual(['Y20OTc5DSSz10ut7g4cE', 'oFEay2Qd5NQ8vI7OJFzI']);
    expect(revisarOrdenRuta([])).toEqual([]);
    expect(() => revisarOrdenRuta(['../x'])).toThrow();
    expect(() => revisarOrdenRuta(new Array(11).fill('Y20OTc5DSSz10ut7g4cE'))).toThrow();
  });
});

describe('Devolverle la plata a un pedido devuelto (decisión del 25 oct 2026)', () => {
  const devuelto = { ...llego, excepcion: 'devuelto', status: 'cancelled', clientUid: 'cli', clientEmail: 'c@x.com' };
  it('lo pagado por transferencia queda por elegir y el saldo vuelve', () => {
    const r = planDevolverPlata({ ...devuelto, payment: 'Nequi', totalPrice: 30000, transferReceiptUrl: 'x', saldoAplicado: { ids: ['s1'], monto: 5000, usado: 5000 } }, caja);
    expect(r.devolucion).toMatchObject({ estado: 'por_elegir', monto: 30000 });
    expect(r.creditos).toEqual(['s1']);
    expect(r.saldo).toBe(5000);
  });
  it('solo devuelto, una vez, solo la caja, y si hay algo que devolver', () => {
    const pago = { payment: 'Nequi', totalPrice: 30000, transferReceiptUrl: 'x' };
    expect(() => planDevolverPlata({ ...llego, ...pago }, caja)).toThrow(/volvieron a la sede/);
    expect(() => planDevolverPlata({ ...devuelto, ...pago, devolucion: { estado: 'por_elegir' } }, caja)).toThrow(/ya se le devolvió/);
    expect(() => planDevolverPlata({ ...devuelto, ...pago }, dom)).toThrow(/Solo la caja/);
    expect(() => planDevolverPlata({ ...devuelto, payment: 'Efectivo', totalPrice: 30000 }, caja)).toThrow(/no tiene plata/);
  });
});
