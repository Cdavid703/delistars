import { ErrorPedido } from '../modulo_pedidos/reglas/armado';
import type { Usuario } from '../../middlewares/require-user';
import { contenidoComanda, textoComanda, EN_COLA, ANTIGUA_MS, AMBIGUO_MS } from '../../shared/comanda';

/**
 * Impresión de comandas (especificación §19). Reglas puras; el ciclo de un
 * trabajo está descrito en shared/comanda.js. Lo que importa aquí:
 *  - un pedido no tiene dos trabajos en cola a la vez (un toque repetido por
 *    la red no imprime dos veces);
 *  - una comanda vigente ya impresa solo se repite como COPIA con motivo;
 *  - si el pedido cambió, la nueva sale como ACTUALIZADA;
 *  - un trabajo viejo no sale solo: la caja confirma el reintento.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type Doc = Record<string, any>;

const correo = (u: Usuario) => (u.email || '').toLowerCase();
const cajaDeSede = (u: Usuario, sedeId: string) => u.esAdmin || (u.esCaja && (u.sedes?.caja ?? []).includes(sedeId));
const exigirCaja = (u: Usuario, sedeId: string) => {
  if (!sedeId || !cajaDeSede(u, sedeId)) throw new ErrorPedido('sin_permiso', 'Solo la caja de la sede imprime comandas', 403);
};
const diaColombia = (ms: number) => new Date(ms - 5 * 3600 * 1000).toISOString().slice(0, 10);
const TERMINADOS = ['cancelled', 'rejected'];

function trabajo(base: Doc, lineas: Doc[], ahora: number): Doc {
  return {
    ...base, estado: 'pendiente', intento: 1, lineas, texto: textoComanda(lineas as never),
    creadoAt: ahora, creadoDia: diaColombia(ahora), liberadaAt: ahora,
    puesto: null, tomadaAt: null, tomadaPor: null, enviadaAt: null, error: null, revisiones: [],
  };
}

/** La caja pide imprimir la comanda de un pedido (`previos`: trabajos del mismo pedido). */
export function planSolicitar(u: Usuario, p: Doc, b: Doc, previos: Doc[], prueba: boolean, ahora = Date.now()): Doc {
  exigirCaja(u, p.sedeId);
  if (TERMINADOS.includes(p.status)) throw new ErrorPedido('cancelado', 'Ese pedido está cancelado o rechazado: no se imprime', 409);
  if (previos.some((j) => EN_COLA.includes(j.estado))) {
    throw new ErrorPedido('en_cola', 'Esta comanda ya está en la cola de impresión. Revisa su estado antes de pedir otra', 409);
  }
  const version = Number(p.version) || 1;
  const ultima = p.comanda?.estado === 'enviada' ? p.comanda : null;
  const vigenteImpresa = !!ultima && Number(ultima.version) === version;
  let tipo = 'original';
  let motivo: string | null = null;
  if (b?.copia) {
    if (!vigenteImpresa) throw new ErrorPedido('sin_original', 'Todavía no se ha impreso esta versión: imprime la comanda, no una copia', 409);
    // El motivo es opcional (decisión del 30 oct 2026): la caja reimprime sin explicar.
    motivo = String(b.motivo ?? '').replace(/\s+/g, ' ').trim().slice(0, 120) || null;
    tipo = 'copia';
  } else if (vigenteImpresa) {
    throw new ErrorPedido('ya_impresa', 'Esta comanda ya se imprimió. Si necesitas otra, imprime una copia', 409);
  } else if (ultima) {
    tipo = 'actualizada';
  }
  const lineas = contenidoComanda(p, { tipo, motivo, prueba, ahora });
  return trabajo({
    sedeId: p.sedeId, orderId: p.id, orderNumber: p.orderNumber ?? null, version, tipo, motivo, prueba,
    solicitante: correo(u), origen: b?.origen === 'app' ? 'app' : 'web',
  }, lineas, ahora);
}

/** Página de prueba de la impresora (no es un pedido: la cocina no prepara nada). */
export function planPrueba(u: Usuario, b: Doc, ahora = Date.now()): Doc {
  const sedeId = String(b?.sedeId || '');
  exigirCaja(u, sedeId);
  const lineas = contenidoComanda({}, { tipo: 'prueba', ahora });
  return trabajo({ sedeId, orderId: null, orderNumber: null, version: 0, tipo: 'prueba', motivo: null, prueba: true, solicitante: correo(u), origen: 'web' }, lineas, ahora);
}

