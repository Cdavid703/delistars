/**
 * Campañas de Mercadeo vistas por el cliente (especificación §17): franja del
 * menú, campaña vencida y atribución de pedidos. Reglas puras.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type Doc = Record<string, any>;
export const H24 = 24 * 60 * 60 * 1000;

export function ms(t: unknown): number {
  if (t == null) return 0;
  if (typeof t === 'number') return t;
  const x = t as { toMillis?: () => number; _seconds?: number };
  if (typeof x.toMillis === 'function') return x.toMillis();
  if (typeof x._seconds === 'number') return x._seconds * 1000;
  return Number(t) || 0;
}

const enVigencia = (c: Doc, ahora: number) => {
  const ini = ms(c.vigencia?.inicio), fin = ms(c.vigencia?.fin);
  return !!ini && !!fin && ini <= ahora && ahora < fin;
};

/** ¿Esta campaña va en la franja del menú de esa sede ahora? (no gasta cupo de notificaciones) */
export const enFranja = (c: Doc, sedeId: string, ahora = Date.now()) =>
  !!c?.canales?.franja && !!c.programada && !c.pausada && enVigencia(c, ahora) && (!c.sedeId || !sedeId || c.sedeId === sedeId);

/** Lo que el cliente ve de una campaña (sin audiencia, métricas ni autor). */
export function publica(id: string, c: Doc, ahora = Date.now()) {
  return {
    id, vigente: !!c.programada && !c.pausada && enVigencia(c, ahora),
    terminada: ms(c.vigencia?.fin) > 0 && ahora >= ms(c.vigencia.fin),
    titulo: c.franja?.titulo || c.push?.titulo || c.nombre || '',
    texto: c.franja?.texto || c.push?.texto || '',
    destino: c.destino || { tipo: 'menu' }, sedeId: c.sedeId || null, fin: ms(c.vigencia?.fin) || null,
  };
}

/**
 * Atribución (§17.4): el pedido corresponde a la última campaña que el cliente
 * abrió de esa sede durante las 24 horas anteriores a la compra. `abiertaAt`
 * la manda el aparato (cuándo tocó la notificación o la franja).
 */
export function atribuible(c: Doc | null, sedePedido: string, abiertaAt: number, ahora = Date.now()): boolean {
  if (!c || !abiertaAt || abiertaAt > ahora + 60_000 || ahora - abiertaAt > H24) return false;
  if (c.sedeId && c.sedeId !== sedePedido) return false;
  const ini = ms(c.vigencia?.inicio), fin = ms(c.vigencia?.fin);
  if (ini && abiertaAt < ini - 60_000) return false;
  if (fin && abiertaAt > fin + 60_000) return false;
  return true;
}
