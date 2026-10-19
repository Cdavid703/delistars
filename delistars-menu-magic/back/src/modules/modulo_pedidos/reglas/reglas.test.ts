import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';
import { armarItems, ProductoCatalogo, ErrorPedido } from './armado';
import { planTransicion } from './transiciones';
import { planPago, totalConocido } from './pago';
import { planCotizar, planAsignar, planAceptar, planCuadre } from './caja';
import { elegirPremios, revisarCodigo, elegirSaldo, lineaPremio } from './beneficios';
import type { Usuario } from '../../../middlewares/require-user';

const prod = (id: number, nombre: string, precio: number, cat: number, extra: Partial<ProductoCatalogo> = {}): ProductoCatalogo =>
  ({ id_producto: id, nombre_producto: nombre, precio_venta: precio, id_categoria: cat, disponible: true, presentations: [], ...extra });

const CATALOGO: ProductoCatalogo[] = [
  prod(4, 'Hamburguesa Especial', 20000, 1),
  prod(3, 'Hamburguesa de Pollo con Queso o Tocineta', 20000, 1),
  prod(24, 'Combo Hamburguesa Especial', 29000, 4),
  prod(81, 'Combo Quincena', 52900, 4),
  prod(82, 'Combo Parche', 94900, 4),
  prod(79, 'Combo Amor', 54900, 4),
  prod(48, 'Jugos de la Casa', 0, 7, { presentations: [{ id_presentacion: 9, sabor: 'Mora', tamano: 'Grande', base: 'Agua', precio_venta: 7000 }] }),
  prod(57, 'Coca Cola Sabor Original Pet 400 ml', 4500, 7),
  prod(44, 'Tocineta', 4000, 5),
  prod(75, 'Cebolla cruda', 0, 5),
  prod(74, 'Guacamole', 0, 8),
  prod(13, 'Perro Grande', 17000, 2, { disponible: false }),
];

const falla = (fn: () => unknown, codigo: string) => {
  try { fn(); } catch (e) { expect((e as ErrorPedido).codigo).toBe(codigo); return; }
  throw new Error(`esperaba error ${codigo}`);
};

describe('armarItems: precios del catálogo, nunca del cliente', () => {
  it('suma producto + adiciones y arma la línea que ve la caja', () => {
    const r = armarItems([{ id_producto: 4, cantidad: 2, adiciones: [{ id_producto: 44, cantidad: 1 }], salsas: [74], cebollas: [75], nota: 'bien asada', precio: 1 }], CATALOGO, 'santa_lucia');
    expect(r.subtotal).toBe(48000);
    expect(r.itemsTexto).toBe('2x Hamburguesa Especial (Adición + Tocineta) | Salsas: Guacamole | Cebolla: Cebolla cruda — "bien asada" (= $48.000)');
  });
  it('combo exige bebida de la lista; opción queso/tocineta obligatoria', () => {
    falla(() => armarItems([{ id_producto: 24, cantidad: 1 }], CATALOGO, 'santa_lucia'), 'bebida');
    const c = armarItems([{ id_producto: 24, cantidad: 1, bebida: 'Coca Cola Zero Pet 400 ml' }], CATALOGO, 'santa_lucia');
    expect(c.itemsTexto).toContain('Combo Hamburguesa Especial + Coca Cola Zero Pet 400 ml');
    falla(() => armarItems([{ id_producto: 3, cantidad: 1 }], CATALOGO, 'santa_lucia'), 'opcion');
    expect(armarItems([{ id_producto: 3, cantidad: 1, opcion: 'Tocineta' }], CATALOGO, 'santa_lucia').itemsTexto)
      .toContain('Hamburguesa de Pollo con Queso o Tocineta (Tocineta)');
  });
  it('jugos con presentación y solo en Santa Teresita; bebidas sin adiciones', () => {
    falla(() => armarItems([{ id_producto: 48, cantidad: 1, id_presentacion: 9 }], CATALOGO, 'santa_lucia'), 'no_en_sede');
    const j = armarItems([{ id_producto: 48, cantidad: 1, id_presentacion: 9 }], CATALOGO, 'santa_teresita');
    expect(j.subtotal).toBe(7000);
    expect(j.itemsTexto).toContain('Jugos de la Casa (Mora, Grande, Agua)');
    falla(() => armarItems([{ id_producto: 57, cantidad: 1, adiciones: [{ id_producto: 44, cantidad: 1 }] }], CATALOGO, 'santa_lucia'), 'adicion');
  });
  it('rechaza lo que no se puede pedir', () => {
    falla(() => armarItems([], CATALOGO, 'santa_lucia'), 'pedido_vacio');
    falla(() => armarItems([{ id_producto: 999, cantidad: 1 }], CATALOGO, 'santa_lucia'), 'producto_no_existe');
    falla(() => armarItems([{ id_producto: 13, cantidad: 1 }], CATALOGO, 'santa_lucia'), 'agotado');
    falla(() => armarItems([{ id_producto: 44, cantidad: 1 }], CATALOGO, 'santa_lucia'), 'no_se_vende_solo');
    falla(() => armarItems([{ id_producto: 4, cantidad: 0 }], CATALOGO, 'santa_lucia'), 'cantidad');
  });
});

