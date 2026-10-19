import { FieldValue } from 'firebase-admin/firestore';
import { firestore } from '../../../config/firestore';
import { ProductsRepository } from '../../modulo_products/repositories/products.repository';
import { recorrido } from '../../modulo_rutas/services/recorrido.instancia';
import { estadoSede } from '../../../shared/horarios';
import { etapaDe } from '../../../shared/etapas';
import { precioDomicilio, RECORRIDO } from '../../../shared/tarifaDomicilio';
import { armarItems, ErrorPedido, ProductoCatalogo } from '../reglas/armado';
import { planTransicion, esAhora, PedidoDoc } from '../reglas/transiciones';
import { SEDES, normalizarTelefono, coordsValidas } from '../reglas/sedes';
import type { Usuario } from '../../../middlewares/require-user';

const texto = (v: unknown, max: number) => (typeof v === 'string' ? v.trim().slice(0, max) : '');

/** Fecha de hoy en Colombia (yyyy-mm-dd), para el consecutivo diario por sede. */
const hoyColombia = () => new Date(Date.now() - 5 * 3600 * 1000).toISOString().slice(0, 10);

async function catalogo(): Promise<ProductoCatalogo[]> {
  const productos = await new ProductsRepository().getAll();
  return productos.map((p) => ({
    id_producto: p.id_producto,
    nombre_producto: p.nombre_producto,
    precio_venta: Number(p.precio_venta),
    id_categoria: p.id_categoria,
    disponible: (p as { disponible?: boolean }).disponible !== false,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    presentations: ((p as any).presentations || []).map((x: any) => ({ ...x, precio_venta: Number(x.precio_venta) })),
  }));
}

