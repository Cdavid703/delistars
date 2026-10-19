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

/** Combos de promoción o temporada: se arman por unidades y aún no se piden por la API. */
const PROMOCIONES = ['combo quincena', 'combo parche', 'combo amor', 'combo amistad'];
export const esPromocion = (nombre: string) => PROMOCIONES.includes(normalizar(nombre));

/** Productos que solo se venden en una sede. */
export function sedePermitida(p: { id_producto: number; nombre_producto: string }, sedeId: string): boolean {
  const esJugo = p.id_producto === 48 || normalizar(p.nombre_producto).includes('jugos de la casa');
  return !esJugo || sedeId === 'santa_teresita';
}