const usuario = (x: Partial<Usuario> = {}): Usuario =>
  ({ uid: 'u1', email: 'cliente@x.com', anonimo: false, nombre: '', esAdmin: false, esCaja: false, esDomiciliario: false, ...x });
const caja = usuario({ uid: 'c1', email: 'caja@x.com', esCaja: true });

describe('combos de promoción y de temporada', () => {
  const parche = Date.parse('2026-10-24T19:00:00-05:00');
  const u = (bebida: string, salsas: number[] = [], cebollas: number[] = []) => ({ salsas, cebollas, bebida });
  it('solo entre sus fechas', () => {
    falla(() => armarItems([{ id_producto: 82, cantidad: 1, unidades: [] }], CATALOGO, 'santa_lucia', Date.parse('2026-10-23T23:59:00-05:00')), 'promo_no_empieza');
    falla(() => armarItems([{ id_producto: 81, cantidad: 1 }], CATALOGO, 'santa_lucia', parche), 'promo_terminada');
    falla(() => armarItems([{ id_producto: 79, cantidad: 1, bebida: 'Coca Cola Zero Pet 400 ml' }], CATALOGO, 'santa_lucia', parche), 'promo_terminada');
  });
  it('cada unidad con sus salsas, cebolla y bebida; la línea queda como en la web', () => {
    const r = armarItems([{ id_producto: 82, cantidad: 1, adiciones: [{ id_producto: 44, cantidad: 1 }], unidades: [
      u('Coca Cola Zero Pet 400 ml', [74], [75]), u('Uva Postobón Pet 400 ml'), u('Colombiana Pet 400 ml', [74]), u('Coca Cola Zero Pet 400 ml'),
    ] }], CATALOGO, 'santa_lucia', parche);
    expect(r.subtotal).toBe(98900);
    expect(r.itemsTexto).toBe([
      '1x Combo Parche (Adición + Tocineta) (= $98.900)',
      '   ↳ Perro 1 · Salsas: Guacamole · Cebolla: Cebolla cruda · Bebida: Coca Cola Zero Pet 400 ml',
      '   ↳ Perro 2 · Sin salsas · Bebida: Uva Postobón Pet 400 ml',
      '   ↳ Perro 3 · Salsas: Guacamole · Bebida: Colombiana Pet 400 ml',
      '   ↳ Perro 4 · Sin salsas · Bebida: Coca Cola Zero Pet 400 ml',
    ].join('\n'));
  });
  it('exige todas las unidades, bebidas de su lista y nada de salsas generales', () => {
    const tres = [u('Coca Cola Zero Pet 400 ml'), u('Coca Cola Zero Pet 400 ml'), u('Coca Cola Zero Pet 400 ml')];
    falla(() => armarItems([{ id_producto: 82, cantidad: 1, unidades: tres }], CATALOGO, 'santa_lucia', parche), 'unidades');
    falla(() => armarItems([{ id_producto: 82, cantidad: 1, unidades: [...tres, u('Pepsi')] }], CATALOGO, 'santa_lucia', parche), 'bebida');
    falla(() => armarItems([{ id_producto: 82, cantidad: 1, salsas: [74], unidades: [...tres, u('Coca Cola Zero Pet 400 ml')] }], CATALOGO, 'santa_lucia', parche), 'unidades');
    falla(() => armarItems([{ id_producto: 4, cantidad: 1, unidades: tres }], CATALOGO, 'santa_lucia', parche), 'unidades');
  });
  it('el código STAR funciona con el Combo Parche', () => {
    const r = armarItems([{ id_producto: 82, cantidad: 1, unidades: Array(4).fill(u('Coca Cola Zero Pet 400 ml')) }], CATALOGO, 'santa_lucia', parche);
    expect(revisarCodigo('STAR', r.itemsTexto, false, parche)).toBe('STAR');
  });
});

