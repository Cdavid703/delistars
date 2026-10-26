import { FieldValue } from 'firebase-admin/firestore';
import { firestore } from '../../../config/firestore';
import { ProductsRepository } from '../../modulo_products/repositories/products.repository';
import { recorrido } from '../../modulo_rutas/services/recorrido.instancia';
import { estadoSede } from '../../../shared/horarios';
import { etapaDe } from '../../../shared/etapas';
import { precioDomicilio, RECORRIDO } from '../../../shared/tarifaDomicilio';
import { armarItems, ErrorPedido, ProductoCatalogo } from '../reglas/armado';
import { planTransicion, esAhora, PedidoDoc, rolesDe, yaEsta } from '../reglas/transiciones';
import { planPago } from '../reglas/pago';
import { planCotizar, planAsignar, planAceptar, planCuadre, PlanCaja } from '../reglas/caja';
import { elegirPremios, lineaPremio, revisarCodigo, lineaCodigo, elegirSaldo, aplicarSaldo, limiteDeSaldo, Premio, Credito } from '../reglas/beneficios';
import { SEDES, normalizarTelefono, coordsValidas } from '../reglas/sedes';
import type { Usuario } from '../../../middlewares/require-user';
import { eliminacionPendiente } from '../../modulo_cuenta/cuenta.service';
import { candidatoPara, cargaDe } from './domiciliarios.service';
import { camposAsignacion, revisarCapacidad, Candidato } from '../reglas/domiciliarios';
import { revisarEditor, planEditor } from '../reglas/editor';
import { validarPropuesta, camposAlAceptar, camposAlRechazar, validarAgregado, camposAlAgregar, idPropuesta, revisarRespuesta, validarDireccionPropuesta, direccionAnterior, DireccionPropuesta } from '../reglas/cambios';
import { validarMensaje } from '../reglas/chat';
import { atribuible } from '../../modulo_mercadeo/campanas.reglas';
import { revisarDestinatario } from '../../../shared/destinatario';
import { nuevoTokenDestinatario, indiceDestinatario } from './destinatario.service';

/** Marcadores del plan → valores de Firestore ('__ahora__' y '__union:<campo>'). */
export function valoresFirestore(extras: Record<string, unknown>, ahora: FieldValue): Record<string, unknown> {
  // También dentro de objetos (ej. incidencia.at, CP-1).
  const valor = (v: unknown): unknown => {
    if (esAhora(v) || v === '__ahora__') return ahora;
    if (v && typeof v === 'object' && !Array.isArray(v) && Object.getPrototypeOf(v) === Object.prototype) {
      return Object.fromEntries(Object.entries(v as Record<string, unknown>).map(([k, x]) => [k, valor(x)]));
    }
    return v;
  };
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(extras)) {
    if (k.startsWith('__union:')) out[k.slice('__union:'.length)] = FieldValue.arrayUnion(v);
    else out[k] = valor(v);
  }
  return out;
}

const a_confirmado = (plan: { etapa: string; excepcion: string | null }) => plan.etapa === 'confirmado' && !plan.excepcion;

const FUENTES_PIN = ['mapa', 'google', 'photon', 'app'];

const texto = (v: unknown, max: number) => (typeof v === 'string' ? v.trim().slice(0, max) : '');

/** Fecha de hoy en Colombia (yyyy-mm-dd), para el consecutivo diario por sede. */
export const hoyColombia = () => new Date(Date.now() - 5 * 3600 * 1000).toISOString().slice(0, 10);

