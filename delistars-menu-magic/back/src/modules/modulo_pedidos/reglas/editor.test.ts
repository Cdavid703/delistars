import { describe, it, expect } from 'vitest';
import { revisarEditor, planEditor } from './editor';
import { ErrorPedido } from './armado';

const falla = (fn: () => unknown, codigo: string) => {
  try { fn(); } catch (e) { expect((e as ErrorPedido).codigo).toBe(codigo); return; }
  throw new Error(`esperaba error ${codigo}`);
};
const ana = { uid: 'a', email: 'ana@x.co', nombre: 'Ana' };
const beto = { uid: 'b', email: 'beto@x.co', nombre: 'Beto' };

describe('un solo editor por pedido (§10.3)', () => {
  it('sin editor o siendo el editor se puede editar; si es otro, no', () => {
    expect(() => revisarEditor({}, ana)).not.toThrow();
    expect(() => revisarEditor({ editor: ana }, ana)).not.toThrow();
    falla(() => revisarEditor({ editor: ana }, beto), 'otro_editor');
  });
  it('tomar un pedido libre no pide motivo; volver a tomarlo no cambia nada', () => {
    expect(planEditor({}, ana, 'tomar')).toMatchObject({ cambio: true, editor: ana, anterior: null, accion: 'tomar' });
    expect(planEditor({ editor: ana }, ana, 'tomar')).toEqual({ cambio: false });
  });
  it('tomar el control de otro exige motivo y deja registro del anterior', () => {
    falla(() => planEditor({ editor: ana }, beto, 'tomar'), 'motivo');
    expect(planEditor({ editor: ana }, beto, 'tomar', 'Ana se fue a cocina')).toMatchObject({ cambio: true, editor: beto, anterior: ana, motivo: 'Ana se fue a cocina', accion: 'tomar_control' });
  });
  it('soltar solo lo hace quien lo tiene', () => {
    expect(planEditor({ editor: ana }, ana, 'soltar')).toMatchObject({ cambio: true, editor: null, accion: 'soltar' });
    expect(planEditor({ editor: ana }, beto, 'soltar')).toEqual({ cambio: false });
    falla(() => planEditor({}, ana, 'borrar'), 'accion');
  });
});
