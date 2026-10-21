import { describe, it, expect } from 'vitest';
import { pendientesDeCuenta, saldoPorSede, datosDevolucion, sesionReciente, listaParaBorrar, camposAnonimos, PLAZO_MS } from './reglas';

describe('eliminar la cuenta (P-25)', () => {
  it('pendientes: pedidos en curso, devoluciones abiertas y saldo por transferir', () => {
    const p = pendientesDeCuenta([
      { id: 'a', p: { orderNumber: '010', status: 'assigned', etapa: 'confirmado' } },
      { id: 'b', p: { orderNumber: '011', status: 'completed', etapa: 'entregado' } },
      { id: 'c', p: { orderNumber: '012', status: 'cancelled', excepcion: 'cancelado', devolucion: { estado: 'por_elegir', monto: 20000 } } },
      { id: 'd', p: { status: 'rejected', excepcion: 'rechazado', devolucion: { estado: 'transferida', monto: 5000 } } },
    ], [
      { id: 'u_sl', d: { estado: 'por_transferir', monto: 8000, sedeName: 'Santa Lucía' } },
      { id: 'u_st', d: { estado: 'transferida', monto: 3000 } },
    ]);
    expect(p.map((x) => `${x.tipo}:${x.id}`)).toEqual(['pedido_en_curso:a', 'devolucion_pedido:c', 'devolucion_saldo:u_sl']);
    expect(p[2].texto).toBe('Tu saldo a favor de $8.000 en Santa Lucía: te lo transferimos');
  });
  it('saldo disponible por sede (lo usado o devuelto no cuenta)', () => {
    expect(saldoPorSede([
      { sedeId: 'santa_lucia', estado: 'disponible', monto: 5000 },
      { sedeId: 'santa_lucia', estado: 'disponible', monto: 3000 },
      { sedeId: 'santa_teresita', estado: 'usado', monto: 9000 },
    ])).toEqual({ santa_lucia: 8000 });
  });
  it('datos para la transferencia: medio de la lista, número y titular', () => {
    expect(datosDevolucion({ medio: 'Nequi', numero: '300 123 4567', titular: ' Ana ' })).toEqual({
      datos: { medio: 'Nequi', numero: '3001234567', titular: 'Ana', documento: null },
    });
    expect('errores' in datosDevolucion({ medio: 'Bitcoin', numero: '1', titular: 'x' })).toBe(true);
    expect((datosDevolucion({}) as { errores: string[] }).errores.length).toBe(3);
  });
  it('sesión reciente (10 min) y lista para borrar a los 30 días sin pendientes', () => {
    const t = 1_000_000_000;
    expect(sesionReciente(t - 5 * 60_000, t)).toBe(true);
    expect(sesionReciente(t - 11 * 60_000, t)).toBe(false);
    expect(listaParaBorrar(t + PLAZO_MS, [], t)).toBe(false);
    expect(listaParaBorrar(t, [], t + 1)).toBe(true);
    expect(listaParaBorrar(t, [{ tipo: 'pedido_en_curso', id: 'a', texto: '' }], t + 1)).toBe(false);
  });
  it('el pedido anonimizado no conserva datos personales', () => {
    const c = camposAnonimos();
    expect(c).toMatchObject({ name: 'Cliente eliminado', phone: '', fullAddress: '', addrLat: null });
    for (const k of ['phoneKey', 'clientEmail', 'clientMessages', 'devolucion.datos', 'ratingComment']) expect(k in c).toBe(true);
  });
});
