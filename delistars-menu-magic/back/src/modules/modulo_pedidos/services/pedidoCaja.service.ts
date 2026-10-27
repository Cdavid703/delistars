import { FieldValue } from 'firebase-admin/firestore';
import { firestore } from '../../../config/firestore';
import { recorrido } from '../../modulo_rutas/services/recorrido.instancia';
import { precioDomicilio, RECORRIDO } from '../../../shared/tarifaDomicilio';
import { armarItems, ErrorPedido } from '../reglas/armado';
import { SEDES } from '../reglas/sedes';
import { camposAsignacion } from '../reglas/domiciliarios';
import { validarPedidoCaja, puedeCrearCaja, pagoCaja } from '../reglas/pedidoCaja';
import type { Usuario } from '../../../middlewares/require-user';
import { catalogo, valoresFirestore, hoyColombia } from './pedidos.service';
import { candidatoPara } from './domiciliarios.service';
import { generarCodigoPedido } from './codigo.service';
import { nuevoTokenDestinatario, indiceDestinatario } from './destinatario.service';

/**
 * POST /pedidos/caja: pedido presencial, por teléfono o WhatsApp desde el
 * catálogo (§10.1). Precios del menú, agotados de la sede, domicilio por
 * recorrido (o el valor que escriba la caja), consecutivo del día. Nace
 * confirmado (la caja ya sabe el total y el pago); a domicilio se asigna solo
 * a quien esté en turno o queda «por asignar». Sin cuenta: se genera el código
 * privado para que el cliente lo siga.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function crearPedidoCaja(u: Usuario, b: any, ip: string) {
  const d = validarPedidoCaja(b);
  puedeCrearCaja(u, d.sedeId);
  const sede = SEDES[d.sedeId];
  const db = firestore();

  const agotados = new Set<number>(((await db.doc(`agotados/${sede.id}`).get()).data()?.ids ?? []).map(Number));
  const { itemsTexto, subtotal } = armarItems(b?.items, await catalogo(), sede.id, Date.now(), agotados);

  // Domicilio: lo que escribió la caja, o por recorrido desde la sede.
  let domicilio: Record<string, unknown> = { deliveryPrice: 0 };
  if (d.modo === 'delivery') {
    if (d.domicilioManual != null) {
      domicilio = { deliveryPrice: d.domicilioManual, deliveryPriceAuto: false };
    } else {
      const r = await recorrido.medir(sede.coords, d.coords, ip);
      if (!r.ok) throw new ErrorPedido('sin_medicion', 'No se pudo calcular el domicilio: escribe el valor a mano', 409);
      const t = precioDomicilio(r.km, RECORRIDO);
      if (t.estado === 'fuera_de_rango') throw new ErrorPedido('fuera_de_cobertura', `Esa dirección está a más de ${t.maxKm} km por calle. Escribe el valor a mano si igual lo llevan`, 409);
      if (t.estado !== 'ok') throw new ErrorPedido('sin_medicion', 'No se pudo calcular el domicilio: escribe el valor a mano', 409);
      domicilio = { deliveryPrice: t.precio, deliveryPriceAuto: true, deliveryKm: Number(r.km.toFixed(2)), deliveryKmMedida: RECORRIDO };
    }
  }
  const total = subtotal + (Number(domicilio.deliveryPrice) || 0);
  const pago = pagoCaja(b?.pago, total, d.destinatario?.paga ?? null);
  // Para otra persona (§7.3): enlace privado de quien recibe, como en el pedido del cliente.
  const destinatario = d.destinatario ? { ...d.destinatario, token: nuevoTokenDestinatario() } : null;
  const candidato = d.modo === 'delivery' ? await candidatoPara(sede.id) : null;

  const orderRef = db.collection('orders').doc();
  const counterRef = db.doc(`counters/orders_${sede.id}`);
  const ahora = FieldValue.serverTimestamp();
  const asignacion: Record<string, unknown> = d.modo !== 'delivery' ? {}
    : candidato ? valoresFirestore(camposAsignacion(candidato, 'automatica'), ahora)
      : { sinDomiciliario: true };

  const orderNumber = await db.runTransaction(async (tx) => {
    const c = (await tx.get(counterRef)).data() || {};
    const hoy = hoyColombia();
    const siguiente = (c.date === hoy ? Number(c.lastNumber) || 0 : 0) + 1;
    const num = String(siguiente).padStart(3, '0');
    tx.set(counterRef, { lastNumber: siguiente, date: hoy }, { merge: true });
    tx.set(orderRef, {
      name: d.nombre, clientName: d.nombre, phone: d.telefono, phoneKey: d.phoneKey,
      deliveryMode: d.modo, fullAddress: d.direccion,
      addrLat: d.coords?.lat ?? null, addrLng: d.coords?.lng ?? null, addrPinFuente: d.coords ? 'google' : null,
      barrio: d.barrio, reference: d.referencia, notes: d.notas,
      items: itemsTexto, fromMenu: true, quotedPrice: subtotal, ...domicilio, totalPrice: total,
      ...pago, transferValidated: false,
      sedeId: sede.id, sedeName: sede.nombre,
      status: 'quoted', etapa: 'confirmado', excepcion: null, excepcionMotivo: null,
      origen: 'caja', canal: d.canal,
      cashierId: u.uid, cashierEmail: u.email || '', cashierName: u.nombre || '',
      quotedAt: ahora, ...asignacion,
      orderNumber: num, version: 1, createdAt: ahora, updatedAt: ahora,
      ...(destinatario ? { destinatario } : {}),
    });
    if (destinatario) tx.set(indiceDestinatario(destinatario.token), { orderId: orderRef.id, creadoAt: ahora });
    if (candidato) tx.set(db.doc(`turnos_domiciliario/${candidato.email}`), { ultimaAsignacionAt: ahora }, { merge: true });
    tx.set(orderRef.collection('historial').doc(), {
      at: ahora, por: u.email || u.uid, rol: 'caja', accion: 'crear',
      de: null, a: { etapa: 'confirmado', excepcion: null }, status: candidato ? 'accepted' : 'quoted', version: 1, canal: d.canal,
    });
    return num;
  });

  // Código privado para seguirlo sin cuenta (si falla, se genera desde el detalle).
  const codigo = await generarCodigoPedido(u, orderRef.id).then((r) => r.codigo).catch(() => null);
  return {
    id: orderRef.id, orderNumber, etapa: 'confirmado', subtotal, deliveryPrice: Number(domicilio.deliveryPrice) || 0, total,
    items: itemsTexto, domiciliario: candidato ? candidato.nombre || candidato.email : null, codigo,
    // Para compartir con quien recibe: /domicilios/?recibe=<token>.
    destinatario: destinatario ? { nombre: destinatario.nombre, telefono: destinatario.telefono, paga: destinatario.paga, token: destinatario.token } : null,
  };
}
