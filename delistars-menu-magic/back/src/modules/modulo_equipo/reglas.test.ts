import { describe, it, expect } from 'vitest';
import { validarSolicitud, sedesAlAprobar, rolesDeUsuario } from './reglas';
import { planCotizar } from '../modulo_pedidos/reglas/caja';
import { planTransicion } from '../modulo_pedidos/reglas/transiciones';
import type { Usuario } from '../../middlewares/require-user';

const u = (x: Partial<Usuario> = {}): Usuario => ({
  uid: 'u1', email: 'ana@x.com', anonimo: false, nombre: 'Ana', esAdmin: false, esCaja: false, esDomiciliario: false,
  esMercadeo: false, sedes: { caja: [], domiciliario: [] }, ...x,
});
const falla = (fn: () => unknown, codigo: string) => {
  try { fn(); } catch (e) { expect((e as { codigo: string }).codigo).toBe(codigo); return; }
  throw new Error(`esperaba ${codigo}`);
};

describe('equipo', () => {
  it('roles de la cuenta', () => {
    expect(rolesDeUsuario(u())).toEqual(['cliente']);
    expect(rolesDeUsuario(u({ esAdmin: true, esCaja: true }))).toEqual(['admin', 'caja', 'cliente']);
  });
  it('solicitud válida y sus errores', () => {
    expect(validarSolicitud(u(), { nombre: ' Ana Pérez ', telefono: '+57 300 123 4567', rol: 'domiciliario', sedeId: 'santa_lucia' }))
      .toEqual({ nombre: 'Ana Pérez', telefono: '3001234567', rol: 'domiciliario', sedeId: 'santa_lucia' });
    falla(() => validarSolicitud(u({ anonimo: true }), {}), 'cuenta_obligatoria');
    falla(() => validarSolicitud(u(), { nombre: 'Ana P', telefono: '123', rol: 'caja', sedeId: 'santa_lucia' }), 'telefono');
    falla(() => validarSolicitud(u(), { nombre: 'Ana P', telefono: '3001234567', rol: 'admin', sedeId: 'santa_lucia' }), 'rol');
    falla(() => validarSolicitud(u({ esCaja: true, sedes: { caja: ['santa_lucia'], domiciliario: [] } }),
      { nombre: 'Ana P', telefono: '3001234567', rol: 'caja', sedeId: 'santa_lucia' }), 'ya_tiene_rol');
  });
  it('aprobar suma sedes sin perder las que tenía', () => {
    expect(sedesAlAprobar(null, ['santa_teresita'])).toEqual(['santa_teresita']);
    expect(sedesAlAprobar(['santa_lucia'], ['santa_teresita'])).toEqual(['santa_lucia', 'santa_teresita']);
  });
  it('la caja solo mueve pedidos de sus sedes; el admin de todas', () => {
    const cajaSL = u({ esCaja: true, sedes: { caja: ['santa_lucia'], domiciliario: [] } });
    const p = { status: 'pending', sedeId: 'santa_teresita', deliveryMode: 'pickup' };
    falla(() => planCotizar(p, cajaSL, { quotedPrice: 1000 }, null), 'sin_permiso');
    falla(() => planTransicion(p, 'confirmado', cajaSL), 'sin_permiso');
    expect(planCotizar({ ...p, sedeId: 'santa_lucia' }, cajaSL, { quotedPrice: 1000 }, null).campos.status).toBe('quoted');
    expect(planCotizar(p, u({ esAdmin: true }), { quotedPrice: 1000 }, null).campos.status).toBe('quoted');
  });
});
