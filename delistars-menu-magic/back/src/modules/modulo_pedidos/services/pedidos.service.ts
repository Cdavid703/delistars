import { FieldValue } from 'firebase-admin/firestore';
import { firestore } from '../../../config/firestore';
import { ProductsRepository } from '../../modulo_products/repositories/products.repository';
import { recorrido } from '../../modulo_rutas/services/recorrido.instancia';
import { estadoSede } from '../../../shared/horarios';
import { etapaDe } from '../../../shared/etapas';
import { precioDomicilio, RECORRIDO } from '../../../shared/tarifaDomicilio';
import { armarItems, ErrorPedido, ProductoCatalogo } from '../reglas/armado';
import { planTransicion, esAhora, PedidoDoc } from '../reglas/transiciones';
import { planPago } from '../reglas/pago';
import { planCotizar, planAsignar, planAceptar, planCuadre, PlanCaja } from '../reglas/caja';
import { elegirPremios, lineaPremio, revisarCodigo, lineaCodigo, elegirSaldo, aplicarSaldo, Premio, Credito } from '../reglas/beneficios';
import { SEDES, normalizarTelefono, coordsValidas } from '../reglas/sedes';
import type { Usuario } from '../../../middlewares/require-user';

/** Marcadores del plan → valores de Firestore ('__ahora__' y '__union:<campo>'). */
function valoresFirestore(extras: Record<string, unknown>, ahora: FieldValue): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(extras)) {
    if (k.startsWith('__union:')) out[k.slice('__union:'.length)] = FieldValue.arrayUnion(v);
    else out[k] = esAhora(v) || v === '__ahora__' ? ahora : v;
  }
  return out;
}