/**
 * El puente toma un trabajo para imprimirlo. Si esperó demasiado, no sale
 * solo; si el pedido cambió o se canceló mientras esperaba, se descarta (no
 * se imprime una versión vieja). `pedido` = { version, status } o null.
 */
export function planTomar(j: Doc, u: Usuario, b: Doc, pedido: Doc | null = null, ahora = Date.now()): Doc {
  exigirCaja(u, j.sedeId);
  const puesto = String(b?.puesto || '').slice(0, 80);
  if (!puesto) throw new ErrorPedido('puesto', 'Falta el aparato que imprime', 422);
  if (j.estado !== 'pendiente') throw new ErrorPedido('estado', 'Ese trabajo ya no está esperando', 409);
  if (pedido && TERMINADOS.includes(pedido.status)) {
    return { estado: 'descartada', descartadaPor: 'sistema', descartadaAt: ahora, error: 'El pedido se canceló antes de imprimir' };
  }
  if (pedido && (Number(pedido.version) || 1) > Number(j.version)) {
    return { estado: 'descartada', descartadaPor: 'sistema', descartadaAt: ahora, error: 'El pedido cambió antes de imprimir: imprime la comanda nueva' };
  }
  if (ahora - Number(j.liberadaAt || j.creadoAt || 0) > ANTIGUA_MS) {
    return { estado: 'pendiente_reintento', error: 'Esperó más de 10 minutos sin imprimirse: la caja debe confirmar si todavía se imprime' };
  }
  return { estado: 'enviando', puesto, tomadaAt: ahora, tomadaPor: correo(u) };
}

/** El puente dice si mandó el trabajo a la impresora o si falló. */
export function planResultado(j: Doc, u: Usuario, b: Doc, ahora = Date.now()): Doc {
  exigirCaja(u, j.sedeId);
  if (j.estado !== 'enviando' || j.puesto !== String(b?.puesto || '')) throw new ErrorPedido('estado', 'Ese trabajo no lo está imprimiendo este aparato', 409);
  if (b?.ok) return { estado: 'enviada', enviadaAt: ahora, error: null };
  return { estado: 'error', error: String(b?.error || 'La impresora no respondió').slice(0, 200) };
}

/**
 * La caja revisa un trabajo con error, viejo o en duda: si el papel sí salió
 * (`salio: true`) queda enviada; si no, vuelve a la cola (con su intento).
 * Un trabajo de una versión vieja del pedido no se reintenta.
 */
export function planRevisar(j: Doc, u: Usuario, b: Doc, versionPedido: number | null, ahora = Date.now()): Doc {
  exigirCaja(u, j.sedeId);
  const enDuda = j.estado === 'enviando' && ahora - Number(j.tomadaAt || 0) > AMBIGUO_MS;
  if (!(['error', 'pendiente_reintento'].includes(j.estado) || enDuda)) {
    throw new ErrorPedido('estado', 'Ese trabajo no necesita revisión', 409);
  }
  const revision = { por: correo(u), at: ahora, de: j.estado, salio: !!b?.salio };
  if (b?.salio) return { estado: 'enviada', enviadaAt: j.enviadaAt ?? ahora, error: null, '__union:revisiones': revision };
  if (versionPedido != null && versionPedido > Number(j.version)) {
    throw new ErrorPedido('desactualizada', 'El pedido cambió después de esta comanda: descártala e imprime la nueva', 409);
  }
  return {
    estado: 'pendiente', intento: (Number(j.intento) || 1) + 1, liberadaAt: ahora,
    puesto: null, tomadaAt: null, tomadaPor: null, error: null, '__union:revisiones': revision,
  };
}

/** La caja quita de la cola un trabajo que no debe salir. */
export function planDescartar(j: Doc, u: Usuario, ahora = Date.now()): Doc {
  exigirCaja(u, j.sedeId);
  if (!([...EN_COLA, 'error'].includes(j.estado))) throw new ErrorPedido('estado', 'Ese trabajo ya terminó', 409);
  return { estado: 'descartada', descartadaPor: correo(u), descartadaAt: ahora };
}

/** Resumen que se guarda en el pedido (solo si el trabajo es el último del pedido). */
export const resumenPedido = (id: string, j: Doc, estado: string, ahora: number) =>
  ({ version: Number(j.version) || 1, estado, impresionId: id, tipo: j.tipo, at: ahora });