describe('planTransicion', () => {
  it('cliente cancela solo en Enviado; después solicita la cancelación', () => {
    const p = { clientUid: 'u1', status: 'pending', etapa: 'enviado' };
    const plan = planTransicion(p, 'excepcion:cancelado', usuario());
    expect(plan.excepcion).toBe('cancelado');
    expect(plan.extras.status).toBe('cancelled');
    falla(() => planTransicion({ ...p, etapa: 'confirmado' }, 'excepcion:cancelado', usuario()), 'sin_permiso');
    expect(planTransicion({ ...p, etapa: 'confirmado' }, 'excepcion:cancelacion_solicitada', usuario(), 'ya no lo quiero').excepcion)
      .toBe('cancelacion_solicitada');
  });
  it('la caja confirma, prepara y marca listo; el status viejo acompaña', () => {
    expect(planTransicion({ status: 'pending' }, 'confirmado', caja).extras.status).toBe('quoted');
    expect(planTransicion({ status: 'quoted' }, 'en_preparacion', caja).extras.status).toBe('preparing');
    const l = planTransicion({ status: 'preparing' }, 'listo', caja);
    expect(l.etapa).toBe('listo');
    expect(l.extras.status).toBeUndefined();
  });
  it('no salta etapas, exige motivo y respeta el bloqueo por cambio pendiente', () => {
    falla(() => planTransicion({ status: 'pending' }, 'listo', caja), 'transicion_invalida');
    falla(() => planTransicion({ status: 'pending' }, 'excepcion:rechazado', caja), 'motivo');
    falla(() => planTransicion({ etapa: 'confirmado', excepcion: 'cambio_pendiente' }, 'en_preparacion', caja), 'bloqueado');
  });
  it('recoger: la caja entrega desde Listo; domicilio en efectivo queda por cuadrar', () => {
    const r = planTransicion({ deliveryMode: 'pickup', etapa: 'listo', status: 'preparing' }, 'entregado', caja);
    expect(r.extras.status).toBe('completed');
    const dom = usuario({ uid: 'd1', email: 'dom@x.com', esDomiciliario: true });
    const e = planTransicion({ etapa: 'llego', status: 'arrived', driverEmail: 'dom@x.com', payment: 'Efectivo' }, 'entregado', dom);
    expect(e.extras.status).toBe('pending_cuadre');
    falla(() => planTransicion({ etapa: 'llego', driverEmail: 'otro@x.com' }, 'entregado', dom), 'sin_permiso');
  });
  it('un pedido terminado no se mueve', () => {
    falla(() => planTransicion({ status: 'cancelled' }, 'confirmado', caja), 'terminado');
  });
});