export async function catalogo(): Promise<ProductoCatalogo[]> {
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
  // Confirmar el correo ya no es obligatorio para pedir (25 oct 2026): el enlace
  // de Firebase no les llegaba a algunos clientes (Hotmail) y no podían comprar.
  // Pidió eliminar su cuenta: mientras corre el plazo no puede pedir (puede arrepentirse en Mi cuenta).
  if (await eliminacionPendiente(u.uid)) {
    throw new ErrorPedido('cuenta_en_eliminacion', 'Pediste eliminar tu cuenta. Para pedir, cancela la eliminación en «Mi cuenta»', 409);
  }
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
  // Lo recibe otra persona (§7.3): sus datos aparte; los del comprador se conservan.
  const rd = revisarDestinatario(b?.destinatario, { deliveryMode: modo });
  if (!rd.ok) throw new ErrorPedido(`destinatario_${rd.campo}`, rd.error ?? 'Revisa los datos de quien recibe');
  const destinatario = rd.destinatario ? { ...rd.destinatario, token: nuevoTokenDestinatario() } : null;

  const db = firestore();
  const horarios = (await db.doc('config/horarios').get()).data() || null;
  if (!estadoSede(horarios?.[sede.id], Date.now()).abierta) {
    throw new ErrorPedido('sede_cerrada', `${sede.nombre} no está recibiendo pedidos en este momento`, 409);
  }

  // Agotados de esta sede (los marca la caja): no se pueden pedir.
  const agotados = new Set<number>(((await db.doc(`agotados/${sede.id}`).get()).data()?.ids ?? []).map(Number));
  const { itemsTexto, subtotal } = armarItems(b?.items, await catalogo(), sede.id, Date.now(), agotados);

  // Código promocional: una vez por cuenta (se busca en sus pedidos, como la web).
  const codigoPedido = b?.codigo ? String(b.codigo).trim().toUpperCase() : '';
  const yaLoUso = codigoPedido
    ? !(await db.collection('orders').where('clientUid', '==', u.uid).where('codigoPromo', '==', codigoPedido).limit(1).get()).empty
    : false;
  const codigo = revisarCodigo(b?.codigo, itemsTexto, yaLoUso);

  // Domicilio: con ubicación se cobra por recorrido (C1); sin ella, lo cotiza la caja.
  // `revisarDomicilio`: el cliente pidió que la caja revise el valor (se cotiza a mano).
  const revisar = modo === 'delivery' && b?.revisarDomicilio === true;
  let domicilio: Record<string, unknown> = revisar ? { deliveryPriceReview: true } : {};
  if (coords && !revisar) {
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

  // Atribución a una campaña de Mercadeo (§17.4): la última que abrió de esta
  // sede en las 24 h anteriores. El aparato manda { id, abiertaAt }.
  let campana: { id: string; abiertaAt: number } | null = null;
  const cb = b?.campana;
  if (cb && typeof cb.id === 'string' && /^[A-Za-z0-9]{10,40}$/.test(cb.id)) {
    const cd = await db.doc(`campanas/${cb.id}`).get().catch(() => null);
    if (cd?.exists && atribuible(cd.data() || null, sede.id, Number(cb.abiertaAt) || 0)) campana = { id: cb.id, abiertaAt: Number(cb.abiertaAt) };
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
    // De dónde salió el pin: lo que diga la web ('mapa', 'google', 'photon') o 'app'.
    addrPinFuente: coords ? (FUENTES_PIN.includes(b?.pinFuente) ? b.pinFuente : 'app') : null,
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
    // De dónde llegó: la web de domicilios manda 'web'; la app móvil, 'app' (o nada).
    origen: b?.origen === 'web' ? 'web' : 'app',
    // `ventas`: lo que sumó a la campaña, para restarlo si no se vende (cancelado, rechazado, devuelto).
    ...(campana ? { campana: { ...campana, ventas: subtotal } } : {}),
    ...(destinatario ? { destinatario } : {}),
    version: 1,
    createdAt: ahora,
    updatedAt: ahora,
  };

  const beneficios = { premios: 0, saldo: null as null | { ids: string[]; monto: number } };
  const limiteSaldo = limiteDeSaldo(b?.usarSaldo);
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
      // Saldo por partes (§14.3): `limite` = cuánto eligió usar; sin él, todo lo posible.
      ...(saldo ? { saldoAplicado: { ids: saldo.ids, monto: saldo.monto, ...(limiteSaldo != null ? { limite: limiteSaldo } : {}) } } : {}),
      orderNumber: num,
    });
    for (const id of premioIds) {
      tx.update(cliente.collection('rewards').doc(id), { status: 'redeemed', redeemedAt: ahora, orderId: orderRef.id });
    }
    for (const id of saldo?.ids ?? []) {
      tx.update(cliente.collection('credits').doc(id), { estado: 'usado', usadoEnOrderId: orderRef.id, usadoAt: ahora });
    }
    if (destinatario) tx.set(indiceDestinatario(destinatario.token), { orderId: orderRef.id, creadoAt: ahora });
    tx.set(orderRef.collection('historial').doc(), {
      at: ahora, por: u.email, rol: 'cliente', accion: 'crear',
      de: null, a: { etapa: 'enviado', excepcion: null }, status: 'pending', version: 1,
    });
    return num;
  });

  // Perfil del cliente frecuente (igual que la web; no bloquea la respuesta).
  db.doc(`customers/${u.uid}`).set({
    uid: u.uid, name: nombre, email: u.email, phone: pedido.phone,
    // La dirección de otra persona no se guarda entre las del comprador.
    ...(pedido.fullAddress && !destinatario ? { addresses: FieldValue.arrayUnion(pedido.fullAddress) } : {}),
    lastOrderAt: ahora, orderCount: FieldValue.increment(1),
  }, { merge: true }).catch(() => undefined);
  // Métricas de la campaña: pedidos atribuidos y su valor en productos (al crearse).
  if (campana) {
    db.doc(`campanas/${campana.id}`).update({ 'metricas.pedidos': FieldValue.increment(1), 'metricas.ventas': FieldValue.increment(subtotal) }).catch(() => undefined);
  }

  const bruto = domicilio.deliveryPrice != null || modo === 'pickup' ? subtotal + ((domicilio.deliveryPrice as number) || 0) : null;
  const saldoCalc = bruto != null && beneficios.saldo ? aplicarSaldo(bruto, beneficios.saldo.monto, limiteSaldo) : null;
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
    // Para compartir con quien recibe: /domicilios/?recibe=<token>.
    destinatario: destinatario ? { nombre: destinatario.nombre, paga: destinatario.paga, token: destinatario.token } : null,
  };
}

