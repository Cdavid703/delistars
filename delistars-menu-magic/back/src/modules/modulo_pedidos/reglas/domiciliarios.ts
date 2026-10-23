/**
 * Turno del domiciliario y asignación automática (Fase 5; especificación §11,
 * decisiones del 22 oct 2026). Lógica pura.
 *
 * - Iniciar, pausar, reanudar y terminar el turno son acciones explícitas.
 * - Al confirmar un domicilio, el servidor se lo asigna solo a quien esté en
 *   turno, sin pausa y habilitado para la sede, sin que tenga que aceptarlo.
 *   Entre varios: el de menos pedidos en reparto, luego menos por recoger,
 *   luego el que lleva más tiempo sin recibir uno.
 * - Si nadie está en turno, el pedido queda "sin domiciliario" y la caja decide
 *   (puede asignarlo igual a mano).
 * - Máximo 5 pedidos a la vez en reparto (en camino o llegó). Los que están
 *   por recoger no cuentan.
 */
import { ErrorPedido } from './armado';

export const MAX_EN_REPARTO = 5;
export const EN_REPARTO = ['in_transit', 'arrived'];
export const POR_RECOGER = ['assigned', 'accepted', 'preparing'];

export type EstadoTurno = 'activo' | 'pausa' | 'fuera';
export type AccionTurno = 'iniciar' | 'pausar' | 'reanudar' | 'terminar';

const TEXTO: Record<EstadoTurno, string> = { activo: 'en turno', pausa: 'en pausa', fuera: 'fuera de turno' };

/** Estado nuevo del turno, o error si la acción no aplica. */
export function siguienteEstado(actual: EstadoTurno | undefined, accion: unknown): EstadoTurno {
  const a = actual ?? 'fuera';
  switch (accion) {
    case 'iniciar':
      return 'activo';
    case 'reanudar':
      if (a !== 'pausa') throw new ErrorPedido('turno', `No estás en pausa (estás ${TEXTO[a]})`, 409);
      return 'activo';
    case 'pausar':
      if (a !== 'activo') throw new ErrorPedido('turno', `Para pausar primero inicia el turno (estás ${TEXTO[a]})`, 409);
      return 'pausa';
    case 'terminar':
      return 'fuera';
    default:
      throw new ErrorPedido('turno', 'Acción no válida: iniciar, pausar, reanudar o terminar');
  }
}

export interface Candidato {
  email: string;
  nombre: string;
  telefono: string | null;
  estado: EstadoTurno;
  sedes: string[];
  ultimaAsignacionMs: number | null;
  enReparto: number;
  porRecoger: number;
}

/** A quién se le asigna un domicilio de esa sede (o null: nadie en turno). */
export function elegirDomiciliario(candidatos: Candidato[], sedeId: string): Candidato | null {
  const validos = candidatos.filter((c) => c.estado === 'activo' && (!c.sedes.length || c.sedes.includes(sedeId)));
  validos.sort((a, b) =>
    a.enReparto - b.enReparto
    || a.porRecoger - b.porRecoger
    || (a.ultimaAsignacionMs ?? 0) - (b.ultimaAsignacionMs ?? 0)
    || a.email.localeCompare(b.email));
  return validos[0] ?? null;
}

/** ¿Puede salir con un pedido más? (máximo 5 en reparto). */
export function revisarCapacidad(enRepartoSinEste: number) {
  if (enRepartoSinEste >= MAX_EN_REPARTO) {
    throw new ErrorPedido('capacidad', `Ya llevas ${MAX_EN_REPARTO} pedidos en reparto: entrega alguno antes de salir con otro`, 409);
  }
}

/** Campos del pedido al asignarlo sin aceptación (automática o a mano por la caja). */
export function camposAsignacion(c: { email: string; nombre: string; telefono: string | null }, como: 'automatica' | 'manual') {
  return {
    status: 'accepted',
    driverEmail: c.email,
    driverName: c.nombre || c.email,
    driverPhone: c.telefono,
    asignacion: como,
    sinDomiciliario: false,
    assignedAt: '__ahora__',
    acceptedAt: '__ahora__',
  };
}
