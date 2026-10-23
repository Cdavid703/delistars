import { describe, it, expect } from 'vitest';
import { siguienteEstado, elegirDomiciliario, revisarCapacidad, camposAsignacion, Candidato } from './domiciliarios';
import { ErrorPedido } from './armado';

const falla = (fn: () => unknown, codigo: string) => {
  try { fn(); } catch (e) { expect((e as ErrorPedido).codigo).toBe(codigo); return; }
  throw new Error(`esperaba error ${codigo}`);
};
const cand = (x: Partial<Candidato>): Candidato => ({
  email: 'a@x.com', nombre: 'A', telefono: null, estado: 'activo', sedes: [], ultimaAsignacionMs: null, enReparto: 0, porRecoger: 0, ...x,
});

describe('turno del domiciliario', () => {
  it('iniciar, pausar, reanudar y terminar', () => {
    expect(siguienteEstado(undefined, 'iniciar')).toBe('activo');
    expect(siguienteEstado('activo', 'pausar')).toBe('pausa');
    expect(siguienteEstado('pausa', 'reanudar')).toBe('activo');
    expect(siguienteEstado('pausa', 'terminar')).toBe('fuera');
    falla(() => siguienteEstado('fuera', 'pausar'), 'turno');
    falla(() => siguienteEstado('activo', 'reanudar'), 'turno');
    falla(() => siguienteEstado('activo', 'dormir'), 'turno');
  });
});

describe('asignación automática', () => {
  it('solo en turno, sin pausa y de la sede', () => {
    expect(elegirDomiciliario([cand({ estado: 'pausa' }), cand({ email: 'b@x.com', estado: 'fuera' })], 'santa_lucia')).toBeNull();
    expect(elegirDomiciliario([cand({ sedes: ['santa_teresita'] })], 'santa_lucia')).toBeNull();
    expect(elegirDomiciliario([cand({ sedes: [] })], 'santa_lucia')?.email).toBe('a@x.com'); // sin sedes = ambas
  });
  it('prefiere menos en reparto, luego menos por recoger, luego el que lleva más sin pedidos', () => {
    const lista = [
      cand({ email: 'ocupado@x.com', enReparto: 2 }),
      cand({ email: 'recoge@x.com', porRecoger: 1 }),
      cand({ email: 'reciente@x.com', ultimaAsignacionMs: 2000 }),
      cand({ email: 'antiguo@x.com', ultimaAsignacionMs: 1000 }),
    ];
    expect(elegirDomiciliario(lista, 'santa_lucia')?.email).toBe('antiguo@x.com');
    expect(elegirDomiciliario(lista.slice(0, 2), 'santa_lucia')?.email).toBe('recoge@x.com');
  });
  it('máximo 5 en reparto; la asignación queda aceptada sin preguntarle', () => {
    expect(() => revisarCapacidad(4)).not.toThrow();
    falla(() => revisarCapacidad(5), 'capacidad');
    expect(camposAsignacion({ email: 'j@x.com', nombre: 'Juan', telefono: '300' }, 'automatica'))
      .toMatchObject({ status: 'accepted', driverEmail: 'j@x.com', asignacion: 'automatica', sinDomiciliario: false });
  });
});