describe('planPago', () => {
  const B = 'demo.firebasestorage.app';
  const url = (id: string) => `https://firebasestorage.googleapis.com/v0/b/${B}/o/receipts%2F${id}%2F1_comp.jpg?alt=media`;
  const base = { clientUid: 'u1', deliveryMode: 'pickup', quotedPrice: 24000, etapa: 'enviado', status: 'pending' };

  it('adelantado en Enviado cuando el total se conoce (recoger): efectivo exige billete y calcula el cambio', () => {
    expect(totalConocido(base)).toBe(24000);
    expect(() => planPago(base, 'o1', 'u1', { metodo: 'Efectivo' }, B)).toThrow(/billete/);
    const r = planPago(base, 'o1', 'u1', { metodo: 'Efectivo', billete: 50000 }, B);
    expect(r.adelantado).toBe(true);
    expect(r.campos).toMatchObject({ payment: 'Efectivo', cashOnDelivery: true, pagoAdelantado: true, totalPrice: 24000, cashBillAmount: 50000, cashChange: 26000 });
  });
  it('domicilio sin tarifa automática: no se puede pagar hasta que la caja cotice', () => {
    falla(() => planPago({ ...base, deliveryMode: 'delivery' }, 'o1', 'u1', { metodo: 'Nequi' }, B), 'sin_cotizar');
    const auto = planPago({ ...base, deliveryMode: 'delivery', deliveryPrice: 4000, deliveryPriceAuto: true }, 'o1', 'u1', { metodo: 'Nequi', comprobante: { url: url('o1'), nombre: 'c.jpg' } }, B);
    expect(auto.total).toBe(28000);
    expect(auto.campos.transferReceiptUrl).toBe(url('o1'));
  });
  it('tras la cotización: elige método sin billete; transferencia avisa si falta comprobante', () => {
    const cot = { ...base, deliveryMode: 'delivery', etapa: 'confirmado', status: 'quoted', totalPrice: 30000 };
    const ef = planPago(cot, 'o1', 'u1', { metodo: 'Efectivo' }, B);
    expect(ef.adelantado).toBe(false);
    expect(ef.campos.cashBillAmount).toBeUndefined();
    expect(planPago(cot, 'o1', 'u1', { metodo: 'Transferencia' }, B).faltaComprobante).toBe(true);
    falla(() => planPago(cot, 'o1', 'u1', { metodo: 'Transferencia', comprobante: { url: url('OTRO') } }, B), 'comprobante');
    falla(() => planPago(cot, 'o1', 'u1', { metodo: 'Mixto', mixtoEfectivo: 10000, mixtoTransferencia: 5000 }, B), 'mixto');
    expect(planPago(cot, 'o1', 'u1', { metodo: 'Mixto', mixtoEfectivo: 20000, mixtoTransferencia: 10000, billete: 50000 }, B).campos)
      .toMatchObject({ mixtoEfectivo: '20000', mixtoTransferencia: '10000', cashChange: 30000 });
  });
  it('solo el cliente; no con excepción, ni al llegar, ni terminado', () => {
    falla(() => planPago(base, 'o1', 'otro', { metodo: 'Efectivo', billete: 24000 }, B), 'sin_permiso');
    falla(() => planPago({ ...base, excepcion: 'cambio_pendiente' }, 'o1', 'u1', { metodo: 'Nequi' }, B), 'bloqueado');
    falla(() => planPago({ ...base, deliveryMode: 'delivery', etapa: 'llego', totalPrice: 1 }, 'o1', 'u1', { metodo: 'Nequi' }, B), 'tarde');
    falla(() => planPago({ ...base, status: 'cancelled', etapa: undefined }, 'o1', 'u1', { metodo: 'Nequi' }, B), 'terminado');
  });
  it('confirmar por la API deja el total cuando ya se conoce', () => {
    expect(planTransicion({ ...base }, 'confirmado', caja).extras).toMatchObject({ totalPrice: 24000, deliveryPrice: 0 });
    expect(planTransicion({ ...base, deliveryMode: 'delivery' }, 'confirmado', caja).extras.totalPrice).toBeUndefined();
  });
});

