import { describe, it, expect } from 'vitest';
import { validarDispositivo, idDeToken } from './reglas';
import { ErrorPedido } from '../modulo_pedidos/reglas/armado';

const falla = (fn: () => unknown, codigo: string) => {
  try { fn(); } catch (e) { expect((e as ErrorPedido).codigo).toBe(codigo); return; }
  throw new Error(`esperaba error ${codigo}`);
};

describe('aparatos de avisos', () => {
  it('acepta tokens de Expo y FCM con su plataforma', () => {
    expect(validarDispositivo({ token: 'ExponentPushToken[abcdefghijklmnopqrstuv]', proveedor: 'expo', plataforma: 'android' }).proveedor).toBe('expo');
    expect(validarDispositivo({ token: 'f'.repeat(150), proveedor: 'fcm', plataforma: 'android' }).plataforma).toBe('android');
  });
  it('rechaza proveedor, plataforma o token raros', () => {
    falla(() => validarDispositivo({ token: 'x'.repeat(40), proveedor: 'apns', plataforma: 'ios' }), 'proveedor');
    falla(() => validarDispositivo({ token: 'x'.repeat(40), proveedor: 'fcm', plataforma: 'tv' }), 'plataforma');
    falla(() => validarDispositivo({ token: 'corto', proveedor: 'fcm', plataforma: 'web' }), 'token');
    falla(() => validarDispositivo({ token: 'x'.repeat(40), proveedor: 'expo', plataforma: 'ios' }), 'token');
  });
  it('el id del token es estable y no es el token', () => {
    expect(idDeToken('abc')).toBe(idDeToken('abc'));
    expect(idDeToken('abc')).not.toContain('abc');
  });
});
