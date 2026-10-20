/**
 * Reglas del menú que antes solo vivían en el menú web (front/src). El servidor
 * las hace cumplir al crear un pedido. Mantener en sync con:
 *   - front/src/components/ProductDialog.tsx  (getProductCustomOptions)
 *   - front/src/lib/promos.ts                 (COMBO_DRINKS, PROMOS)
 *   - front/src/components/MenuSection.tsx    (jugos solo en Santa Teresita)
 */

export const CATEGORIA = { combos: 4, adiciones: 5, bebidas: 7, salsas: 8 } as const;

/** Bebidas que se pueden elegir en un combo normal (no de promoción). */
export const COMBO_DRINKS = [
  'Manzana Postobón Pet 400 ml',
  'Uva Postobón Pet 400 ml',
  'Naranjada Postobón Pet 400 ml',
  'Colombiana Pet 400 ml',
  'Coca Cola Sabor Original Pet 400 ml',
  'Coca Cola Zero Pet 400 ml',
  'Agua Saborizada Manzana 400 ml',
  'Agua Saborizada Limón 400 ml',
];

const normalizar = (s: string) => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').trim();

/** Opción obligatoria sin costo (queso/tocineta, chicharrón/pollo). */
export function opcionesDe(p: { id_producto: number; nombre_producto: string }): string[] | null {
  const n = normalizar(p.nombre_producto);
  if (
    p.id_producto === 3 || p.id_producto === 26 ||
    ['hamburguesa de pollo', 'hamburguesa de pollo con queso o tocineta', 'hamburguesa de pollo con queso y tocineta',
      'combo hamburguesa sencilla con queso o tocineta', 'combo hamburguesa de pollo con queso o tocineta'].includes(n)
  ) return ['Queso', 'Tocineta'];
  if (p.id_producto === 20 || n === 'papastars') return ['Chicharron', 'Pollo'];
  return null;
}

/**
 * Combos de promoción con fechas (espejo de front/src/lib/promos.ts → PROMOS).
 * Solo se piden entre `desde` y `hasta` (inclusive, hora de Colombia). Cada
 * unidad (cada hamburguesa o perro) lleva sus salsas, cebolla y bebida.
 */
export interface PromoCombo { producto: string; desde: string; hasta: string; unidades: number; unidad: string; bebidas: string[] }
export const PROMOS: PromoCombo[] = [
  { producto: 'Combo Quincena', desde: '2026-10-15', hasta: '2026-10-17', unidades: 2, unidad: 'Hamburguesa',
    bebidas: ['Coca Cola Sabor Original Pet 400 ml', 'Coca Cola Zero Pet 400 ml'] },
  { producto: 'Combo Parche', desde: '2026-10-24', hasta: '2026-10-25', unidades: 4, unidad: 'Perro', bebidas: COMBO_DRINKS },
];
export const promoDe = (nombre: string) => PROMOS.find((p) => normalizar(p.producto) === normalizar(nombre));

const inicioDia = (fecha: string) => new Date(`${fecha}T00:00:00-05:00`).getTime();
export function estadoPromo(p: PromoCombo, ahora = Date.now()): 'antes' | 'activa' | 'terminada' {
  if (ahora < inicioDia(p.desde)) return 'antes';
  if (ahora >= inicioDia(p.hasta) + 24 * 3600 * 1000) return 'terminada';
  return 'activa';
}

/** De temporada (espejo de front/src/lib/temporada.ts): combos normales con fecha de fin. */
const TEMPORADA: Record<string, number> = {
  'combo amor': new Date('2026-10-01T00:00:00-05:00').getTime(),
  'combo amistad': new Date('2026-10-01T00:00:00-05:00').getTime(),
};
export const finTemporada = (nombre: string): number | null => TEMPORADA[normalizar(nombre)] ?? null;

/** Texto de cada unidad para la cocina (igual que textoUnidad del menú web). */
export const textoUnidad = (p: { unidad: string }, u: { salsas: string[]; cebollas: string[]; bebida: string }, i: number) =>
  [
    `${p.unidad} ${i + 1}`,
    u.salsas.length ? `Salsas: ${u.salsas.join(', ')}` : 'Sin salsas',
    u.cebollas.length ? `Cebolla: ${u.cebollas.join(', ')}` : null,
    `Bebida: ${u.bebida}`,
  ].filter(Boolean).join(' · ');