describe('beneficios: código, premios y saldo', () => {
  const ahora = Date.parse('2026-10-20T12:00:00-05:00');
  it('premios: solo vigentes de la sede, primero los que vencen antes', () => {
    const premios = [
      { id: 'a', sedeId: 'santa_lucia', status: 'available', expiresAtMs: ahora + 5e8 },
      { id: 'b', sedeId: 'santa_lucia', status: 'available', expiresAtMs: ahora + 1e8 },
      { id: 'c', sedeId: 'santa_lucia', status: 'available', expiresAtMs: ahora - 1 },
      { id: 'd', sedeId: 'santa_teresita', status: 'available', expiresAtMs: null },
      { id: 'e', sedeId: 'santa_lucia', status: 'redeemed', expiresAtMs: null },
    ];
    expect(elegirPremios(premios, 'santa_lucia', 1, ahora)).toEqual(['b']);
    expect(elegirPremios(premios, 'santa_lucia', 2, ahora)).toEqual(['b', 'a']);
    falla(() => elegirPremios(premios, 'santa_lucia', 3, ahora), 'premios');
    expect(elegirPremios(premios, 'santa_lucia', 0, ahora)).toEqual([]);
    expect(lineaPremio(2)).toBe('2x Hamburguesa Especial + Perro Grande con tocineta — GRATIS (premio fidelización, NO cobrar)');
  });
  it('código STAR: solo con Quincena/Parche, una vez por cuenta y antes de vencer', () => {
    falla(() => revisarCodigo('STAR', '1x Hamburguesa Especial', false, ahora), 'codigo');
    expect(revisarCodigo('star', '1x Combo Parche', false, ahora)).toBe('STAR');
    falla(() => revisarCodigo('STAR', '1x Combo Parche', true, ahora), 'codigo');
    falla(() => revisarCodigo('STAR', '1x Combo Parche', false, Date.parse('2026-10-26T12:00:00-05:00')), 'codigo');
    falla(() => revisarCodigo('NOEXISTE', 'x', false, ahora), 'codigo');
    expect(revisarCodigo('', 'x', false, ahora)).toBeNull();
  });
  it('saldo: todo el disponible de la sede', () => {
    const cr = [
      { id: 'x', sedeId: 'santa_lucia', estado: 'disponible', monto: 5000 },
      { id: 'y', sedeId: 'santa_lucia', estado: 'disponible', monto: 3000 },
      { id: 'z', sedeId: 'santa_lucia', estado: 'usado', monto: 9000 },
      { id: 'w', sedeId: 'santa_teresita', estado: 'disponible', monto: 7000 },
    ];
    expect(elegirSaldo(cr, 'santa_lucia', true)).toEqual({ ids: ['x', 'y'], monto: 8000 });
    expect(elegirSaldo(cr, 'santa_lucia', false)).toBeNull();
    falla(() => elegirSaldo([], 'santa_lucia', true), 'saldo');
  });
  it('pago adelantado descuenta el saldo; si lo cubre todo queda en Saldo a favor', () => {
    const p = { clientUid: 'u1', deliveryMode: 'pickup', quotedPrice: 24000, etapa: 'enviado', saldoAplicado: { ids: ['x'], monto: 8000 } };
    const r = planPago(p, 'o1', 'u1', { metodo: 'Efectivo', billete: 20000 }, 'b');
    expect(r.total).toBe(16000);
    expect(r.campos).toMatchObject({ totalPrice: 16000, 'saldoAplicado.usado': 8000, 'saldoAplicado.sobrante': 0, cashChange: 4000 });
    const todo = planPago({ ...p, saldoAplicado: { ids: ['x'], monto: 30000 } }, 'o1', 'u1', {}, 'b');
    expect(todo.campos).toMatchObject({ payment: 'Saldo a favor', totalPrice: 0, 'saldoAplicado.usado': 24000, 'saldoAplicado.sobrante': 6000 });
  });
  it('confirmar por la API aplica el saldo y deja el sobrante', () => {
    const p = { deliveryMode: 'pickup', quotedPrice: 24000, status: 'pending', saldoAplicado: { ids: ['x'], monto: 30000 } };
    expect(planTransicion(p, 'confirmado', caja).extras)
      .toMatchObject({ totalPrice: 0, 'saldoAplicado.usado': 24000, 'saldoAplicado.sobrante': 6000, payment: 'Saldo a favor' });
  });
});

