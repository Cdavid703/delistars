import { describe, it, expect } from 'vitest';
import { uidFirebaseDeMicrosoft, revisarClaims, perfilDe, TENANT_PERSONAL } from './reglas';
import { ErrorPedido } from '../modulo_pedidos/reglas/armado';

const falla = (fn: () => unknown, codigo: string) => {
  try { fn(); } catch (e) { expect((e as ErrorPedido).codigo).toBe(codigo); return; }
  throw new Error(`esperaba error ${codigo}`);
};

describe('entrar con Microsoft desde la app', () => {
  it('uid de Firebase: oid tal cual (trabajo) o sin relleno (personal)', () => {
    expect(uidFirebaseDeMicrosoft('00000000-0000-0000-4b2e-abcdefghijkl')).toBe('4b2eabcdefghijkl');
    expect(uidFirebaseDeMicrosoft('a1b2c3d4-1111-2222-3333-444455556666')).toBe('a1b2c3d4-1111-2222-3333-444455556666');
    falla(() => uidFirebaseDeMicrosoft(undefined), 'token_microsoft');
  });
  it('emisor del inquilino del token y nonce de la app', () => {
    const ok = { tid: TENANT_PERSONAL, iss: `https://login.microsoftonline.com/${TENANT_PERSONAL}/v2.0`, nonce: 'n1' };
    expect(() => revisarClaims(ok, 'n1')).not.toThrow();
    falla(() => revisarClaims({ ...ok, iss: 'https://otro.com' }, 'n1'), 'token_microsoft');
    falla(() => revisarClaims(ok, 'n2'), 'token_microsoft');
    falla(() => revisarClaims(ok, ''), 'token_microsoft');
  });
  it('correo y nombre', () => {
    expect(perfilDe({ email: 'Ana@Hotmail.com', name: 'Ana' })).toEqual({ email: 'ana@hotmail.com', nombre: 'Ana' });
    expect(perfilDe({ preferred_username: 'ana@empresa.co' }).email).toBe('ana@empresa.co');
    expect(perfilDe({ preferred_username: '+573001234567' }).email).toBeNull();
  });
});
