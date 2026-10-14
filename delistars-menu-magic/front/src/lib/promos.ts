// Combos de promoción con fechas: aparecen en el menú SOLO entre `desde` y
// `hasta` (inclusive, hora de Colombia). Cada unidad del combo (cada
// hamburguesa o perro) lleva sus propias salsas, cebolla y bebida.
//
// El producto vive en la base del menú (tbl_productos, categoría Combos) con
// el mismo nombre que `producto`. El correo de la campaña enlaza a
// https://delistars.com/?combo=<slug>, que abre el combo directamente.

import { normalizarNombre } from "./destacados";

// Bebidas de 400 ml que se pueden elegir en los combos del menú.
export const COMBO_DRINKS = [
  "Manzana Postobón Pet 400 ml",
  "Uva Postobón Pet 400 ml",
  "Naranjada Postobón Pet 400 ml",
  "Colombiana Pet 400 ml",
  "Coca Cola Sabor Original Pet 400 ml",
  "Coca Cola Zero Pet 400 ml",
  "Agua Saborizada Manzana 400 ml",
  "Agua Saborizada Limón 400 ml",
];

export interface PromoCombo {
  slug: string;
  producto: string;     // nombre exacto en el menú
  desde: string;        // 'yyyy-mm-dd' (Colombia)
  hasta: string;        // 'yyyy-mm-dd' (Colombia), inclusive
  fechasTexto: string;  // para avisos: "del 15 al 17 de octubre"
  unidades: number;     // cuántas hamburguesas/perros trae
  unidad: string;       // "Hamburguesa", "Perro"
  bebidas: string[];    // opciones de bebida para cada unidad
}

export const PROMOS: PromoCombo[] = [
  {
    slug: "combo-quincena",
    producto: "Combo Quincena",
    desde: "2026-10-15",
    hasta: "2026-10-17",
    fechasTexto: "del 15 al 17 de octubre",
    unidades: 2,
    unidad: "Hamburguesa",
    bebidas: ["Coca Cola Sabor Original Pet 400 ml", "Coca Cola Zero Pet 400 ml"],
  },
  {
    slug: "combo-parche",
    producto: "Combo Parche",
    desde: "2026-10-24",
    hasta: "2026-10-25",
    fechasTexto: "el 24 y 25 de octubre",
    unidades: 4,
    unidad: "Perro",
    bebidas: COMBO_DRINKS,
  },
];

// El desfase -05:00 va a propósito: el día cambia a medianoche de Colombia, no
// a las 7 p. m. (que es medianoche UTC). Ver lib/temporada.ts.
const inicio = (p: PromoCombo) => new Date(`${p.desde}T00:00:00-05:00`).getTime();
const fin = (p: PromoCombo) => new Date(`${p.hasta}T00:00:00-05:00`).getTime() + 24 * 60 * 60 * 1000;

export const promoDe = (nombreProducto: string): PromoCombo | undefined =>
  PROMOS.find((p) => normalizarNombre(p.producto) === normalizarNombre(nombreProducto));

export const promoPorSlug = (slug: string | null): PromoCombo | undefined =>
  slug ? PROMOS.find((p) => p.slug === slug.toLowerCase().trim()) : undefined;

/** 'antes' | 'activa' | 'terminada' según la fecha. */
export function estadoPromo(p: PromoCombo, ahora: number = Date.now()): "antes" | "activa" | "terminada" {
  if (ahora < inicio(p)) return "antes";
  if (ahora >= fin(p)) return "terminada";
  return "activa";
}

/** Una unidad del combo, tal como la eligió el cliente. */
export interface UnidadCombo {
  salsas: string[];
  cebollas: string[];
  bebida: string;
}

/** Texto de cada unidad para el carrito y para la cocina. */
export const textoUnidad = (p: { unidad: string }, u: UnidadCombo, i: number): string =>
  [
    `${p.unidad} ${i + 1}`,
    u.salsas.length ? `Salsas: ${u.salsas.join(", ")}` : "Sin salsas",
    u.cebollas.length ? `Cebolla: ${u.cebollas.join(", ")}` : null,
    `Bebida: ${u.bebida}`,
  ].filter(Boolean).join(" · ");