describe('acciones de caja y domiciliario', () => {
  const pend = { clientUid: 'u1', deliveryMode: 'delivery', status: 'pending', etapa: 'enviado', version: 1 };
  it('cotizar: precios, total, etapa Confirmado y cambio recalculado del pago adelantado', () => {
    const r = planCotizar(pend, caja, { quotedPrice: 24000, deliveryPrice: 5000, cashierNotes: ' ok ' }, null);
    expect(r.campos).toMatchObject({ status: 'quoted', quotedPrice: 24000, deliveryPrice: 5000, totalPrice: 29000, cashierNotes: 'ok', needsRequote: false });
    expect(r.etapa).toBe('confirmado');
    expect(r.cambiaEtapa).toBe(true);
    const ad = planCotizar({ ...pend, pagoAdelantado: true, payment: 'Efectivo', cashBillAmount: 20000 }, caja, { quotedPrice: 24000, deliveryPrice: 0 }, null);
    expect(ad.campos).toMatchObject({ cashBillAmount: null, cashChange: null });
    falla(() => planCotizar(pend, usuario(), { quotedPrice: 1 }, null), 'sin_permiso');
    falla(() => planCotizar({ ...pend, etapa: 'en_camino' }, caja, { quotedPrice: 1 }, null), 'tarde');
  });
  it('cotizar con saldo real: descuenta y deja sobrante', () => {
    const r = planCotizar({ ...pend, saldoAplicado: { ids: ['x'], monto: 99999 } }, caja, { quotedPrice: 10000, deliveryPrice: 4000 }, 20000);
    expect(r.campos).toMatchObject({ totalPrice: 0, 'saldoAplicado.monto': 20000, 'saldoAplicado.usado': 14000, 'saldoAplicado.sobrante': 6000, payment: 'Saldo a favor' });
    expect(r.sobrante).toBe(6000);
  });
  it('asignar: solo domicilio, a un domiciliario que existe; recotizar no retrocede', () => {
    const q = { ...pend, status: 'quoted', etapa: 'confirmado' };
    const r = planAsignar(q, caja, { driverEmail: 'Dom@X.com ', driverName: 'Dom' }, true);
    expect(r.campos).toMatchObject({ status: 'assigned', driverEmail: 'dom@x.com', driverName: 'Dom' });
    expect(r.cambiaEtapa).toBe(false);
    falla(() => planAsignar(q, caja, { driverEmail: 'nadie@x.com' }, false), 'domiciliario');
    falla(() => planAsignar({ ...q, deliveryMode: 'pickup' }, caja, { driverEmail: 'd@x.com' }, true), 'recoger');
  });
  it('aceptar y cuadre', () => {
    const dom = usuario({ uid: 'd1', email: 'dom@x.com', esDomiciliario: true });
    expect(planAceptar({ status: 'assigned', driverEmail: 'dom@x.com' }, dom).campos.status).toBe('accepted');
    falla(() => planAceptar({ status: 'assigned', driverEmail: 'otro@x.com' }, dom), 'sin_permiso');
    expect(planCuadre({ status: 'pending_cuadre' }, caja).campos.status).toBe('completed');
    falla(() => planCuadre({ status: 'completed' }, caja), 'tarde');
  });
  it('operación actual: el domiciliario prepara y sale sin Listo; la caja entrega recoger sin Listo', () => {
    const dom = usuario({ uid: 'd1', email: 'dom@x.com', esDomiciliario: true });
    expect(planTransicion({ status: 'accepted', driverEmail: 'dom@x.com' }, 'en_preparacion', dom).extras.status).toBe('preparing');
    expect(planTransicion({ status: 'accepted', driverEmail: 'dom@x.com' }, 'en_camino', dom).extras.status).toBe('in_transit');
    expect(planTransicion({ status: 'quoted', deliveryMode: 'pickup' }, 'entregado', caja).extras.status).toBe('completed');
  });
  it('rechazar con pago por transferencia: devolución, comentario y mensaje al cliente', () => {
    const p = { status: 'pending', payment: 'Nequi', transferReceiptUrl: 'x', totalPrice: 30000, sedeId: 'santa_lucia', clientEmail: 'c@x.com' };
    const r = planTransicion(p, 'excepcion:rechazado', caja, 'Sin domiciliarios');
    expect(r.extras).toMatchObject({ status: 'rejected', rejectionReason: 'Sin domiciliarios', devolucion: { estado: 'por_elegir', monto: 30000, sedeId: 'santa_lucia' } });
    expect((r.extras['__union:comments'] as { text: string }).text).toBe('❌ Pedido rechazado. Motivo: Sin domiciliarios');
    expect((r.extras['__union:clientMessages'] as { text: string }).text).toContain('o como saldo a favor');
  });
});

describe('copias compartidas', () => {
  it('src/shared/*.js son idénticos a src/utils de la web', () => {
    const raiz = join(__dirname, '../../../../../../');
    for (const f of ['etapas', 'handoff', 'tarifaDomicilio', 'horarios', 'codigos', 'devolucion', 'datosTransferencia']) {
      expect(readFileSync(join(__dirname, '../../../shared', `${f}.js`), 'utf8'))
        .toBe(readFileSync(join(raiz, 'src/utils', `${f}.js`), 'utf8'));
    }
  });
});
