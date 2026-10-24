/**
 * Reportes aprobados (especificación §16.3). Funciones puras sobre los
 * documentos ya leídos; el servicio solo consulta Firestore.
 *
 * Fórmulas (P-24, propuesta del 24 oct 2026, se muestran en el reporte):
 *  - Fecha de negocio: la hora del pedido (`createdAt`) en Bogotá (UTC−5).
 *  - Pedido entregado (venta): status completed, delivered_paid,
 *    delivered_cash o pending_cuadre.
 *  - Ventas = suma de `totalPrice` de los entregados (productos + domicilio).
 *    Productos = `quotedPrice`; domicilios = `deliveryPrice`.
 *  - Cancelados (`cancelled`) y rechazados (`rejected`) no son venta.
 *  - Medios de pago: según `payment`; en Mixto se separan efectivo y transferencia.
 *  - Saldo a favor usado es un medio de pago, no un descuento.
 *  - Cobros pendientes: efectivo entregado sin cuadrar y transferencias sin verificar.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type Doc = Record<string, any>;

export const ENTREGADOS = ['completed', 'delivered_paid', 'delivered_cash', 'pending_cuadre'];
const OFFSET = 5 * 3600 * 1000;

/** Milisegundos de un Timestamp de Firestore, un número o nada. */
export function ms(t: unknown): number {
  if (t == null) return 0;
  if (typeof t === 'number') return t;
  const x = t as { toMillis?: () => number; _seconds?: number; seconds?: number };
  if (typeof x.toMillis === 'function') return x.toMillis();
  if (typeof x._seconds === 'number') return x._seconds * 1000;
  if (typeof x.seconds === 'number') return x.seconds * 1000;
  const d = Date.parse(String(t));
  return Number.isNaN(d) ? 0 : d;
}

/** Inicio (incluido) y fin (excluido) de un rango de días de Bogotá. */
export function rangoBogota(desde: string, hasta: string): { inicio: number; fin: number; dias: number } {
  const ok = (s: string) => /^\d{4}-\d{2}-\d{2}$/.test(s);
  if (!ok(desde) || !ok(hasta)) throw new Error('fechas');
  const inicio = Date.parse(`${desde}T00:00:00Z`) + OFFSET;
  const fin = Date.parse(`${hasta}T00:00:00Z`) + OFFSET + 24 * 3600 * 1000;
  return { inicio, fin, dias: Math.round((fin - inicio) / (24 * 3600 * 1000)) };
}

const diaBogota = (t: number) => new Date(t - OFFSET).toISOString().slice(0, 10);
const horaBogota = (t: number) => new Date(t - OFFSET).getUTCHours();
const diaSemanaBogota = (t: number) => new Date(t - OFFSET).getUTCDay(); // 0 = domingo
const num = (v: unknown) => Number(v) || 0;
const sumar = <T>(xs: T[], f: (x: T) => number) => xs.reduce((s, x) => s + f(x), 0);

function contar<T>(xs: T[], clave: (x: T) => string): { clave: string; n: number }[] {
  const m = new Map<string, number>();
  for (const x of xs) { const k = clave(x) || 'Sin dato'; m.set(k, (m.get(k) || 0) + 1); }
  return [...m.entries()].map(([k, n]) => ({ clave: k, n })).sort((a, b) => b.n - a.n);
}

/** Mediana, promedio y percentil 90 de unos minutos. */
export function estadistica(minutos: number[]): { n: number; mediana: number | null; promedio: number | null; p90: number | null } {
  const xs = minutos.filter((x) => Number.isFinite(x) && x >= 0 && x < 24 * 60).sort((a, b) => a - b);
  if (!xs.length) return { n: 0, mediana: null, promedio: null, p90: null };
  const q = (p: number) => xs[Math.min(xs.length - 1, Math.floor(p * (xs.length - 1) + 0.5))];
  return { n: xs.length, mediana: Math.round(q(0.5)), promedio: Math.round(sumar(xs, (x) => x) / xs.length), p90: Math.round(q(0.9)) };
}
const minutosEntre = (a: unknown, b: unknown) => {
  const x = ms(a), y = ms(b);
  return x && y && y >= x ? (y - x) / 60000 : NaN;
};