/**
 * Crea un pedido (Fase 3). Reglas del negocio en el servidor:
 * cuenta obligatoria (C6), sede abierta según config/horarios (C7), precios del
 * catálogo, tarifa de domicilio por recorrido de Google (C1) y consecutivo diario.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function crearPedido(u: Usuario, b: any, ip: string) {
  if (u.anonimo || !u.email) throw new ErrorPedido('cuenta_obligatoria', 'Para pedir necesitas entrar con tu cuenta', 403);
  const sede = SEDES[b?.sedeId];
  if (!sede) throw new ErrorPedido('sede', 'Sede no válida');
  const modo = b?.deliveryMode;
  if (modo !== 'delivery' && modo !== 'pickup') throw new ErrorPedido('modo', 'deliveryMode debe ser delivery o pickup');
  const nombre = texto(b?.nombre, 80);
  if (!nombre) throw new ErrorPedido('nombre', 'El nombre es obligatorio');
  const phoneKey = normalizarTelefono(b?.telefono);
  if (!phoneKey) throw new ErrorPedido('telefono', 'El teléfono debe tener 10 dígitos');
  const direccion = texto(b?.direccion, 200);
  if (modo === 'delivery' && direccion.length < 5) throw new ErrorPedido('direccion', 'La dirección es obligatoria');
  const coords = modo === 'delivery' && b?.coords != null ? b.coords : null;
  if (coords && !coordsValidas(coords)) throw new ErrorPedido('coords', 'La ubicación no es válida');

  const db = firestore();
  const horarios = (await db.doc('config/horarios').get()).data() || null;
  if (!estadoSede(horarios?.[sede.id], Date.now()).abierta) {
    throw new ErrorPedido('sede_cerrada', `${sede.nombre} no está recibiendo pedidos en este momento`, 409);
  }

  const { itemsTexto, subtotal } = armarItems(b?.items, await catalogo(), sede.id);

  // Domicilio: con ubicación se cobra por recorrido (C1); sin ella, lo cotiza la caja.
  let domicilio: Record<string, unknown> = {};
  if (coords) {
    const r = await recorrido.medir(sede.coords, coords, ip);
    if (r.ok) {
      const t = precioDomicilio(r.km, RECORRIDO);
      if (t.estado === 'fuera_de_rango') {
        throw new ErrorPedido('fuera_de_cobertura', `Solo llevamos hasta ${t.maxKm} km por calle. Puedes recogerlo en la sede.`);
      }
      if (t.estado === 'ok') {
        domicilio = { deliveryPrice: t.precio, deliveryPriceAuto: true, deliveryKm: Number(r.km.toFixed(2)), deliveryKmMedida: RECORRIDO };
      }
    }
  }

  const orderRef = db.collection('orders').doc();
  const counterRef = db.doc(`counters/orders_${sede.id}`);
  const ahora = FieldValue.serverTimestamp();
  const pedido = {
    name: nombre,
    phone: texto(b?.telefono, 20),
    phoneKey,
    deliveryMode: modo,
    fullAddress: modo === 'delivery' ? direccion : '',
    addrLat: coords?.lat ?? null,
    addrLng: coords?.lng ?? null,
    addrPinFuente: coords ? 'app' : null,
    barrio: texto(b?.barrio, 80),
    reference: texto(b?.referencia, 200),
    items: itemsTexto,
    notes: texto(b?.notas, 300),
    payment: '',
    cashOnDelivery: false,
    quotedPrice: subtotal,
    fromMenu: true,
    ...domicilio,
    clientUid: u.uid,
    clientEmail: u.email,
    clientName: nombre || u.nombre,
    sedeId: sede.id,
    sedeName: sede.nombre,
    status: 'pending',
    etapa: 'enviado',
    excepcion: null,
    excepcionMotivo: null,
    origen: 'app',
    version: 1,
    createdAt: ahora,
    updatedAt: ahora,
  };

  const orderNumber = await db.runTransaction(async (tx) => {
    const c = (await tx.get(counterRef)).data() || {};
    const hoy = hoyColombia();
    const siguiente = (c.date === hoy ? Number(c.lastNumber) || 0 : 0) + 1;
    const num = String(siguiente).padStart(3, '0');
    tx.set(counterRef, { lastNumber: siguiente, date: hoy }, { merge: true });
    tx.set(orderRef, { ...pedido, orderNumber: num });
    tx.set(orderRef.collection('historial').doc(), {
      at: ahora, por: u.email, rol: 'cliente', accion: 'crear',
      de: null, a: { etapa: 'enviado', excepcion: null }, status: 'pending', version: 1,
    });
    tx.set(db.doc(`telefonos/${phoneKey}/pedidos/${orderRef.id}`), { createdAt: ahora });
    return num;
  });

  // Perfil del cliente frecuente (igual que la web; no bloquea la respuesta).
  db.doc(`customers/${u.uid}`).set({
    uid: u.uid, name: nombre, email: u.email, phone: pedido.phone,
    ...(pedido.fullAddress ? { addresses: FieldValue.arrayUnion(pedido.fullAddress) } : {}),
    lastOrderAt: ahora, orderCount: FieldValue.increment(1),
  }, { merge: true }).catch(() => undefined);

  return {
    id: orderRef.id,
    orderNumber,
    etapa: 'enviado',
    version: 1,
    subtotal,
    deliveryPrice: (domicilio.deliveryPrice as number | undefined) ?? null,
    // Sin precio de domicilio, la caja lo cotiza y el cliente elige cómo pagar después.
    total: domicilio.deliveryPrice != null || modo === 'pickup' ? subtotal + ((domicilio.deliveryPrice as number) || 0) : null,
    items: itemsTexto,
  };
}

/** Mueve un pedido de etapa (o le pone una excepción) con control de versión. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function transicionar(u: Usuario, id: string, b: any) {
  const db = firestore();
  const ref = db.doc(`orders/${id}`);
  return db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    if (!snap.exists) throw new ErrorPedido('no_existe', 'El pedido no existe', 404);
    const p = snap.data() as PedidoDoc;
    const versionActual = Number(p.version) || 0;
    if (b?.version != null && Number(b.version) !== versionActual) {
      throw new ErrorPedido('version', `El pedido cambió mientras tanto (versión ${versionActual}). Recárgalo e intenta de nuevo`, 409);
    }
    const plan = planTransicion(p, String(b?.a || ''), u, b?.motivo);
    const ahora = FieldValue.serverTimestamp();
    const extras = Object.fromEntries(Object.entries(plan.extras).map(([k, v]) => [k, esAhora(v) ? ahora : v]));
    const version = versionActual + 1;
    tx.update(ref, {
      ...extras,
      etapa: plan.etapa, excepcion: plan.excepcion, excepcionMotivo: plan.motivo,
      version, updatedAt: ahora,
    });
    const e = etapaDe(p);
    const antes = { etapa: e.etapa, excepcion: e.excepcion };
    tx.set(ref.collection('historial').doc(), {
      at: ahora, por: u.email || u.uid, rol: plan.rol, accion: 'cambio',
      de: antes, a: { etapa: plan.etapa, excepcion: plan.excepcion },
      motivo: plan.motivo, status: (plan.extras.status as string) ?? null, version,
    });
    return { id, etapa: plan.etapa, excepcion: plan.excepcion, version };
  });
}
