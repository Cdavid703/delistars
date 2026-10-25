import { describe, it, expect } from 'vitest';
import {
  validarDispositivo, nombreDispositivo, puedeCrearSesion, claimsReloj, sesionesACerrar, sesionVigente, tokenRevocado,
} from './reloj.reglas';
import { ErrorPedido } from '../modulo_pedidos/reglas/armado';

const falla = (fn: () => unknown, codigo: string) => {
  try { fn(); } catch (e) { expect((e as ErrorPedido).codigo).toBe(codigo); return; }
  throw new Error(`esperaba error ${codigo}`);
};

describe('sesión del Apple Watch (W-1)', () => {
  it('el dispositivo es un id de 8 a 64 caracteres seguros', () => {
    expect(validarDispositivo('A1B2-C3D4_e5')).toBe('A1B2-C3D4_e5');
    falla(() => validarDispositivo('corto'), 'dispositivo');
    falla(() => validarDispositivo('con espacios 123'), 'dispositivo');
    falla(() => validarDispositivo(undefined), 'dispositivo');
    falla(() => validarDispositivo('x'.repeat(65)), 'dispositivo');
  });

  it('el nombre es opcional y se recorta', () => {
    expect(nombreDispositivo('  Apple   Watch de David ')).toBe('Apple Watch de David');
    expect(nombreDispositivo(42)).toBe('');
    expect(nombreDispositivo('x'.repeat(100))).toHaveLength(60);
  });

  it('solo una cuenta real y desde el iPhone puede pedirla', () => {
    expect(() => puedeCrearSesion({ anonimo: false, email: 'a@b.co', reloj: null })).not.toThrow();
    falla(() => puedeCrearSesion({ anonimo: true, email: '', reloj: null }), 'cuenta_obligatoria');
    falla(() => puedeCrearSesion({ anonimo: false, email: '', reloj: null }), 'cuenta_obligatoria');
    falla(() => puedeCrearSesion({ anonimo: false, email: 'a@b.co', reloj: 'abc123def456' }), 'desde_reloj');
  });

  it('el token lleva la sesión y el proveedor original', () => {
    expect(claimsReloj('s1', 'google.com')).toEqual({ reloj: 's1', prov: 'google.com' });
  });

  it('una sesión nueva cierra la del mismo reloj y la más vieja si pasan de 3', () => {
    const activas = [
      { id: 'a', dispositivo: 'reloj-1', creadaAt: 1 },
      { id: 'b', dispositivo: 'reloj-2', creadaAt: 2 },
      { id: 'c', dispositivo: 'reloj-3', creadaAt: 3 },
    ];
    expect(sesionesACerrar(activas, 'reloj-2')).toEqual(['b']);
    expect(sesionesACerrar(activas, 'reloj-4')).toEqual(['a']);
    expect(sesionesACerrar([], 'reloj-1')).toEqual([]);
  });
});

describe('cerrar sesión (W-2)', () => {
  it('la sesión vale solo activa y de la misma cuenta', () => {
    expect(sesionVigente({ uid: 'u1', activa: true }, 'u1')).toBe(true);
    expect(sesionVigente({ uid: 'u1', activa: false }, 'u1')).toBe(false);
    expect(sesionVigente({ uid: 'u2', activa: true }, 'u1')).toBe(false);
    expect(sesionVigente(null, 'u1')).toBe(false);
  });

  it('token revocado: emitido antes de la revocación, cuenta deshabilitada o borrada', () => {
    const revocadaA = '2026-10-24T20:00:00.000Z';
    const seg = (iso: string) => Date.parse(iso) / 1000;
    expect(tokenRevocado({ tokensValidAfterTime: revocadaA }, seg('2026-10-24T19:59:00Z'))).toBe(true);
    expect(tokenRevocado({ tokensValidAfterTime: revocadaA }, seg('2026-10-24T20:01:00Z'))).toBe(false);
    expect(tokenRevocado({ tokensValidAfterTime: null }, 1)).toBe(false);
    expect(tokenRevocado({ disabled: true }, seg('2026-10-24T20:01:00Z'))).toBe(true);
    expect(tokenRevocado(null, 1)).toBe(true);
  });
});
