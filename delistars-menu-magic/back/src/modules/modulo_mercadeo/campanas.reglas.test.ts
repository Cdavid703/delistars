import { describe, it, expect } from 'vitest';
import { enFranja, publica, atribuible, H24 } from './campanas.reglas';

const T = 1_800_000_000_000;
const c = (extra = {}) => ({ nombre: 'Martes', canales: { franja: true, push: true }, programada: true, pausada: false, sedeId: 'santa_lucia',
  vigencia: { inicio: T - 3600000, fin: T + 3600000 }, franja: { titulo: '2x1', texto: 'Solo hoy' }, push: { titulo: 'P', texto: 'Q' },
  destino: { tipo: 'producto', id: 7 }, segmento: 'todos', metricas: { enviados: 4 }, creadoPor: 'm@x.co', ...extra });

describe('campañas vistas por el cliente (§17)', () => {
  it('franja: programada, sin pausa, en vigencia y de su sede', () => {
    expect(enFranja(c(), 'santa_lucia', T)).toBe(true);
    expect(enFranja(c(), 'santa_teresita', T)).toBe(false);
    expect(enFranja(c({ pausada: true }), 'santa_lucia', T)).toBe(false);
    expect(enFranja(c({ canales: { push: true } }), 'santa_lucia', T)).toBe(false);
    expect(enFranja(c(), 'santa_lucia', T + 2 * 3600000)).toBe(false);
  });
  it('lo público no trae audiencia, métricas ni autor; dice si terminó', () => {
    const p = publica('x', c(), T);
    expect(p).toMatchObject({ vigente: true, terminada: false, titulo: '2x1', destino: { tipo: 'producto', id: 7 } });
    expect(p).not.toHaveProperty('metricas');
    expect(p).not.toHaveProperty('creadoPor');
    expect(publica('x', c(), T + 2 * 3600000)).toMatchObject({ vigente: false, terminada: true });
  });
  it('atribución: abierta en las 24 h anteriores, misma sede, dentro de la campaña', () => {
    expect(atribuible(c(), 'santa_lucia', T - 1000, T)).toBe(true);
    expect(atribuible(c(), 'santa_teresita', T - 1000, T)).toBe(false);
    expect(atribuible(c(), 'santa_lucia', T - H24 - 1000, T)).toBe(false);
    expect(atribuible(c(), 'santa_lucia', T - 2 * 3600000, T)).toBe(false); // antes de empezar
    expect(atribuible(null, 'santa_lucia', T - 1000, T)).toBe(false);
    expect(atribuible(c({ sedeId: '' }), 'santa_teresita', T - 1000, T)).toBe(true);
  });
});