/** Mueve un pedido de etapa (o le pone una excepción) con control de versión. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function transicionar(u: Usuario, id: string, b: any) {
  const db = firestore();
  const ref = db.doc(`orders/${id}`);
  // Salir a entregar: máximo 5 pedidos a la vez en reparto (Fase 5).
  if (b?.a === 'en_camino' && u.esDomiciliario && u.email) {
    const carga = await cargaDe(u.email);
    revisarCapacidad(carga.idsEnReparto.filter((x) => x !== id).length);
  }
  return db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    if (!snap.exists) throw new ErrorPedido('no_existe', 'El pedido no existe', 404);
    const p = snap.data() as PedidoDoc;
    const versionActual = Number(p.version) || 0;
    // Ya está así (un reintento tras un corte, CP-5): se responde lo que hay, sin repetir nada.
    if (rolesDe(u, p).length && yaEsta(p, String(b?.a || ''), b?.motivo)) {
      const e = etapaDe(p);
      return { id, etapa: e.etapa, excepcion: e.excepcion, version: versionActual, sinCambios: true, entregaDomicilio: null, campanaARestar: null };
    }
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
    // Pedido de campaña que no se vendió (decisión del 25 oct 2026): sale de sus métricas, una sola vez.
    const restarCampana = !!p.campana?.id && !p.campana.descontada && e.excepcion !== plan.excepcion &&
      ['cancelado', 'rechazado', 'devuelto'].includes(plan.excepcion ?? '');
    if (restarCampana) extras['campana.descontada'] = true;
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
    return {
      id, etapa: plan.etapa, excepcion: plan.excepcion, version,
      entregaDomicilio: plan.etapa === 'entregado' && e.tipo === 'domicilio' ? p : null,
      campanaARestar: restarCampana ? { id: p.campana.id as string, ventas: Number(p.campana.ventas ?? p.quotedPrice) || 0 } : null,
    };
  }).then(async (r) => {
    if (r.campanaARestar) {
      firestore().doc(`campanas/${r.campanaARestar.id}`).update({
        'metricas.pedidos': FieldValue.increment(-1), 'metricas.ventas': FieldValue.increment(-r.campanaARestar.ventas),
      }).catch(() => undefined);
    }
    // Fidelización: cuenta la entrega (best-effort, nunca rompe la entrega).
    if (r.entregaDomicilio) await registrarFidelizacion(r.entregaDomicilio).catch((err) => console.error('[pedidos] fidelización:', err?.message || err));
    const { entregaDomicilio: _e, campanaARestar: _c, ...resto } = r;
    return resto;
  });
}

// ─── Cambios al pedido (Fase 7, §9.2) ───────────────────────────────────────

/** La caja propone un cambio: queda «cambio pendiente» y la propuesta aparte; el original no se toca. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function proponerCambio(u: Usuario, id: string, b: any, ip = '') {
  const db = firestore();
  const ref = db.doc(`orders/${id}`);
  // Dirección nueva (W-5): se mide el recorrido desde la sede del pedido ANTES de
  // la transacción (es una llamada a Google). Fuera de cobertura o sin poder
  // medir → no se propone: la caja no puede inventar la tarifa.
  let dir: DireccionPropuesta | undefined;
  if (b?.direccion != null) {
    const snap = await ref.get();
    if (!snap.exists) throw new ErrorPedido('no_existe', 'El pedido no existe', 404);
    const p0 = snap.data() as PedidoDoc;
    const d = validarDireccionPropuesta(p0, b.direccion);
    const sede = SEDES[String(p0.sedeId)];
    if (!sede) throw new ErrorPedido('sede', 'El pedido no tiene una sede válida', 409);
    const r = await recorrido.medir(sede.coords, d.coords, ip);
    if (!r.ok) throw new ErrorPedido('sin_medicion', 'No se pudo medir el recorrido hasta esa dirección. Intenta de nuevo', 409);
    const t = precioDomicilio(r.km, RECORRIDO);
    if (t.estado === 'fuera_de_rango') throw new ErrorPedido('fuera_de_cobertura', `Esa dirección está fuera de cobertura: solo llevamos hasta ${t.maxKm} km por calle`, 409);
    if (t.estado !== 'ok') throw new ErrorPedido('sin_medicion', 'No se pudo calcular la tarifa de esa dirección', 409);
    dir = { fullAddress: d.fullAddress, barrio: d.barrio, reference: d.reference, addrLat: d.coords.lat, addrLng: d.coords.lng, deliveryKm: Number(r.km.toFixed(2)), precio: t.precio };
  }
  return db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    if (!snap.exists) throw new ErrorPedido('no_existe', 'El pedido no existe', 404);
    const p = snap.data() as PedidoDoc;
    const versionActual = Number(p.version) || 0;
    if (b?.version != null && Number(b.version) !== versionActual) {
      throw new ErrorPedido('version', `El pedido cambió mientras tanto (versión ${versionActual}). Recárgalo e intenta de nuevo`, 409);
    }
    // Quién puede y desde qué etapa lo decide el modelo de etapas (caja, antes de preparar).
    const plan = planTransicion(p, 'excepcion:cambio_pendiente', u, b?.motivo);
    const c = validarPropuesta(p, b, dir);
    const ahora = FieldValue.serverTimestamp();
    const version = versionActual + 1;
    const e = etapaDe(p);
    tx.update(ref, {
      etapa: plan.etapa, excepcion: 'cambio_pendiente', excepcionMotivo: c.motivo, version, updatedAt: ahora,
      cambioPropuesto: {
        ...c, id: idPropuesta(), estado: 'pendiente', propuestoPor: u.email || u.uid, propuestoAt: ahora,
        anterior: {
          items: p.items ?? '', quotedPrice: p.quotedPrice ?? null, deliveryPrice: p.deliveryPrice ?? null, totalPrice: p.totalPrice ?? null,
          ...(c.direccion ? { direccion: direccionAnterior(p) } : {}),
        },
      },
    });
    tx.set(ref.collection('historial').doc(), {
      at: ahora, por: u.email || u.uid, rol: 'caja', accion: 'proponer_cambio',
      de: { etapa: e.etapa, excepcion: e.excepcion }, a: { etapa: plan.etapa, excepcion: 'cambio_pendiente' },
      motivo: c.motivo, status: p.status ?? null, version,
    });
    return { id, etapa: plan.etapa, excepcion: 'cambio_pendiente', version, totalPropuesto: c.totalPrice };
  });
}

/** El cliente acepta (se aplica) o rechaza (queda el original) el cambio propuesto. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function responderCambio(u: Usuario, id: string, b: any) {
  const db = firestore();
  const ref = db.doc(`orders/${id}`);
  return db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    if (!snap.exists) throw new ErrorPedido('no_existe', 'El pedido no existe', 404);
    const p = snap.data() as PedidoDoc;
    if (!p.clientUid || p.clientUid !== u.uid) throw new ErrorPedido('sin_permiso', 'Solo el cliente del pedido responde al cambio', 403);
    const e = etapaDe(p);
    revisarRespuesta(p, b);
    const acepta = b?.acepta === true;
    const ahora = FieldValue.serverTimestamp();
    const version = (Number(p.version) || 0) + 1;
    const campos = acepta ? camposAlAceptar(p, p.cambioPropuesto) : camposAlRechazar();
    tx.update(ref, { ...valoresFirestore(campos, ahora), excepcion: null, excepcionMotivo: null, version, updatedAt: ahora });
    tx.set(ref.collection('historial').doc(), {
      at: ahora, por: u.email || u.uid, rol: 'cliente', accion: acepta ? 'aceptar_cambio' : 'rechazar_cambio',
      de: { etapa: e.etapa, excepcion: 'cambio_pendiente' }, a: { etapa: e.etapa, excepcion: null },
      motivo: null, status: p.status ?? null, version,
    });
    return { id, aceptado: acepta, etapa: e.etapa, version, propuestaId: p.cambioPropuesto?.id ?? null };
  });
}

/** El cliente agrega algo a su pedido mientras está en Enviado (la caja lo cotiza con eso). */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function agregarProducto(u: Usuario, id: string, b: any) {
  const db = firestore();
  const ref = db.doc(`orders/${id}`);
  return db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    if (!snap.exists) throw new ErrorPedido('no_existe', 'El pedido no existe', 404);
    const p = snap.data() as PedidoDoc;
    if (!p.clientUid || p.clientUid !== u.uid) throw new ErrorPedido('sin_permiso', 'Solo el cliente del pedido agrega productos', 403);
    const t = validarAgregado(p, b?.texto);
    const ahora = FieldValue.serverTimestamp();
    tx.update(ref, { ...valoresFirestore(camposAlAgregar(p, t, u.nombre), ahora), updatedAt: ahora });
    tx.set(ref.collection('historial').doc(), {
      at: ahora, por: u.email || u.uid, rol: 'cliente', accion: 'agregar',
      de: { etapa: 'enviado', excepcion: null }, a: { etapa: 'enviado', excepcion: null },
      motivo: t, status: p.status ?? null, version: Number(p.version) || 0,
    });
    return { id, agregado: t };
  });
}