/** Productos que solo se venden en una sede. */
export function sedePermitida(p: { id_producto: number; nombre_producto: string }, sedeId: string): boolean {
  const esJugo = p.id_producto === 48 || normalizar(p.nombre_producto).includes('jugos de la casa');
  return !esJugo || sedeId === 'santa_teresita';
}

/** Destacados (espejo de front/src/lib/destacados.ts): van primero en su categoría. */
export const DESTACADOS = ['combo amor', 'combo amistad', 'mexistars'];

/** Textos de la opción obligatoria (espejo de PRODUCT_OPTIONS en ProductDialog.tsx). */
function textosOpcion(items: string[]) {
  return items.includes('Chicharron')
    ? { titulo: 'Elige tu proteína', subtitulo: 'Selecciona cómo deseas tu Papastars (sin costo adicional)' }
    : { titulo: 'Elige un ingrediente', subtitulo: 'Selecciona una opción para tu hamburguesa (sin costo adicional)' };
}

export interface ReglasProducto {
  visible: boolean;
  motivoOculto: null | 'no_disponible' | 'promo_no_empieza' | 'promo_terminada';
  destacado: boolean;
  soloSedes: string[] | null;
  esOpcion: boolean;
  tipoOpcion: null | 'adicion' | 'cebolla' | 'salsa';
  promo: null | { desde: string; hasta: string; unidades: number; unidad: string; bebidas: string[] };
  temporadaHasta: string | null;
  ficha: {
    bebidaCombo: string[] | null;
    porUnidad: boolean;
    opcion: null | { titulo: string; subtitulo: string; items: string[] };
    admiteAdiciones: boolean;
    admiteSalsas: boolean;
  };
}

/**
 * Reglas del menú de un producto, para que la app (y algún día el menú web) no
 * las copie: visibilidad por fecha, destacado, sede, si es una opción y qué pide
 * la ficha. Mismas reglas que valida armarItems al crear el pedido.
 */
export function reglasDeProducto(
  p: { id_producto: number; nombre_producto: string; id_categoria: number; precio_venta: number | string; disponible?: boolean },
  ahora = Date.now(),
): ReglasProducto {
  const promo = promoDe(p.nombre_producto);
  const fin = finTemporada(p.nombre_producto);
  const estado = promo ? estadoPromo(promo, ahora) : 'activa';
  const motivoOculto = p.disponible === false ? 'no_disponible'
    : estado === 'antes' ? 'promo_no_empieza'
    : estado === 'terminada' || (fin != null && ahora >= fin) ? 'promo_terminada'
    : null;
  const precio = Number(p.precio_venta);
  const tipoOpcion = p.id_categoria === CATEGORIA.salsas ? 'salsa'
    : p.id_categoria === CATEGORIA.adiciones ? (precio > 0 ? 'adicion' : 'cebolla')
    : null;
  const esBebida = p.id_categoria === CATEGORIA.bebidas;
  const opciones = opcionesDe(p);
  const soloTeresita = !sedePermitida(p, 'santa_lucia');
  return {
    visible: motivoOculto === null && tipoOpcion === null,
    motivoOculto,
    destacado: DESTACADOS.includes(normalizar(p.nombre_producto)),
    soloSedes: soloTeresita ? ['santa_teresita'] : null,
    esOpcion: tipoOpcion !== null,
    tipoOpcion,
    promo: promo ? { desde: promo.desde, hasta: promo.hasta, unidades: promo.unidades, unidad: promo.unidad, bebidas: promo.bebidas } : null,
    temporadaHasta: fin != null ? new Date(fin).toISOString() : null,
    ficha: {
      bebidaCombo: p.id_categoria === CATEGORIA.combos && !promo ? COMBO_DRINKS : null,
      porUnidad: !!promo,
      opcion: opciones ? { ...textosOpcion(opciones), items: opciones } : null,
      admiteAdiciones: !esBebida && tipoOpcion === null,
      admiteSalsas: !esBebida && !promo && tipoOpcion === null,
    },
  };
}

