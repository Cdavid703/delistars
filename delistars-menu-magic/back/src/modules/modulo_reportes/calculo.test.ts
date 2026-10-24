import { describe, it, expect } from 'vitest';
import { calcularReporte, rangoBogota, leerLinea, estadistica } from './calculo';

// 24 oct 2026 a las 12:00 en Bogotá = 17:00 UTC
const T = Date.UTC(2026, 9, 24, 17, 0);
const min = (m: number) => T + m * 60000;
const pedido = (extra: Record<string, unknown> = {}) => ({
  id: Math.random().toString(36).slice(2), sedeId: 'santa_lucia', status: 'completed', deliveryMode: 'delivery', payment: 'Efectivo',
  items: '2x Perro Clásico (Adición + queso, Tocineta) | Salsas: Rosada — "sin cebolla" (= $34.000)\n1x Gaseosa (= $4.000)',
  quotedPrice: 38000, deliveryPrice: 5000, totalPrice: 43000, clientUid: 'c1', driverEmail: 'domi@x.co', driverName: 'Juan',
  createdAt: T, quotedAt: min(3), preparingAt: min(4), listoAt: min(19), inTransitAt: min(22), deliveredAt: min(40), ...extra,
});

describe('reportes (§16.3)', () => {
  it('el rango de fechas es de días de Bogotá', () => {
    const r = rangoBogota('2026-10-24', '2026-10-24');
    expect(r.dias).toBe(1);
    expect(r.inicio).toBe(Date.UTC(2026, 9, 24, 5, 0));
    expect(() => rangoBogota('24/10/2026', '2026-10-24')).toThrow();
  });

  it('lee productos, unidades, precio de la línea y adiciones', () => {
    expect(leerLinea('2x Perro Clásico (Adición + queso, Tocineta) | Salsas: Rosada — "sin cebolla" (= $34.000)'))
      .toEqual({ nombre: 'Perro Clásico', unidades: 2, monto: 34000, adiciones: ['queso', 'Tocineta'] });
    expect(leerLinea('   ↳ Hamburguesa sencilla')).toBeNull();
    expect(estadistica([10, 20, 30, 40, 100]).mediana).toBe(30);
  });

  it('financiero: ventas solo de entregados, medios con Mixto separado, saldo como medio, pendientes de cobro', () => {
    const r = calcularReporte({
      pedidos: [
        pedido(),
        pedido({ payment: 'Mixto', mixtoEfectivo: '20000', mixtoTransferencia: '23000', clientUid: 'c2' }),
        pedido({ payment: 'Nequi', status: 'pending_cuadre', transferValidated: false, clientUid: 'c3', saldoAplicado: { monto: 5000, usado: 5000 } }),
        pedido({ status: 'cancelled', cancelReason: 'Me equivoqué de dirección' }),
        pedido({ status: 'rejected', rejectionReason: 'Fuera de cobertura' }),
        pedido({ status: 'preparing', deliveredAt: null }),
      ],
      cuadres: [
        { tipo: 'entrega', estado: 'con_diferencia', monto: 36000, montoRecibido: 34000, diferencia: -2000 },
        { tipo: 'entrega', estado: 'confirmado', monto: 10000, montoRecibido: 10000, diferencia: 0 },
        { tipo: 'fondo', estado: 'confirmado', monto: 50000, montoRecibido: 50000 },
      ],
      reclamos: [],
      clientesConHistoria: new Set(['c1']),
    });
    expect(r.financiero.pedidos).toEqual({ total: 6, entregados: 3, cancelados: 1, rechazados: 1, enCurso: 1 });
    expect(r.financiero.ventas).toMatchObject({ total: 129000, productos: 114000, domicilios: 15000, ticketPromedio: 43000 });
    const medio = (m: string) => r.financiero.mediosPago.find((x) => x.medio === m)?.monto;
    expect([medio('Efectivo'), medio('Efectivo (mixto)'), medio('Transferencia (mixto)'), medio('Nequi'), medio('Saldo a favor')]).toEqual([43000, 20000, 23000, 43000, 5000]);
    expect(r.financiero.cuadres).toMatchObject({ entregasConfirmadas: 2, montoRecibido: 44000, conDiferencia: 1, diferenciaNeta: -2000, diferenciasSinResolver: 1, fondosEntregados: 50000 });
    expect(r.financiero.pendientes.transferenciasSinVerificar).toEqual({ pedidos: 2, monto: 66000 });
    expect(r.clientes).toMatchObject({ conPedido: 3, nuevos: 2, recurrentes: 1 });
    expect(r.incidencias.cancelaciones.porMotivo[0]).toEqual({ motivo: 'Me equivoqué de dirección', n: 1 });
  });

  it('tiempos, productos, demanda y domicilios', () => {
    const r = calcularReporte({ pedidos: [pedido(), pedido({ inTransitAt: min(25), deliveredAt: min(45), ratingEntrega: 4 }), pedido({ deliveryMode: 'pickup', driverEmail: null, inTransitAt: null, deliveredAt: min(30) })], cuadres: [], reclamos: [], clientesConHistoria: new Set() });
    expect(r.tiempos.aceptar.mediana).toBe(3);
    expect(r.tiempos.preparacion.mediana).toBe(15);
    expect(r.tiempos.entrega.n).toBe(2);
    expect(r.productos.masVendidos[0]).toMatchObject({ nombre: 'Perro Clásico', unidades: 6, ventas: 102000, pedidos: 3 });
    expect(r.productos.adiciones[0]).toEqual({ nombre: 'queso', veces: 6 });
    expect(r.demanda.porHora[12].pedidos).toBe(3);
    expect(r.demanda.porDiaSemana[6].pedidos).toBe(3); // sábado
    expect(r.domicilios.porDomiciliario[0]).toMatchObject({ email: 'domi@x.co', entregas: 2, calificacion: 4 });
    expect(r.domicilios.recogidasEnSede).toBe(1);
  });

  it('reclamos: categoría, motivo, abiertos, tiempo de resolución, reembolsos y productos', () => {
    const p = pedido({ id: 'o1' });
    const r = calcularReporte({
      pedidos: [p], cuadres: [], clientesConHistoria: new Set(),
      reclamos: [
        { orderId: 'o1', categoria: 'producto', motivo: 'Faltó un producto', estado: 'resuelto', creadoAt: T, resueltoAt: T + 2 * 3600000, reembolso: { estado: 'autorizado', monto: 4000 } },
        { orderId: 'o1', categoria: 'entrega', motivo: 'Se demoró demasiado', estado: 'en_revision', creadoAt: T },
      ],
    });
    expect(r.incidencias.reclamos).toMatchObject({ total: 2, abiertos: 1, resueltos: 1, horasResolucionMediana: 2, reembolsos: { n: 1, monto: 4000 } });
    expect(r.incidencias.reclamos.productosInvolucrados[0]).toEqual({ nombre: 'Perro Clásico', n: 2 });
  });
});
