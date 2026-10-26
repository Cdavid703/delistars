import { describe, it, expect, beforeAll } from 'vitest';
import { validarMensaje } from './chat';
import { planCrear, planMensaje } from '../../modulo_reclamos/reglas';

// Fotos en chats y reclamos (§8.3, §14).
const B = 'delistars-pruebas.firebasestorage.app';
beforeAll(() => { process.env.VITE_FIREBASE_STORAGE_BUCKET = B; });
const foto = (path: string) => ({ path, url: `https://firebasestorage.googleapis.com/v0/b/${B}/o/${encodeURIComponent(path)}?alt=media&token=t` });
const usuario = (x: Record<string, unknown>) => ({ uid: 'u', email: 'x@x.co', anonimo: false, nombre: 'Ana', esAdmin: false, esCaja: false, esDomiciliario: false, esMercadeo: false, sedes: { caja: [], domiciliario: [] }, ...x }) as any;
const cliente = usuario({ uid: 'cli-1', email: 'ana@x.co' });
const caja = usuario({ uid: 'c', esCaja: true, sedes: { caja: ['santa_lucia'], domiciliario: [] } });
const T = 1_700_000_000_000;
const enCamino = { status: 'in_transit', etapa: 'en_camino', excepcion: null, clientUid: 'cli-1', driverEmail: 'd@x.co', deliveryMode: 'delivery' } as any;

describe('fotos en el chat', () => {
  it('una foto sola es un mensaje; con texto, van juntos', () => {
    const solo = validarMensaje(enCamino, cliente, 'caja', '', T, { foto: foto('fotos/o1/a.jpg'), orderId: 'o1', bucket: B });
    expect(solo.mensaje).toMatchObject({ role: 'client', text: '', foto: { path: 'fotos/o1/a.jpg' } });
    const con = validarMensaje(enCamino, cliente, 'caja', ' mira ', T, { foto: foto('fotos/o1/a.jpg'), orderId: 'o1', bucket: B });
    expect(con.mensaje.text).toBe('mira');
  });
  it('rechaza fotos de otro pedido y sin foto sigue pidiendo texto', () => {
    expect(() => validarMensaje(enCamino, cliente, 'caja', '', T, { foto: foto('fotos/o2/a.jpg'), orderId: 'o1', bucket: B })).toThrow(/foto/);
    expect(() => validarMensaje(enCamino, cliente, 'caja', '', T)).toThrow();
  });
});

describe('fotos en los reclamos', () => {
  const pedido = { clientUid: 'cli-1', clientEmail: 'ana@x.co', name: 'Ana', status: 'completed', etapa: 'entregado', deliveredAt: T,
    sedeId: 'santa_lucia', orderNumber: '12', totalPrice: 42500, payment: 'Efectivo' } as any;
  const base = { categoria: 'producto', motivo: 'Faltó un producto', descripcion: 'Faltó la gaseosa del combo' };
  it('el reclamo guarda hasta 3 fotos, también en el primer mensaje', () => {
    const r = planCrear(pedido, 'o1', cliente, { ...base, fotos: [foto('fotos/o1/1.jpg'), foto('fotos/o1/2.jpg')] }, T + 1000);
    expect(r.fotos).toHaveLength(2);
    expect(r.mensajes[0].fotos).toHaveLength(2);
    expect(() => planCrear(pedido, 'o1', cliente, { ...base, fotos: [1, 2, 3, 4].map((n) => foto(`fotos/o1/${n}.jpg`)) }, T + 1000)).toThrow(/Máximo 3/);
    expect(planCrear(pedido, 'o1', cliente, base, T + 1000).fotos).toEqual([]);
  });
  it('en el hilo del caso se puede mandar una foto', () => {
    const r = { orderId: 'o1', clientUid: 'cli-1', categoria: 'producto', sedeId: 'santa_lucia', estado: 'en_revision' };
    const m = planMensaje(r, caja, '', T, foto('fotos/o1/x.jpg'))['__union:mensajes'];
    expect(m).toMatchObject({ role: 'cashier', text: '', foto: { path: 'fotos/o1/x.jpg' } });
    expect(() => planMensaje(r, cliente, '', T, foto('fotos/o9/x.jpg'))).toThrow(/foto/);
  });
});
