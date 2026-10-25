/**
 * Eliminar la cuenta del cliente (Fase 4, paso 4; decisión P-25 del 21 oct 2026).
 * Lógica pura; el servicio (cuenta.service.ts) lee y escribe.
 *
 * - Se registra una solicitud y la cuenta se borra a los 30 días. Si vuelve a
 *   entrar antes, puede arrepentirse. Mientras tanto no puede pedir.
 * - Antes de borrar tiene que quedar todo resuelto: pedidos en curso,
 *   devoluciones de pedidos y el saldo a favor, que se le transfiere (la caja
 *   de cada sede lo marca hecho).
 * - Al borrar: los pedidos quedan para la contabilidad, pero sin nombre,
 *   teléfono, correo, dirección ni chat; se borran perfil, premios, saldo y acceso.
 * - Para pedir la eliminación hay que haber iniciado sesión hace poco.
 */
import { FieldValue } from 'firebase-admin/firestore';
import { terminado } from '../../shared/etapas';
import { erroresDatosDevolucion } from '../../shared/devolucion';

export const PLAZO_MS = 30 * 24 * 3600 * 1000;
export const SESION_RECIENTE_MS = 10 * 60 * 1000;
export const MEDIOS = ['Nequi', 'Daviplata', 'Bancolombia', 'Otro banco'];

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Doc = Record<string, any>;

export interface Pendiente {
  tipo: 'pedido_en_curso' | 'devolucion_pedido' | 'devolucion_saldo';
  id: string;
  texto: string;
}

const DEVOLUCION_ABIERTA = ['por_elegir', 'transferencia_sin_datos', 'transferencia_solicitada', 'saldo_solicitado'];
const pesos = (n: number) => `$${Number(n || 0).toLocaleString('es-CO')}`;

/** Lo que falta resolver antes de borrar la cuenta (y lo que se le muestra al cliente). */
export function pendientesDeCuenta(
  pedidos: { id: string; p: Doc }[],
  devolucionesSaldo: { id: string; d: Doc }[] = [],
): Pendiente[] {
  const out: Pendiente[] = [];
  for (const { id, p } of pedidos) {
    const n = p.orderNumber ? ` #${p.orderNumber}` : '';
    if (!terminado(p)) {
      out.push({ tipo: 'pedido_en_curso', id, texto: `Pedido${n} en curso: se borra cuando termine` });
    } else if (DEVOLUCION_ABIERTA.includes(p.devolucion?.estado)) {
      out.push({ tipo: 'devolucion_pedido', id, texto: `Devolución de ${pesos(p.devolucion.monto)} del pedido${n}: la sede la está resolviendo` });
    }
  }
  for (const { id, d } of devolucionesSaldo) {
    if (d.estado !== 'transferida') {
      out.push({ tipo: 'devolucion_saldo', id, texto: `Tu saldo a favor de ${pesos(d.monto)} en ${d.sedeName || d.sedeId}: te lo transferimos` });
    }
  }
  return out;
}

/** Saldo disponible por sede: { santa_lucia: 8000 }. */
export function saldoPorSede(creditos: Doc[]): Record<string, number> {
  const s: Record<string, number> = {};
  for (const c of creditos) {
    if (c.estado !== 'disponible' || !c.sedeId) continue;
    s[c.sedeId] = (s[c.sedeId] || 0) + (Number(c.monto) || 0);
  }
  for (const k of Object.keys(s)) if (s[k] <= 0) delete s[k];
  return s;
}

/** Datos para transferirle el saldo: validados y limpios, o la lista de errores. */
export function datosDevolucion(b: unknown): { datos: Doc } | { errores: string[] } {
  const x = (b && typeof b === 'object' ? b : {}) as Doc;
  const errores: string[] = erroresDatosDevolucion({ medio: x.medio, numero: x.numero, titular: x.titular });
  if (x.medio && !MEDIOS.includes(x.medio)) errores.push('Elige Nequi, Daviplata, Bancolombia u otro banco');
  if (errores.length) return { errores };
  return {
    datos: {
      medio: x.medio,
      numero: String(x.numero).replace(/[^\d]/g, '').slice(0, 20),
      titular: String(x.titular).trim().slice(0, 80),
      documento: x.documento ? String(x.documento).replace(/[^\d]/g, '').slice(0, 15) || null : null,
    },
  };
}

/** ¿Inició sesión hace poco? (eliminar exige confirmar la identidad otra vez). */
export const sesionReciente = (autenticadoAt: number, ahora = Date.now()) => ahora - autenticadoAt < SESION_RECIENTE_MS;

/** ¿Ya se puede borrar? Pasaron los 30 días y no queda nada pendiente. */
export const listaParaBorrar = (ejecutarDesdeMs: number, pendientes: Pendiente[], ahora = Date.now()) =>
  ahora >= ejecutarDesdeMs && pendientes.length === 0;

/**
 * Cómo queda un pedido de una cuenta borrada: sirve para la contabilidad y los
 * reportes, pero ya no dice de quién era.
 */
export function camposAnonimos(): Record<string, unknown> {
  const borrar = FieldValue.delete();
  return {
    name: 'Cliente eliminado',
    clientName: 'Cliente eliminado',
    phone: '',
    fullAddress: '',
    barrio: '',
    reference: '',
    notes: '',
    addrLat: null,
    addrLng: null,
    phoneKey: borrar,
    clientEmail: borrar,
    clientMessages: borrar,
    ratingComment: borrar,
    'devolucion.datos': borrar,
    anonimizadoAt: FieldValue.serverTimestamp(),
  };
}