const a_confirmado = (plan: { etapa: string; excepcion: string | null }) => plan.etapa === 'confirmado' && !plan.excepcion;

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

  // Código promocional: una vez por cuenta (se busca en sus pedidos, como la web).
  const codigoPedido = b?.codigo ? String(b.codigo).trim().toUpperCase() : '';
  const yaLoUso = codigoPedido
    ? !(await db.collection('orders').where('clientUid', '==', u.uid).where('codigoPromo', '==', codigoPedido).limit(1).get()).empty
    : false;
  const codigo = revisarCodigo(b?.codigo, itemsTexto, yaLoUso);

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

  const beneficios = { premios: 0, saldo: null as null | { ids: string[]; monto: number } };
  let itemsGuardados = itemsTexto;
  const orderNumber = await db.runTransaction(async (tx) => {
    // Lecturas primero (regla de las transacciones): contador, premios y saldo.
    const c = (await tx.get(counterRef)).data() || {};
    const cliente = db.doc(`customers/${u.uid}`);
    const premios: Premio[] = b?.premios
      ? (await tx.get(cliente.collection('rewards').where('sedeId', '==', sede.id).where('status', '==', 'available')))
        .docs.map((d) => ({ id: d.id, sedeId: d.data().sedeId, status: d.data().status, expiresAtMs: d.data().expiresAt?.toMillis?.() ?? null }))
      : [];
    const creditos: Credito[] = b?.usarSaldo
      ? (await tx.get(cliente.collection('credits').where('sedeId', '==', sede.id).where('estado', '==', 'disponible')))
        .docs.map((d) => ({ id: d.id, sedeId: d.data().sedeId, estado: d.data().estado, monto: Number(d.data().monto) || 0 }))
      : [];
    const premioIds = elegirPremios(premios, sede.id, b?.premios);
    const saldo = elegirSaldo(creditos, sede.id, b?.usarSaldo);
    beneficios.premios = premioIds.length;
    beneficios.saldo = saldo;

    // Líneas gratis (la caja las ve y no las cobra), en el mismo orden que la web.
    let items = itemsTexto;
    if (premioIds.length) items += `\n${lineaPremio(premioIds.length)}`;
    if (codigo) items += `\n${lineaCodigo(codigo)}`;
    itemsGuardados = items;

    const hoy = hoyColombia();
    const siguiente = (c.date === hoy ? Number(c.lastNumber) || 0 : 0) + 1;
    const num = String(siguiente).padStart(3, '0');
    tx.set(counterRef, { lastNumber: siguiente, date: hoy }, { merge: true });
    tx.set(orderRef, {
      ...pedido,
      items,
      ...(codigo ? { codigoPromo: codigo } : {}),
      ...(premioIds.length ? { loyaltyRedemption: { sedeId: sede.id, rewardIds: premioIds, count: premioIds.length } } : {}),
      ...(saldo ? { saldoAplicado: { ids: saldo.ids, monto: saldo.monto } } : {}),
      orderNumber: num,
    });
    for (const id of premioIds) {
      tx.update(cliente.collection('rewards').doc(id), { status: 'redeemed', redeemedAt: ahora, orderId: orderRef.id });
    }
    for (const id of saldo?.ids ?? []) {
      tx.update(cliente.collection('credits').doc(id), { estado: 'usado', usadoEnOrderId: orderRef.id, usadoAt: ahora });
    }
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

  const bruto = domicilio.deliveryPrice != null || modo === 'pickup' ? subtotal + ((domicilio.deliveryPrice as number) || 0) : null;
  const saldoCalc = bruto != null && beneficios.saldo ? aplicarSaldo(bruto, beneficios.saldo.monto) : null;
  const totalCreado = saldoCalc ? saldoCalc.aPagar : bruto;
  const itemsFinal = itemsGuardados;

  return {
    id: orderRef.id,
    orderNumber,
    etapa: 'enviado',
    version: 1,
    subtotal,
    deliveryPrice: (domicilio.deliveryPrice as number | undefined) ?? null,
    // Sin precio de domicilio, la caja lo cotiza y el cliente elige cómo pagar después.
    // Con saldo, `total` es lo que falta por pagar después de descontarlo.
    total: totalCreado,
    codigo: codigo ?? null,
    premios: beneficios.premios,
    saldo: beneficios.saldo ? { monto: beneficios.saldo.monto, usado: saldoCalc?.usado ?? null } : null,
    items: itemsFinal,
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
    const extras = valoresFirestore(plan.extras, ahora);
    const version = versionActual + 1;
    const e = etapaDe(p);
    const antes = { etapa: e.etapa, excepcion: e.excepcion };

    const cliente = p.clientUid ? db.doc(`customers/${p.clientUid}`) : null;
    // Al confirmar: si sobró saldo, vuelve a la cuenta del cliente (id fijo: no se duplica).
    const sobrante = Number(plan.extras['saldoAplicado.sobrante'] ?? (a_confirmado(plan) ? p.saldoAplicado?.sobrante : 0)) || 0;
    if (cliente && a_confirmado(plan) && sobrante > 0) {
      tx.set(cliente.collection('credits').doc(`sob_${id}`), {
        sedeId: p.sedeId || '', monto: sobrante, estado: 'disponible', origenOrderId: id, motivo: 'sobrante',
        creadoPor: u.email || 'caja', createdAt: ahora, usadoEnOrderId: null, usadoAt: null,
      });
    }
    // Cancelado o rechazado: se devuelven los premios y el saldo (y se borra el sobrante).
    if (cliente && (plan.excepcion === 'cancelado' || plan.excepcion === 'rechazado') && e.excepcion !== plan.excepcion) {
      for (const rid of p.loyaltyRedemption?.rewardIds ?? []) {
        tx.set(cliente.collection('rewards').doc(rid), { status: 'available', redeemedAt: null, orderId: null }, { merge: true });
      }
      const cids: string[] = p.saldoAplicado?.ids ?? [];
      for (const cid of cids) {
        tx.set(cliente.collection('credits').doc(cid), { estado: 'disponible', usadoEnOrderId: null, usadoAt: null }, { merge: true });
      }
      if (cids.length) {
        tx.delete(cliente.collection('credits').doc(`sob_${id}`));
        extras['saldoAplicado.devuelto'] = true;
      }
    }
    tx.update(ref, {
      ...extras,
      etapa: plan.etapa, excepcion: plan.excepcion, excepcionMotivo: plan.motivo,
      version, updatedAt: ahora,
    });
    tx.set(ref.collection('historial').doc(), {
      at: ahora, por: u.email || u.uid, rol: plan.rol, accion: 'cambio',
      de: antes, a: { etapa: plan.etapa, excepcion: plan.excepcion },
      motivo: plan.motivo, status: (plan.extras.status as string) ?? null, version,
    });
    return { id, etapa: plan.etapa, excepcion: plan.excepcion, version, entregaDomicilio: plan.etapa === 'entregado' && e.tipo === 'domicilio' ? p : null };
  }).then(async (r) => {
    // Fidelización: cuenta la entrega (best-effort, nunca rompe la entrega).
    if (r.entregaDomicilio) await registrarFidelizacion(r.entregaDomicilio).catch((err) => console.error('[pedidos] fidelización:', err?.message || err));
    const { entregaDomicilio: _e, ...resto } = r;
    return resto;
  });
}

