import { describe, it, expect } from 'vitest';
import {
  generarCodigo, normalizarCodigo, codigoVigente, minutosBloqueo, sumarFallo, vistaPublica,
  ALFABETO, VIGENCIA_MS, BLOQUEO_MS,
} from './codigo';

describe('código privado de pedidos de caja', () => {
  it('8 caracteres sin 0/O/1/I/L, con guion', () => {
    for (let i = 0; i < 50; i++) {
      const c = generarCodigo();
      expect(c).toMatch(/^[A-Z2-9]{4}-[A-Z2-9]{4}$/);
      expect(c).not.toMatch(/[01OIL]/);
    }
    expect(generarCodigo(() => 0)).toBe(`${ALFABETO[0].repeat(4)}-${ALFABETO[0].repeat(4)}`);
  });
  it('acepta minúsculas, espacios y sin guion; rechaza lo que no puede ser', () => {
    expect(normalizarCodigo(' k7qm 4zp9 ')).toBe('K7QM-4ZP9');
    expect(normalizarCodigo('K7QM4ZP9')).toBe('K7QM-4ZP9');
    expect(normalizarCodigo('K7QM-4ZP')).toBeNull();
    expect(normalizarCodigo('K7QM-4ZP0')).toBeNull(); // el 0 no existe en el alfabeto
    expect(normalizarCodigo(12345678)).toBeNull();
  });
  it('vigente en curso y hasta 30 días después de terminado', () => {
    const ahora = Date.now();
    expect(codigoVigente({ status: 'assigned', etapa: 'confirmado' }, ahora)).toBe(true);
    const fin = (dias: number) => ({ status: 'completed', etapa: 'entregado', completedAt: ahora - dias * 24 * 3600 * 1000 });
    expect(codigoVigente(fin(29), ahora)).toBe(true);
    expect(codigoVigente(fin(31), ahora)).toBe(false);
    expect(codigoVigente({ status: 'cancelled', excepcion: 'cancelado', cancelledAt: ahora - VIGENCIA_MS - 1 }, ahora)).toBe(false);
  });
  it('5 fallos seguidos bloquean 15 minutos; los fallos viejos se olvidan', () => {
    const t = 1_000_000;
    let i = sumarFallo(undefined, t);
    for (let k = 0; k < 3; k++) i = sumarFallo(i, t + k);
    expect(i.fallos).toBe(4);
    expect(minutosBloqueo(i, t)).toBe(0);
    i = sumarFallo(i, t + 10);
    expect(i.bloqueadoHasta).toBe(t + 10 + BLOQUEO_MS);
    expect(minutosBloqueo(i, t + 10)).toBe(15);
    expect(minutosBloqueo(i, t + 10 + BLOQUEO_MS)).toBe(0);
    // Pasado el bloqueo, se empieza de cero.
    expect(sumarFallo(i, t + 10 + BLOQUEO_MS).fallos).toBe(1);
    // Un fallo de hace más de 15 min no suma.
    expect(sumarFallo({ fallos: 3, desde: t, bloqueadoHasta: null }, t + BLOQUEO_MS + 1).fallos).toBe(1);
  });
  it('la vista pública no lleva teléfono, correos ni la caja', () => {
    const v = vistaPublica('x1', {
      orderNumber: '014', name: 'Ana Pérez', phone: '3001234567', clientEmail: 'a@x.com', cashierEmail: 'caja@x.com',
      driverEmail: 'd@x.com', driverName: 'Pedro', status: 'assigned', etapa: 'confirmado', items: '1x Perro',
      totalPrice: 20000, payment: 'Efectivo', deliveryMode: 'delivery', fullAddress: 'Cra 1', codigoPrivado: { codigo: 'K7QM-4ZP9' },
    });
    expect(v).toMatchObject({ id: 'x1', orderNumber: '014', nombre: 'Ana', domiciliario: 'Pedro', etapa: 'confirmado', total: 20000, vinculado: false });
    const texto = JSON.stringify(v);
    for (const secreto of ['3001234567', 'a@x.com', 'caja@x.com', 'd@x.com', 'K7QM']) expect(texto).not.toContain(secreto);
  });
});
