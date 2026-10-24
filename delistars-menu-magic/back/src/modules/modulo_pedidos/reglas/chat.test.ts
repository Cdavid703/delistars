import { describe, it, expect } from 'vitest';
import { validarMensaje, rolEnCanal } from './chat';
import { ErrorPedido } from './armado';
import { motivoCerrado, VENTANA_CHAT_MS } from '../../../shared/chat';

const falla = (fn: () => unknown, codigo: string, status?: number) => {
  try { fn(); } catch (e) {
    expect((e as ErrorPedido).codigo).toBe(codigo);
    if (status) expect((e as ErrorPedido).status).toBe(status);
    return;
  }
  throw new Error(`esperaba error ${codigo}`);
};
const usuario = (extra: Record<string, unknown>) => ({
  uid: 'u1', email: 'x@x.co', anonimo: false, nombre: 'Ana', esAdmin: false, esCaja: false, esDomiciliario: false, esMercadeo: false, ...extra,
}) as any;
const cliente = usuario({ uid: 'cli-1', nombre: 'Ana' });
const caja = usuario({ uid: 'caja-1', esCaja: true, nombre: 'Valentina' });
const domi = usuario({ uid: 'd-1', email: 'Domi@Delistars.com', esDomiciliario: true, nombre: 'Juan' });
const otroDomi = usuario({ uid: 'd-2', email: 'otro@delistars.com', esDomiciliario: true });
const admin = usuario({ uid: 'a-1', esAdmin: true, nombre: 'Andrés' });

const base = { status: 'in_transit', etapa: 'en_camino', excepcion: null, clientUid: 'cli-1', driverEmail: 'domi@delistars.com', deliveryMode: 'delivery' } as any;
const T = 1_700_000_000_000;

describe('chats del pedido (§8.3)', () => {
  it('cada canal tiene sus dos lados; la caja no entra al del domiciliario', () => {
    expect(rolEnCanal(base, cliente, 'caja')).toBe('client');
    expect(rolEnCanal(base, caja, 'caja')).toBe('cashier');
    expect(rolEnCanal(base, domi, 'caja')).toBeNull();
    expect(rolEnCanal(base, cliente, 'domiciliario')).toBe('client');
    expect(rolEnCanal(base, domi, 'domiciliario')).toBe('driver');
    expect(rolEnCanal(base, otroDomi, 'domiciliario')).toBeNull();
    expect(rolEnCanal(base, caja, 'domiciliario')).toBeNull();
    expect(rolEnCanal(base, admin, 'domiciliario')).toBe('admin');
    falla(() => validarMensaje(base, caja, 'domiciliario', 'hola', T), 'sin_permiso', 403);
  });
  it('valida canal y texto, y arma el mensaje', () => {
    falla(() => validarMensaje(base, cliente, 'whatsapp', 'hola', T), 'canal', 422);
    falla(() => validarMensaje(base, cliente, 'caja', '   ', T), 'texto', 422);
    falla(() => validarMensaje(base, cliente, 'caja', 'x'.repeat(501), T), 'largo', 422);
    const { canal, mensaje } = validarMensaje(base, domi, 'domiciliario', '  Ya voy   llegando ', T);
    expect(canal).toBe('domiciliario');
    expect(mensaje).toEqual({ role: 'driver', name: 'Juan', text: 'Ya voy llegando', ts: T });
  });
  it('se cierra 3 horas después de la entrega y con rechazo o cancelación', () => {
    const entregado = { ...base, status: 'completed', etapa: 'entregado', deliveredAt: T };
    expect(motivoCerrado(entregado, 'caja', T + VENTANA_CHAT_MS - 1)).toBeNull();
    expect(motivoCerrado(entregado, 'caja', T + VENTANA_CHAT_MS + 1)).toBe('vencido');
    expect(motivoCerrado({ ...entregado, deliveredAt: undefined }, 'caja', T)).toBe('vencido');
    expect(motivoCerrado({ ...base, status: 'cancelled', etapa: 'confirmado', excepcion: 'cancelado' }, 'caja', T)).toBe('rechazado');
    falla(() => validarMensaje(entregado, cliente, 'caja', 'hola', T + VENTANA_CHAT_MS + 1), 'vencido', 409);
  });
  it('el chat del domiciliario solo existe con domiciliario asignado y a domicilio', () => {
    expect(motivoCerrado({ ...base, driverEmail: null }, 'domiciliario', T)).toBe('sin_domiciliario');
    expect(motivoCerrado({ ...base, deliveryMode: 'pickup' }, 'domiciliario', T)).toBe('sin_domiciliario');
    expect(motivoCerrado({ ...base, driverEmail: null }, 'caja', T)).toBeNull();
    falla(() => validarMensaje({ ...base, driverEmail: null }, cliente, 'domiciliario', 'hola', T), 'sin_domiciliario', 409);
  });
});
