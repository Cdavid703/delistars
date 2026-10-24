import { Timestamp } from 'firebase-admin/firestore';
import { firestore } from '../../config/firestore';
import { ErrorPedido } from '../modulo_pedidos/reglas/armado';
import type { Usuario } from '../../middlewares/require-user';
import { calcularReporte, rangoBogota, ms, ENTREGADOS, claveDeCliente, Doc } from './calculo';

/**
 * Reportes (§16.3). Administración ve las dos sedes o una; la caja, solo la
 * suya. Mercadeo no (tiene sus indicadores agregados aparte). Rango máximo 93
 * días para no leer de más.
 */
const SEDES = ['santa_lucia', 'santa_teresita'];
const MAX_DIAS = 93;
const MAX_CLIENTES = 400;

export const FORMULAS = [
  'Fecha de negocio: la hora en que se hizo el pedido, en hora de Bogotá.',
  'Venta: pedido entregado (o entregado y por cuadrar). Ventas = total cobrado al cliente, productos + domicilio.',
  'Cancelados y rechazados no cuentan como venta.',
  'Medios de pago según lo que eligió el cliente; en Mixto se separan efectivo y transferencia. El saldo a favor es un medio de pago, no un descuento.',
  'Cobros pendientes: efectivo entregado que aún no se cuadra con la caja y transferencias sin verificar.',
  'Tiempos en minutos: aceptar (pedido → confirmado), preparación (confirmado o en preparación → listo), recogida (listo → sale), entrega (sale → entregado).',
  'Cliente nuevo: su primer pedido entregado cae dentro del período. Se identifica por la cuenta o, en pedidos de caja, por el teléfono.',
];

async function enLotes<T, R>(xs: T[], n: number, f: (x: T) => Promise<R>): Promise<R[]> {
  const out: R[] = [];
  for (let i = 0; i < xs.length; i += n) out.push(...await Promise.all(xs.slice(i, i + n).map(f)));
  return out;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function reporte(u: Usuario, q: any) {
  const sedeId = typeof q?.sedeId === 'string' && q.sedeId ? q.sedeId : '';
  if (sedeId && !SEDES.includes(sedeId)) throw new ErrorPedido('sede', 'Sede no válida', 422);
  if (!u.esAdmin) {
    if (!u.esCaja) throw new ErrorPedido('sin_permiso', 'Solo administración y la caja ven reportes', 403);
    if (!sedeId || !(u.sedes?.caja ?? []).includes(sedeId)) throw new ErrorPedido('sin_permiso', 'La caja solo ve los reportes de su sede', 403);
  }
  let rango: ReturnType<typeof rangoBogota>;
  try { rango = rangoBogota(String(q?.desde || ''), String(q?.hasta || '')); } catch { throw new ErrorPedido('fechas', 'Fechas no válidas (AAAA-MM-DD)', 422); }
  if (rango.dias < 1) throw new ErrorPedido('fechas', 'La fecha final es antes de la inicial', 422);
  if (rango.dias > MAX_DIAS) throw new ErrorPedido('fechas', `Elige un período de máximo ${MAX_DIAS} días`, 422);

  const db = firestore();
  const desdeTs = Timestamp.fromMillis(rango.inicio), hastaTs = Timestamp.fromMillis(rango.fin);
  const enSede = (x: Doc) => !sedeId || x.sedeId === sedeId;
  const enRango = (t: unknown) => { const x = ms(t); return x >= rango.inicio && x < rango.fin; };
  const [pSnap, cSnap, rSnap] = await Promise.all([
    db.collection('orders').where('createdAt', '>=', desdeTs).where('createdAt', '<', hastaTs).get(),
    db.collection('cuadres').where('creadoAt', '>=', desdeTs).where('creadoAt', '<', hastaTs).get(),
    sedeId ? db.collection('reclamos').where('sedeId', '==', sedeId).get() : db.collection('reclamos').get(),
  ]);
  const pedidos = pSnap.docs.map((d) => ({ id: d.id, ...d.data() } as Doc)).filter(enSede);
  const cuadres = cSnap.docs.map((d) => d.data() as Doc).filter(enSede);
  const reclamos = rSnap.docs.map((d) => d.data() as Doc).filter((r) => enRango(r.creadoAt));

  // Clientes con pedidos entregados antes del período (para nuevos vs recurrentes).
  const identidades = new Map<string, Doc>();
  for (const o of pedidos) if (ENTREGADOS.includes(o.status)) { const k = claveDeCliente(o); if (k && !identidades.has(k)) identidades.set(k, o); }
  const aRevisar = [...identidades.entries()].slice(0, MAX_CLIENTES);
  const conHistoria = new Set<string>();
  await enLotes(aRevisar, 15, async ([k, o]) => {
    const snap = o.clientUid
      ? await db.collection('orders').where('clientUid', '==', o.clientUid).get()
      : await db.collection('orders').where('phone', '==', o.phone).get();
    if (snap.docs.some((d) => { const x = d.data(); return ENTREGADOS.includes(x.status) && ms(x.createdAt) && ms(x.createdAt) < rango.inicio; })) conHistoria.add(k);
  });

  const r = calcularReporte({ pedidos, cuadres, reclamos, clientesConHistoria: conHistoria });
  return {
    desde: q.desde, hasta: q.hasta, sedeId: sedeId || null, dias: rango.dias, generadoAt: Date.now(),
    formulas: FORMULAS,
    avisos: identidades.size > MAX_CLIENTES ? [`Clientes nuevos y recurrentes calculados sobre los primeros ${MAX_CLIENTES} clientes del período`] : [],
    ...r,
  };
}