/**
 * Mensaje en uno de los dos chats del pedido (§8.3). El canal 'caja' sigue en
 * `clientMessages` (la forma que ya lee la app); el canal 'domiciliario' va a la
 * subcolección `chat_domiciliario`, que la caja no puede leer. Las reglas de
 * quién escribe y hasta cuándo están en reglas/chat.ts.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function enviarMensaje(u: Usuario, id: string, b: any) {
  const db = firestore();
  const ref = db.doc(`orders/${id}`);
  const snap = await ref.get();
  if (!snap.exists) throw new ErrorPedido('no_existe', 'El pedido no existe', 404);
  const p = snap.data() as PedidoDoc;
  const bucket = process.env.VITE_FIREBASE_STORAGE_BUCKET || '';
  const { canal, mensaje } = validarMensaje(p, u, b?.canal, b?.texto, Date.now(), { foto: b?.foto, orderId: id, bucket });
  const ahora = FieldValue.serverTimestamp();
  if (canal === 'caja') {
    await ref.update({ clientMessages: FieldValue.arrayUnion(mensaje), updatedAt: ahora });
  } else {
    await ref.collection('chat_domiciliario').add({ ...mensaje, at: ahora });
  }
  return { id, canal, mensaje };
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
  // Al confirmar un domicilio sin domiciliario: a quién se le asigna solo (Fase 5).
  let candidato: Candidato | null = null;
  if (accion === 'cotizar') {
    const previo = (await ref.get()).data();
    if (previo && previo.deliveryMode !== 'pickup' && !previo.driverEmail && previo.sedeId) candidato = await candidatoPara(previo.sedeId);
  }
  return db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    if (!snap.exists) throw new ErrorPedido('no_existe', 'El pedido no existe', 404);
    const p = snap.data() as PedidoDoc;
    const versionActual = Number(p.version) || 0;
    if (b?.version != null && Number(b.version) !== versionActual) {
      throw new ErrorPedido('version', `El pedido cambió mientras tanto (versión ${versionActual}). Recárgalo e intenta de nuevo`, 409);
    }
    // Un solo editor (§10.3): cotizar, asignar y cuadrar los hace quien tiene el control.
    if (accion !== 'aceptar') revisarEditor(p, u);
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
    if (accion === 'cotizar' && p.deliveryMode !== 'pickup' && !p.driverEmail) {
      if (candidato) {
        Object.assign(plan.campos, camposAsignacion(candidato, 'automatica'));
        tx.set(db.doc(`turnos_domiciliario/${candidato.email}`), { ultimaAsignacionAt: ahora }, { merge: true });
      } else {
        // Nadie en turno: la caja lo ve y decide (puede asignarlo igual a mano).
        plan.campos.sinDomiciliario = true;
      }
    }
    if (accion === 'asignar' && plan.campos.driverEmail) {
      tx.set(db.doc(`turnos_domiciliario/${plan.campos.driverEmail}`), { ultimaAsignacionAt: ahora }, { merge: true });
    }
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

/**
 * POST /pedidos/:id/editor { accion: 'tomar' | 'soltar', motivo? } (§10.3).
 * Caja de la sede o admin. Tomar el control de otro exige motivo, queda en el
 * historial y se le avisa al anterior en su campana.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function editorPedido(u: Usuario, id: string, b: any) {
  const db = firestore();
  const ref = db.doc(`orders/${id}`);
  const r = await db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    if (!snap.exists) throw new ErrorPedido('no_existe', 'El pedido no existe', 404);
    const p = snap.data() as PedidoDoc;
    const roles = rolesDe(u, p);
    if (!roles.includes('caja') && !roles.includes('admin')) throw new ErrorPedido('sin_permiso', 'Solo la caja de la sede o administración editan el pedido', 403);
    const plan = planEditor(p, { uid: u.uid, email: u.email, nombre: u.nombre || u.email }, b?.accion, b?.motivo);
    if (!plan.cambio) return { plan, p };
    const ahora = FieldValue.serverTimestamp();
    tx.update(ref, { editor: plan.editor ? { ...plan.editor, desde: ahora } : null, updatedAt: ahora });
    if (plan.accion === 'tomar_control') {
      tx.set(ref.collection('historial').doc(), {
        at: ahora, por: u.email || u.uid, rol: 'caja', accion: 'tomar_control',
        de: null, a: null, motivo: plan.motivo, anterior: plan.anterior?.email ?? null, status: p.status ?? null, version: Number(p.version) || 0,
      });
    }
    return { plan, p };
  });
  // Aviso al que perdió el control (centro de avisos). Si falla, el cambio de control ya quedó.
  if (r.plan.cambio && r.plan.accion === 'tomar_control' && r.plan.anterior?.email) {
    const n = r.p.orderNumber ? ` #${r.p.orderNumber}` : '';
    await db.doc(`avisos/${r.plan.anterior.email.toLowerCase()}/items/control-${id}-${Date.now()}`).set({
      tipo: 'pedido', titulo: `${u.nombre || u.email} tomó el control del pedido${n}`, cuerpo: `Motivo: ${r.plan.motivo}`,
      pedidoId: id, enlace: null, leido: false, creadoAt: FieldValue.serverTimestamp(),
    }).catch(() => undefined);
  }
  const e = r.plan.cambio ? r.plan.editor : (r.p.editor ?? null);
  return { id, editor: e ? { uid: e.uid, email: e.email, nombre: e.nombre } : null, cambio: r.plan.cambio };
}
