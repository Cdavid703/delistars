import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';
import { armarItems, ProductoCatalogo, ErrorPedido } from './armado';
import { planTransicion } from './transiciones';
import type { Usuario } from '../../../middlewares/require-user';

const prod = (id: number, nombre: string, precio: number, cat: number, extra: Partial<ProductoCatalogo> = {}): ProductoCatalogo =>
  ({ id_producto: id, nombre_producto: nombre, precio_venta: precio, id_categoria: cat, disponible: true, presentations: [], ...extra });

const CATALOGO: ProductoCatalogo[] = [
  prod(4, 'Hamburguesa Especial', 20000, 1),
  prod(3, 'Hamburguesa de Pollo con Queso o Tocineta', 20000, 1),
  prod(24, 'Combo Hamburguesa Especial', 29000, 4),
  prod(81, 'Combo Quincena', 52900, 4),
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
    falla(() => armarItems([{ id_producto: 81, cantidad: 1 }], CATALOGO, 'santa_lucia'), 'promo_no_disponible');
    falla(() => armarItems([{ id_producto: 4, cantidad: 0 }], CATALOGO, 'santa_lucia'), 'cantidad');
  });
});

const usuario = (x: Partial<Usuario> = {}): Usuario =>
  ({ uid: 'u1', email: 'cliente@x.com', anonimo: false, nombre: '', esAdmin: false, esCaja: false, esDomiciliario: false, ...x });
const caja = usuario({ uid: 'c1', email: 'caja@x.com', esCaja: true });

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

describe('copias compartidas', () => {
  it('src/shared/*.js son idénticos a src/utils de la web', () => {
    const raiz = join(__dirname, '../../../../../../');
    for (const f of ['etapas', 'handoff', 'tarifaDomicilio', 'horarios']) {
      expect(readFileSync(join(__dirname, '../../../shared', `${f}.js`), 'utf8'))
        .toBe(readFileSync(join(raiz, 'src/utils', `${f}.js`), 'utf8'));
    }
  });
});