/** Productos de una línea del pedido: "2x Perro (Queso extra) | Salsas: … — "nota" (= $34.000)". */
export function leerLinea(linea: string): { nombre: string; unidades: number; monto: number; adiciones: string[] } | null {
  const l = linea.trim();
  const m = l.match(/^(\d+)\s*x\s+(.+)$/i);
  if (!m) return null;
  const resto = m[2];
  const monto = num((resto.match(/\(= \$([\d.,]+)\)\s*$/) || [])[1]?.replace(/[.,]/g, ''));
  const sinPrecio = resto.replace(/\s*\(= \$[\d.,]+\)\s*$/, '');
  const adiciones = ((sinPrecio.match(/^[^|—(]+\(([^)]*)\)/) || [])[1] || '')
    .split(',').map((a) => a.replace(/^(Adición\s*)?\+?\s*/i, '').trim()).filter(Boolean);
  const nombre = sinPrecio.replace(/\(.*?\)/g, '').replace(/\|.*$/, '').replace(/—.*$/, '').replace(/\s+/g, ' ').trim();
  if (!nombre) return null;
  return { nombre, unidades: num(m[1]) || 1, monto, adiciones };
}

const efectivoDe = (o: Doc) => (o.payment === 'Mixto' ? num(o.mixtoEfectivo) : o.payment === 'Efectivo' || o.cashOnDelivery ? num(o.totalPrice) : 0);
const transferenciaDe = (o: Doc) => (o.payment === 'Mixto' ? num(o.mixtoTransferencia) || num(o.totalPrice) - num(o.mixtoEfectivo) : ['Transferencia', 'Nequi'].includes(o.payment) ? num(o.totalPrice) : 0);
const saldoUsado = (o: Doc) => num(o.saldoAplicado?.usado ?? o.saldoAplicado?.monto);
const claveCliente = (o: Doc) => String(o.clientUid || String(o.phone || '').replace(/\D/g, '').slice(-10) || '');

export interface Entrada {
  pedidos: Doc[];          // pedidos del rango (ya filtrados por sede si aplica)
  cuadres: Doc[];          // movimientos de efectivo del rango
  reclamos: Doc[];         // reclamos creados en el rango
  clientesConHistoria: Set<string>; // claves de clientes con un pedido entregado antes del rango
}

