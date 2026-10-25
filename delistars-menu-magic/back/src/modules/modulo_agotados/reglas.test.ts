import { describe, it, expect } from 'vitest';
import { puedeMarcar, idProducto, idsDespues } from './reglas';
import { armarItems, ErrorPedido, ProductoCatalogo } from '../modulo_pedidos/reglas/armado';

const falla = (fn: () => unknown, codigo: string) => {
  try { fn(); } catch (e) { expect((e as ErrorPedido).codigo).toBe(codigo); return; }
  throw new Error(`esperaba error ${codigo}`);
};
const caja = (sedes: string[]) => ({ esAdmin: false, sedes: { caja: sedes } });

describe('agotado por sede (§7.2, P-14)', () => {
  it('marca la caja de la sede o administración', () => {
    expect(() => puedeMarcar(caja(['santa_lucia']), 'santa_lucia')).not.toThrow();
    expect(() => puedeMarcar({ esAdmin: true, sedes: { caja: [] } }, 'santa_teresita')).not.toThrow();
    falla(() => puedeMarcar(caja(['santa_lucia']), 'santa_teresita'), 'sin_permiso');
    falla(() => puedeMarcar(caja([]), 'santa_lucia'), 'sin_permiso');
    falla(() => puedeMarcar({ esAdmin: true, sedes: { caja: [] } }, 'otra'), 'sede');
  });
  it('id de producto entero y positivo', () => {
    expect(idProducto('12')).toBe(12);
    falla(() => idProducto('x'), 'producto');
    falla(() => idProducto(0), 'producto');
  });
  it('marcar o desmarcar cambia la lista solo si hace falta', () => {
    expect(idsDespues([3, 5], 7, true)).toEqual({ ids: [3, 5, 7], cambio: true });
    expect(idsDespues([3, 5], 5, false)).toEqual({ ids: [3], cambio: true });
    expect(idsDespues([3, 5], 5, true)).toEqual({ ids: [3, 5], cambio: false });
    expect(idsDespues(undefined, 4, false)).toEqual({ ids: [], cambio: false });
  });
  it('el pedido no se crea con algo agotado en la sede', () => {
    const cat: ProductoCatalogo[] = [
      { id_producto: 1, nombre_producto: 'Perro Clásico', precio_venta: '17000', id_categoria: 2, disponible: true, presentations: [] },
      { id_producto: 9, nombre_producto: 'Queso', precio_venta: '2000', id_categoria: 5, disponible: true, presentations: [] },
    ] as unknown as ProductoCatalogo[];
    expect(armarItems([{ id_producto: 1, cantidad: 1 }], cat, 'santa_lucia').subtotal).toBe(17000);
    falla(() => armarItems([{ id_producto: 1, cantidad: 1 }], cat, 'santa_lucia', Date.now(), new Set([1])), 'agotado_en_sede');
    falla(() => armarItems([{ id_producto: 1, cantidad: 1, adiciones: [{ id_producto: 9, cantidad: 1 }] }], cat, 'santa_lucia', Date.now(), new Set([9])), 'agotado_en_sede');
  });
});
