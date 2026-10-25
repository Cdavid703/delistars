import { FieldValue, Timestamp } from 'firebase-admin/firestore';
import { firestore } from '../../../config/firestore';
import { ErrorPedido } from '../reglas/armado';
import { siguienteEstado, elegirDomiciliario, EN_REPARTO, POR_RECOGER, Candidato, EstadoTurno, revisarOrdenRuta } from '../reglas/domiciliarios';
import type { Usuario } from '../../../middlewares/require-user';

/**
 * Turno del domiciliario (Fase 5). Se guarda en turnos_domiciliario/{correo}:
 * { estado: activo | pausa | fuera, sedes, nombre, telefono, desde, ultimaAsignacionAt }.
 * Solo el servidor escribe; la caja y el domiciliario lo leen en Firestore.
 */
const NOMBRES_FIJOS: Record<string, string> = { 'cdavid.jaramillo@gmail.com': 'Carlos David Jaramillo' };
const ms = (t: unknown) => (t as Timestamp | undefined)?.toMillis?.() ?? null;

async function datosDe(email: string) {
  const d = (await firestore().doc(`roles_drivers/${email}`).get()).data() || {};
  return { nombre: d.name || d.nombre || NOMBRES_FIJOS[email] || email, telefono: d.phone || d.telefono || null };
}

/** Pedidos que lleva ahora: en reparto (en camino o llegó) y por recoger. */
export async function cargaDe(email: string) {
  const db = firestore();
  const [reparto, recoger] = await Promise.all([
    db.collection('orders').where('driverEmail', '==', email).where('status', 'in', EN_REPARTO).get(),
    db.collection('orders').where('driverEmail', '==', email).where('status', 'in', POR_RECOGER).get(),
  ]);
  return { enReparto: reparto.size, porRecoger: recoger.size, idsEnReparto: reparto.docs.map((d) => d.id) };
}

export async function cambiarTurno(u: Usuario, accion: unknown) {
  if (!u.esDomiciliario || !u.email) throw new ErrorPedido('sin_permiso', 'Solo para domiciliarios', 403);
  const db = firestore();
  const ref = db.doc(`turnos_domiciliario/${u.email}`);
  const actual = (await ref.get()).data();
  const estado = siguienteEstado(actual?.estado as EstadoTurno | undefined, accion);
  const datos = await datosDe(u.email);
  const carga = await cargaDe(u.email);
  await ref.set({
    email: u.email, ...datos, estado, sedes: u.sedes?.domiciliario ?? [],
    ...(estado === 'activo' && actual?.estado !== 'activo' && actual?.estado !== 'pausa' ? { desde: FieldValue.serverTimestamp() } : {}),
    ...(estado === 'fuera' ? { desde: null } : {}),
    actualizadoAt: FieldValue.serverTimestamp(),
  }, { merge: true });
  return {
    estado, enReparto: carga.enReparto, porRecoger: carga.porRecoger,
    // Al terminar con pedidos encima: no recibe más, pero esos siguen siendo suyos.
    aviso: estado === 'fuera' && carga.enReparto + carga.porRecoger > 0
      ? 'Terminaste el turno: no te llegan pedidos nuevos, pero termina los que tienes (o pídele a la caja que los reasigne)'
      : null,
  };
}

/** Guarda el orden manual de la ruta del domiciliario (CP-7). [] lo borra. */
export async function guardarOrdenRuta(u: Usuario, ids: unknown) {
  if (!u.esDomiciliario || !u.email) throw new ErrorPedido('sin_permiso', 'Solo para domiciliarios', 403);
  const ordenRuta = revisarOrdenRuta(ids);
  await firestore().doc(`turnos_domiciliario/${u.email}`).set({
    ordenRuta, ordenRutaAt: FieldValue.serverTimestamp(),
  }, { merge: true });
  return { ordenRuta };
}

/** Quién recibe un domicilio nuevo de esa sede ahora mismo (o null). */
export async function candidatoPara(sedeId: string): Promise<Candidato | null> {
  const turnos = await firestore().collection('turnos_domiciliario').where('estado', '==', 'activo').get();
  const candidatos: Candidato[] = await Promise.all(turnos.docs.map(async (d) => {
    const t = d.data();
    const carga = await cargaDe(d.id);
    return {
      email: d.id, nombre: t.nombre || d.id, telefono: t.telefono || null, estado: t.estado,
      sedes: Array.isArray(t.sedes) ? t.sedes : [], ultimaAsignacionMs: ms(t.ultimaAsignacionAt),
      enReparto: carga.enReparto, porRecoger: carga.porRecoger,
    };
  }));
  return elegirDomiciliario(candidatos, sedeId);
}