export function calcularReporte(e: Entrada) {
  const { pedidos, cuadres, reclamos } = e;
  const entregados = pedidos.filter((o) => ENTREGADOS.includes(o.status));
  const cancelados = pedidos.filter((o) => o.status === 'cancelled');
  const rechazados = pedidos.filter((o) => o.status === 'rejected');
  const ventas = sumar(entregados, (o) => num(o.totalPrice));

  // ── Financiero y operación
  const medios = new Map<string, { pedidos: number; monto: number }>();
  const sumarMedio = (k: string, monto: number) => { const x = medios.get(k) || { pedidos: 0, monto: 0 }; x.pedidos++; x.monto += monto; medios.set(k, x); };
  for (const o of entregados) {
    const saldo = saldoUsado(o);
    if (o.payment === 'Mixto') { sumarMedio('Efectivo (mixto)', efectivoDe(o)); sumarMedio('Transferencia (mixto)', transferenciaDe(o)); } else sumarMedio(o.payment || 'Sin dato', num(o.totalPrice));
    if (saldo) sumarMedio('Saldo a favor', saldo);
  }
  const entregas = cuadres.filter((m) => m.tipo === 'entrega' && ['confirmado', 'con_diferencia', 'resuelto'].includes(m.estado));
  const conDif = cuadres.filter((m) => m.tipo === 'entrega' && ['con_diferencia', 'resuelto'].includes(m.estado));
  const porCuadrar = entregados.filter((o) => o.status === 'pending_cuadre');
  const sinVerificar = entregados.filter((o) => o.deliveryMode !== 'pickup' && ['Transferencia', 'Nequi', 'Mixto'].includes(o.payment) && !o.transferValidated);
  const financiero = {
    pedidos: { total: pedidos.length, entregados: entregados.length, cancelados: cancelados.length, rechazados: rechazados.length, enCurso: pedidos.length - entregados.length - cancelados.length - rechazados.length },
    ventas: { total: ventas, productos: sumar(entregados, (o) => num(o.quotedPrice)), domicilios: sumar(entregados, (o) => (o.deliveryMode === 'pickup' ? 0 : num(o.deliveryPrice))), ticketPromedio: entregados.length ? Math.round(ventas / entregados.length) : 0 },
    mediosPago: [...medios.entries()].map(([medio, x]) => ({ medio, ...x })).sort((a, b) => b.monto - a.monto),
    efectivo: sumar(entregados, efectivoDe),
    saldoAFavor: { pedidos: entregados.filter((o) => saldoUsado(o) > 0).length, monto: sumar(entregados, saldoUsado) },
    premiosCanjeados: sumar(entregados, (o) => num(o.loyaltyRedemption?.count)),
    cuadres: {
      entregasConfirmadas: entregas.length,
      montoRecibido: sumar(entregas, (m) => num(m.montoRecibido ?? m.monto)),
      conDiferencia: conDif.length,
      diferenciaNeta: sumar(conDif, (m) => num(m.diferencia)),
      diferenciasSinResolver: cuadres.filter((m) => m.estado === 'con_diferencia').length,
      fondosEntregados: sumar(cuadres.filter((m) => m.tipo === 'fondo' && m.estado === 'confirmado'), (m) => num(m.montoRecibido ?? m.monto)),
      porConfirmar: cuadres.filter((m) => m.estado === 'propuesto' || m.estado === 'rechazado').length,
    },
    pendientes: {
      efectivoPorCuadrar: { pedidos: porCuadrar.length, monto: sumar(porCuadrar, efectivoDe) },
      transferenciasSinVerificar: { pedidos: sinVerificar.length, monto: sumar(sinVerificar, transferenciaDe) },
    },
  };

  // ── Tiempos (minutos)
  const tiempos = {
    aceptar: estadistica(pedidos.map((o) => minutosEntre(o.createdAt, o.quotedAt ?? o.acceptedAt))),
    preparacion: estadistica(entregados.map((o) => minutosEntre(o.preparingAt ?? o.quotedAt, o.listoAt))),
    recogida: estadistica(entregados.filter((o) => o.deliveryMode !== 'pickup').map((o) => minutosEntre(o.listoAt, o.inTransitAt))),
    entrega: estadistica(entregados.filter((o) => o.deliveryMode !== 'pickup').map((o) => minutosEntre(o.inTransitAt, o.deliveredAt))),
    total: estadistica(entregados.map((o) => minutosEntre(o.createdAt, o.deliveredAt ?? o.completedAt))),
  };

  // ── Productos
  const prods = new Map<string, { unidades: number; ventas: number; pedidos: number }>();
  const adic = new Map<string, number>();
  for (const o of entregados) {
    const vistos = new Set<string>();
    for (const linea of String(o.items || '').split('\n')) {
      const l = leerLinea(linea);
      if (!l || /premio|código/i.test(l.nombre)) continue;
      const x = prods.get(l.nombre) || { unidades: 0, ventas: 0, pedidos: 0 };
      x.unidades += l.unidades; x.ventas += l.monto; if (!vistos.has(l.nombre)) { x.pedidos++; vistos.add(l.nombre); }
      prods.set(l.nombre, x);
      for (const a of l.adiciones) adic.set(a, (adic.get(a) || 0) + l.unidades);
    }
  }
  const listaProd = [...prods.entries()].map(([nombre, x]) => ({ nombre, ...x })).sort((a, b) => b.unidades - a.unidades || b.ventas - a.ventas);
  const productos = {
    masVendidos: listaProd.slice(0, 15),
    menosVendidos: listaProd.length > 15 ? listaProd.slice(-5).reverse() : [],
    totalUnidades: sumar(listaProd, (p) => p.unidades),
    adiciones: [...adic.entries()].map(([nombre, veces]) => ({ nombre, veces })).sort((a, b) => b.veces - a.veces).slice(0, 15),
  };

  // ── Demanda
  const porHora = Array.from({ length: 24 }, (_, h) => ({ hora: h, pedidos: 0, ventas: 0 }));
  const porDiaSemana = Array.from({ length: 7 }, (_, d) => ({ dia: d, pedidos: 0, ventas: 0 }));
  const porFecha = new Map<string, { pedidos: number; ventas: number }>();
  for (const o of entregados) {
    const t = ms(o.createdAt);
    if (!t) continue;
    const v = num(o.totalPrice);
    porHora[horaBogota(t)].pedidos++; porHora[horaBogota(t)].ventas += v;
    porDiaSemana[diaSemanaBogota(t)].pedidos++; porDiaSemana[diaSemanaBogota(t)].ventas += v;
    const f = diaBogota(t); const x = porFecha.get(f) || { pedidos: 0, ventas: 0 }; x.pedidos++; x.ventas += v; porFecha.set(f, x);
  }
  const demanda = { porHora, porDiaSemana, porFecha: [...porFecha.entries()].map(([fecha, x]) => ({ fecha, ...x })).sort((a, b) => a.fecha.localeCompare(b.fecha)) };

  // ── Clientes y fidelización (solo con identidad: cuenta o teléfono)
  const porCliente = new Map<string, number>();
  for (const o of entregados) { const k = claveCliente(o); if (k) porCliente.set(k, (porCliente.get(k) || 0) + 1); }
  const claves = [...porCliente.keys()];
  const nuevos = claves.filter((k) => !e.clientesConHistoria.has(k));
  const clientes = {
    conPedido: claves.length,
    nuevos: nuevos.length,
    recurrentes: claves.length - nuevos.length,
    repitieronEnElPeriodo: claves.filter((k) => (porCliente.get(k) || 0) > 1).length,
    pedidosPorCliente: claves.length ? Math.round((sumar(claves, (k) => porCliente.get(k) || 0) / claves.length) * 10) / 10 : 0,
    premiosCanjeados: financiero.premiosCanjeados,
  };

  // ── Domicilios
  const doms = new Map<string, Doc[]>();
  for (const o of pedidos) if (o.driverEmail && o.deliveryMode !== 'pickup') { const k = String(o.driverEmail).toLowerCase(); doms.set(k, [...(doms.get(k) || []), o]); }
  const diasConEntrega = (xs: Doc[]) => new Set(xs.map((o) => diaBogota(ms(o.createdAt)))).size || 1;
  const domicilios = {
    porDomiciliario: [...doms.entries()].map(([email, xs]) => {
      const ok = xs.filter((o) => ENTREGADOS.includes(o.status));
      return {
        email, nombre: xs.find((o) => o.driverName)?.driverName || email,
        entregas: ok.length,
        fallidas: xs.filter((o) => ['no_entregado', 'devuelto'].includes(o.excepcion) || o.noEntregado).length,
        entregaMediana: estadistica(ok.map((o) => minutosEntre(o.inTransitAt, o.deliveredAt))).mediana,
        entregasPorDia: Math.round((ok.length / diasConEntrega(ok)) * 10) / 10,
        domicilios: sumar(ok, (o) => num(o.deliveryPrice)),
        calificacion: (() => { const r = ok.map((o) => num(o.ratingEntrega)).filter(Boolean); return r.length ? Math.round((sumar(r, (x) => x) / r.length) * 10) / 10 : null; })(),
      };
    }).sort((a, b) => b.entregas - a.entregas),
    sinDomiciliario: entregados.filter((o) => o.deliveryMode !== 'pickup' && !o.driverEmail).length,
    recogidasEnSede: entregados.filter((o) => o.deliveryMode === 'pickup').length,
  };

  // ── Cancelaciones y reclamos
  const resueltos = reclamos.filter((r) => ms(r.resueltoAt));
  const reembolsos = reclamos.filter((r) => !!r.reembolso && (['autorizado', 'ejecutado'].includes(r.reembolso.estado) || !!r.reembolso.ejecutadoAt));
  const prodsReclamados = new Map<string, number>();
  const pedidoPorId = new Map(pedidos.map((o) => [o.id, o]));
  for (const r of reclamos) {
    const o = pedidoPorId.get(r.orderId);
    for (const linea of String(o?.items || '').split('\n')) { const l = leerLinea(linea); if (l) prodsReclamados.set(l.nombre, (prodsReclamados.get(l.nombre) || 0) + 1); }
  }
  const incidencias = {
    cancelaciones: { total: cancelados.length, porMotivo: contar(cancelados, (o) => o.cancelReason || o.motivoCancelacion || '').map((x) => ({ motivo: x.clave, n: x.n })) },
    rechazos: { total: rechazados.length, porMotivo: contar(rechazados, (o) => o.rejectionReason || '').map((x) => ({ motivo: x.clave, n: x.n })) },
    reclamos: {
      total: reclamos.length,
      porCategoria: contar(reclamos, (r) => (r.categoria === 'entrega' ? 'Entrega' : 'Producto')).map((x) => ({ categoria: x.clave, n: x.n })),
      porMotivo: contar(reclamos, (r) => r.motivo || '').map((x) => ({ motivo: x.clave, n: x.n })),
      abiertos: reclamos.filter((r) => !['resuelto', 'cierre_administrativo'].includes(r.estado)).length,
      resueltos: resueltos.length,
      horasResolucionMediana: (() => { const h = resueltos.map((r) => (ms(r.resueltoAt) - ms(r.creadoAt)) / 3600000).filter((x) => x >= 0).sort((a, b) => a - b); return h.length ? Math.round(h[Math.floor((h.length - 1) / 2)] * 10) / 10 : null; })(),
      reembolsos: { n: reembolsos.length, monto: sumar(reembolsos, (r) => num(r.reembolso?.monto)) },
      productosInvolucrados: [...prodsReclamados.entries()].map(([nombre, n]) => ({ nombre, n })).sort((a, b) => b.n - a.n).slice(0, 10),
    },
  };

  // ── Por sede (útil cuando se piden las dos)
  const porSede = contar(entregados, (o) => o.sedeId || '').map((x) => ({
    sedeId: x.clave, pedidos: x.n, ventas: sumar(entregados.filter((o) => (o.sedeId || 'Sin dato') === x.clave), (o) => num(o.totalPrice)),
  }));

  return { financiero, tiempos, productos, demanda, clientes, domicilios, incidencias, porSede };
}

export const claveDeCliente = claveCliente;
