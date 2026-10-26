import { describe, it, expect } from 'vitest';
import { validarRegistro, puedeManejar, vistaSesion, sesionVigente, idSesionValido, SIN_USO_MS } from './sesiones.reglas';

// «Mis sesiones» del equipo (§6.3).
const usuario = (x: Record<string, unknown>) => ({ uid: 'u1', email: 'a@x.co', nombre: 'Ana', anonimo: false, esAdmin: false, esCaja: false, esDomiciliario: false, esMercadeo: false, reloj: null, sedes: { caja: [], domiciliario: [] }, ...x }) as any;
const cajera = usuario({ uid: 'c1', esCaja: true });
const admin = usuario({ uid: 'a1', esAdmin: true });
const cliente = usuario({ uid: 'k1' });
const ID = 'Ab12Cd34Ef56Gh78';

describe('sesiones del equipo', () => {
  it('solo el equipo registra sesiones, con un id válido', () => {
    expect(validarRegistro(cajera, { sesionId: ID, aparato: '  Computador  ', navegador: 'Chrome', sedeId: 'santa_lucia', rol: 'caja' }))
      .toEqual({ id: ID, aparato: 'Computador', navegador: 'Chrome', sedeId: 'santa_lucia', rol: 'caja' });
    expect(() => validarRegistro(cliente, { sesionId: ID })).toThrow(/equipo/);
    expect(() => validarRegistro(usuario({ esCaja: true, reloj: 'r1' }), { sesionId: ID })).toThrow(/equipo/);
    expect(() => validarRegistro(cajera, { sesionId: 'corto' })).toThrow(/id de la sesión/);
    expect(validarRegistro(cajera, { sesionId: ID, sedeId: 'otra', rol: 'jefe' })).toMatchObject({ sedeId: null, rol: null });
    expect(idSesionValido('x/../y')).toBe(false);
  });
  it('cada quien maneja las suyas; administración, todas', () => {
    const s = { uid: 'c1', activa: true };
    expect(puedeManejar(cajera, s)).toBe(true);
    expect(puedeManejar(admin, s)).toBe(true);
    expect(puedeManejar(usuario({ uid: 'otra', esCaja: true }), s)).toBe(false);
    expect(puedeManejar(cajera, null)).toBe(false);
  });
  it('una sesión cerrada o de otra cuenta ya no vale; una sin registrar, sí', () => {
    expect(sesionVigente({ uid: 'c1', activa: true }, 'c1')).toBe(true);
    expect(sesionVigente({ uid: 'c1', activa: false }, 'c1')).toBe(false);
    expect(sesionVigente({ uid: 'c1', activa: true }, 'otra')).toBe(false);
    expect(sesionVigente(null, 'c1')).toBe(true);
  });
  it('la vista no muestra la clave y marca las que llevan mucho sin uso', () => {
    const ahora = 2_000_000_000_000;
    const v = vistaSesion(ID, { uid: 'c1', email: 'a@x.co', claveHash: 'h', activa: true, vistaAt: ahora - SIN_USO_MS - 1 }, ahora);
    expect(v).not.toHaveProperty('claveHash');
    expect(v.sinUso).toBe(true);
  });
});