/**
 * Elige o corrige el pago (adelantado en `enviado` si el total ya se conoce, o
 * tras la cotización). No cambia la etapa ni la versión; deja línea en el historial.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function registrarPago(u: Usuario, id: string, b: any) {
  const db = firestore();
  const ref = db.doc(`orders/${id}`);
  const bucket = process.env.VITE_FIREBASE_STORAGE_BUCKET || '';
  return db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    if (!snap.exists) throw new ErrorPedido('no_existe', 'El pedido no existe', 404);
    const p = snap.data() as PedidoDoc;
    const plan = planPago(p, id, u.uid, b, bucket);
    const ahora = FieldValue.serverTimestamp();
    const campos = Object.fromEntries(Object.entries(plan.campos).map(([k, v]) => [k, esAhora(v) || v === '__ahora__' ? ahora : v]));
    tx.update(ref, { ...campos, updatedAt: ahora });
    const e = etapaDe(p);
    tx.set(ref.collection('historial').doc(), {
      at: ahora, por: u.email || u.uid, rol: 'cliente', accion: 'pago',
      de: { etapa: e.etapa, excepcion: e.excepcion }, a: { etapa: e.etapa, excepcion: e.excepcion },
      motivo: null, status: p.status ?? null, version: Number(p.version) || 0,
      metodo: (plan.campos.payment as string) ?? null, adelantado: plan.adelantado,
    });
    return {
      id, metodo: plan.campos.payment, total: plan.total, adelantado: plan.adelantado,
      cambio: (plan.campos.cashChange as number | null | undefined) ?? null,
      faltaComprobante: plan.faltaComprobante,
    };
  });
}

// ─── Fidelización (espejo de registerLoyaltyDelivery en src/services/firebase.js) ──
// Cada 10 domicilios entregados (1 por día, solo domicilio y cliente con cuenta)
// gana 1 premio por sede. Máximo 3 disponibles; al llegar a 30 se reinicia.
// Los premios vencen a los 60 días.
const META = 10, CICLO = 30, MAX_PREMIOS = 3, VENCE_MS = 60 * 24 * 3600 * 1000;

async function registrarFidelizacion(p: PedidoDoc) {
  if (!p.clientUid || !p.clientEmail || p.deliveryMode === 'pickup' || !p.sedeId) return;
  const db = firestore();
  const cliente = db.doc(`customers/${p.clientUid}`);
  const hoy = hoyColombia();
  const nuevo = await db.runTransaction(async (tx) => {
    const d = (await tx.get(cliente)).data() || {};
    const l = d.loyalty?.[p.sedeId] || {};
    if (l.lastCountedDate === hoy) return null;
    const siguiente = (Number(l.count) || 0) + 1;
    tx.set(cliente, { loyalty: { [p.sedeId]: {
      count: siguiente === CICLO ? 0 : siguiente,
      totalDelivered: (Number(l.totalDelivered) || 0) + 1,
      lastCountedDate: hoy,
    } } }, { merge: true });
    return siguiente;
  });
  if (!nuevo || nuevo % META !== 0) return;
  const disponibles = (await cliente.collection('rewards').where('sedeId', '==', p.sedeId).where('status', '==', 'available').get())
    .docs.filter((x) => (x.data().expiresAt?.toMillis?.() ?? Infinity) > Date.now()).length;
  if (disponibles >= MAX_PREMIOS) return;
  const { Timestamp } = await import('firebase-admin/firestore');
  await cliente.collection('rewards').add({
    sedeId: p.sedeId, type: 'hamburguesa_especial', earnedAt: FieldValue.serverTimestamp(),
    expiresAt: Timestamp.fromMillis(Date.now() + VENCE_MS), status: 'available',
    redeemedAt: null, orderId: null, notified: false, cycleReset: nuevo === CICLO,
  });
}

// ─── Acciones de caja y domiciliario (cotizar, asignar, aceptar, cuadre) ──────
type Accion = 'cotizar' | 'asignar' | 'aceptar' | 'cuadre';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function accionCaja(u: Usuario, id: string, accion: Accion, b: any) {
  const db = firestore();
  const ref = db.doc(`orders/${id}`);
  // Datos que se leen fuera de la transacción (no cambian con el pedido).
  const esDomiciliario = accion === 'asignar' ? await domiciliarioExiste(b?.driverEmail) : false;
  return db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    if (!snap.exists) throw new ErrorPedido('no_existe', 'El pedido no existe', 404);
    const p = snap.data() as PedidoDoc;
    const versionActual = Number(p.version) || 0;
    if (b?.version != null && Number(b.version) !== versionActual) {
      throw new ErrorPedido('version', `El pedido cambió mientras tanto (versión ${versionActual}). Recárgalo e intenta de nuevo`, 409);
    }
    // Saldo real usado en este pedido (como saldoVerificado de la web).
    let saldoReal: number | null = null;
    if (accion === 'cotizar' && p.clientUid && (p.saldoAplicado?.ids?.length ?? 0) > 0) {
      const docs = await Promise.all((p.saldoAplicado.ids as string[]).map((cid) => tx.get(db.doc(`customers/${p.clientUid}/credits/${cid}`))));
      saldoReal = docs.filter((d) => d.exists && d.data()?.usadoEnOrderId === id).reduce((t, d) => t + (Number(d.data()?.monto) || 0), 0);
    }
    const plan: PlanCaja = accion === 'cotizar' ? planCotizar(p, u, b, saldoReal)
      : accion === 'asignar' ? planAsignar(p, u, b, esDomiciliario)
      : accion === 'aceptar' ? planAceptar(p, u)
      : planCuadre(p, u);
    const ahora = FieldValue.serverTimestamp();
    const e = etapaDe(p);
    const version = plan.cambiaEtapa ? versionActual + 1 : versionActual;
    tx.update(ref, {
      ...valoresFirestore(plan.campos, ahora),
      ...(plan.cambiaEtapa ? { etapa: plan.etapa, excepcion: null, excepcionMotivo: null, version } : {}),
      updatedAt: ahora,
    });
    if (plan.sobrante > 0 && p.clientUid) {
      tx.set(db.doc(`customers/${p.clientUid}/credits/sob_${id}`), {
        sedeId: p.sedeId || '', monto: plan.sobrante, estado: 'disponible', origenOrderId: id, motivo: 'sobrante',
        creadoPor: u.email || 'caja', createdAt: ahora, usadoEnOrderId: null, usadoAt: null,
      });
    }
    tx.set(ref.collection('historial').doc(), {
      at: ahora, por: u.email || u.uid, rol: accion === 'aceptar' ? 'domiciliario' : 'caja', accion,
      de: { etapa: e.etapa, excepcion: e.excepcion }, a: { etapa: plan.etapa, excepcion: plan.cambiaEtapa ? null : e.excepcion },
      motivo: null, status: (plan.campos.status as string) ?? null, version,
    });
    return { id, etapa: plan.etapa, version, status: plan.campos.status ?? p.status };
  });
}

async function domiciliarioExiste(email: unknown): Promise<boolean> {
  const e = typeof email === 'string' ? email.toLowerCase().trim() : '';
  if (!e) return false;
  if (['cdavid.jaramillo@gmail.com'].includes(e)) return true; // espejo de DEFAULT_DRIVERS
  return (await firestore().doc(`roles_drivers/${e}`).get()).exists;
}

