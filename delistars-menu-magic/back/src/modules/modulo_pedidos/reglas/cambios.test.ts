import { describe, it, expect } from 'vitest';
import { validarPropuesta, camposAlAceptar, camposAlRechazar, validarAgregado, camposAlAgregar, idPropuesta, revisarRespuesta, validarDireccionPropuesta, direccionAnterior } from './cambios';
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

describe('responder a la propuesta vigente (W-3)', () => {
  const pendiente = { ...base, excepcion: 'cambio_pendiente', version: 4, cambioPropuesto: { id: 'prop_abc', estado: 'pendiente' } };
  it('acepta sin datos (web vieja) o con el id y la versión que vio', () => {
    expect(() => revisarRespuesta(pendiente, { acepta: true })).not.toThrow();
    expect(() => revisarRespuesta(pendiente, { acepta: true, propuestaId: 'prop_abc', version: 4 })).not.toThrow();
  });
  it('rechaza la respuesta a una propuesta retirada o reemplazada', () => {
    falla(() => revisarRespuesta(pendiente, { acepta: true, propuestaId: 'prop_vieja' }), 'propuesta_reemplazada');
    falla(() => revisarRespuesta(pendiente, { acepta: true, version: 3 }), 'version');
    falla(() => revisarRespuesta({ ...pendiente, excepcion: null, cambioPropuesto: { id: 'prop_abc', estado: 'retirado' } }, { acepta: true }), 'sin_propuesta');
  });
  it('cada propuesta tiene un id distinto', () => {
    expect(idPropuesta(() => 0.5)).toMatch(/^prop_[a-z0-9]+$/);
    expect(idPropuesta()).not.toBe(idPropuesta());
  });
});

describe('cambio de dirección propuesto por la caja (W-5)', () => {
  const conDir = { ...base, quotedPrice: 17000, fullAddress: 'Cra. 87 #48E-3', barrio: 'Santa Lucía', addrLat: 6.26, addrLng: -75.6, deliveryKm: 1.2 };
  const dir = { fullAddress: 'Cl. 35B #87A-20', barrio: 'La América', reference: 'Portería', addrLat: 6.25, addrLng: -75.61, deliveryKm: 2.4, precio: 7000 };
  it('solo domicilios y con la ubicación del buscador', () => {
    expect(validarDireccionPropuesta(conDir, { texto: 'Cl. 35B #87A-20', coords: { lat: 6.25, lng: -75.61 } }).coords).toEqual({ lat: 6.25, lng: -75.61 });
    falla(() => validarDireccionPropuesta({ ...conDir, deliveryMode: 'pickup' }, { texto: 'Cl. 35B #87A-20', coords: { lat: 6.25, lng: -75.61 } }), 'recoge');
    falla(() => validarDireccionPropuesta(conDir, { texto: 'Cl. 35B #87A-20' }), 'coords');
    falla(() => validarDireccionPropuesta(conDir, { texto: 'x', coords: { lat: 6.25, lng: -75.61 } }), 'direccion');
  });
  it('la tarifa la pone el servidor y los productos quedan como estaban', () => {
    const c = validarPropuesta(conDir, { motivo: 'El cliente se mudó de casa', deliveryPrice: 1 }, dir);
    expect(c).toMatchObject({ items: conDir.items, quotedPrice: 17000, deliveryPrice: 7000, totalPrice: 24000 });
    expect(c.direccion).toEqual({ fullAddress: dir.fullAddress, barrio: dir.barrio, reference: dir.reference, addrLat: 6.25, addrLng: -75.61, deliveryKm: 2.4 });
  });
  it('misma dirección y mismo total no es un cambio; con pago adelantado no cambia el total', () => {
    const misma = { ...dir, fullAddress: conDir.fullAddress, addrLat: 6.26, addrLng: -75.6, precio: 5000 };
    falla(() => validarPropuesta(conDir, { motivo: 'nada que ver' }, misma), 'sin_cambios');
    falla(() => validarPropuesta({ ...conDir, pagoAdelantado: true }, { motivo: 'se mudó' }, dir), 'pagado');
    expect(validarPropuesta({ ...conDir, pagoAdelantado: true }, { motivo: 'se mudó' }, { ...dir, precio: 5000 }).totalPrice).toBe(22000);
  });
  it('al aceptar el pedido queda con la dirección y la tarifa nuevas; se guarda la anterior', () => {
    const c = validarPropuesta(conDir, { motivo: 'El cliente se mudó' }, dir);
    expect(camposAlAceptar(conDir, c)).toMatchObject({ fullAddress: dir.fullAddress, addrLat: 6.25, deliveryKm: 2.4, deliveryPrice: 7000, totalPrice: 24000, deliveryPriceAuto: true });
    expect(direccionAnterior(conDir)).toMatchObject({ fullAddress: 'Cra. 87 #48E-3', addrLat: 6.26, deliveryKm: 1.2 });
  });
});
