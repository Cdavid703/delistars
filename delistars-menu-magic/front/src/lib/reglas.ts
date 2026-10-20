// Reglas del menú que entrega el servidor en /products → producto.reglas
// (desde el 20 oct 2026). Antes vivían copiadas aquí (promos.ts, temporada.ts,
// destacados.ts, el filtro de jugos y las opciones de ProductDialog); ahora la
// fuente única es back/src/modules/modulo_pedidos/reglas/menu.ts, la misma que
// valida los pedidos. Para una promo nueva o un destacado nuevo se cambia allá.

export interface PromoReglas {
  slug: string;
  desde: string;        // 'yyyy-mm-dd' (Colombia)
  hasta: string;        // inclusive
  fechasTexto: string;  // "el 24 y 25 de octubre"
  unidades: number;
  unidad: string;       // "Hamburguesa", "Perro"
  bebidas: string[];
}

export interface ReglasProducto {
  visible: boolean;
  motivoOculto: null | "no_disponible" | "promo_no_empieza" | "promo_terminada";
  destacado: boolean;
  soloSedes: string[] | null;
  esOpcion: boolean;
  tipoOpcion: null | "adicion" | "cebolla" | "salsa";
  promo: PromoReglas | null;
  temporadaHasta: string | null;
  ficha: {
    bebidaCombo: string[] | null;
    porUnidad: boolean;
    opcion: null | { titulo: string; subtitulo: string; items: string[] };
    admiteAdiciones: boolean;
    admiteSalsas: boolean;
  };
}

interface ConReglas { nombre_producto: string; id_categoria: number; reglas?: ReglasProducto }

/** Minúsculas y sin tildes, para comparar nombres sin depender del admin. */
export const normalizarNombre = (s: string) =>
  (s || "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").trim();

/** Adiciones (5) y salsas (8) no se venden solas: son opciones de la ficha. */
const esOpcionPorCategoria = (p: ConReglas) => p.id_categoria === 5 || p.id_categoria === 8;

/**
 * ¿Se muestra en el menú, en esta sede? `sedeSlug` = 'santa_lucia' | 'santa_teresita'
 * (o null si aún no eligió). Sin reglas (servidor viejo) se muestra todo lo que no sea opción.
 */
export function visibleEnMenu(p: ConReglas, sedeSlug: string | null): boolean {
  const r = p.reglas;
  if (!r) return !esOpcionPorCategoria(p);
  if (!r.visible) return false;
  return !r.soloSedes || !sedeSlug || r.soloSedes.includes(sedeSlug);
}

/** Destacados de primeros; el resto conserva su orden (sort estable). */
export function destacadosPrimero<T extends ConReglas>(items: T[]): T[] {
  return [...items].sort((a, b) => Number(!!b.reglas?.destacado) - Number(!!a.reglas?.destacado));
}

/** Combo de promoción (se arma por unidades), o undefined. */
export const promoDe = (p: ConReglas | null | undefined): PromoReglas | undefined => p?.reglas?.promo ?? undefined;

const inicio = (p: PromoReglas) => new Date(`${p.desde}T00:00:00-05:00`).getTime();
const fin = (p: PromoReglas) => new Date(`${p.hasta}T00:00:00-05:00`).getTime() + 24 * 60 * 60 * 1000;

/** 'antes' | 'activa' | 'terminada' según la fecha (hora de Colombia, `hasta` inclusive). */
export function estadoPromo(p: PromoReglas, ahora: number = Date.now()): "antes" | "activa" | "terminada" {
  if (ahora < inicio(p)) return "antes";
  if (ahora >= fin(p)) return "terminada";
  return "activa";
}

/** Combos de promoción vigentes hoy (para la franja de promociones). */
export const promosVigentes = <T extends ConReglas>(productos: T[], ahora = Date.now()) =>
  productos
    .filter((p) => p.reglas?.promo && p.reglas.visible && estadoPromo(p.reglas.promo, ahora) === "activa")
    .map((p) => ({ producto: p, promo: p.reglas!.promo! }));

/** El combo de un enlace de campaña (?combo=<slug>), aunque esté fuera de fecha. */
export function promoPorSlug<T extends ConReglas>(productos: T[], slug: string | null) {
  const s = (slug || "").toLowerCase().trim();
  if (!s) return undefined;
  const producto = productos.find((p) => p.reglas?.promo?.slug === s);
  return producto ? { producto, promo: producto.reglas!.promo! } : undefined;
}

/** Opción obligatoria sin costo de la ficha (queso/tocineta, chicharrón/pollo). */
export const opcionDe = (p: ConReglas | null | undefined) => p?.reglas?.ficha.opcion ?? null;

/** Bebidas a elegir en un combo normal (null si no aplica). */
export const bebidasComboDe = (p: ConReglas | null | undefined) => p?.reglas?.ficha.bebidaCombo ?? null;

/** ¿La ficha ofrece adiciones? (las bebidas no). */
export const admiteAdiciones = (p: ConReglas) => p.reglas ? p.reglas.ficha.admiteAdiciones : p.id_categoria !== 7;

/** ¿La ficha ofrece salsas y cebolla generales? (bebidas no; combos de promo, por unidad). */
export const admiteSalsas = (p: ConReglas) => p.reglas ? p.reglas.ficha.admiteSalsas : p.id_categoria !== 7;

/** Una unidad de un combo de promoción, tal como la eligió el cliente. */
export interface UnidadCombo {
  salsas: string[];
  cebollas: string[];
  bebida: string;
}

/** Texto de cada unidad para el carrito y la cocina (igual que el servidor). */
export const textoUnidad = (p: { unidad: string }, u: UnidadCombo, i: number): string =>
  [
    `${p.unidad} ${i + 1}`,
    u.salsas.length ? `Salsas: ${u.salsas.join(", ")}` : "Sin salsas",
    u.cebollas.length ? `Cebolla: ${u.cebollas.join(", ")}` : null,
    `Bebida: ${u.bebida}`,
  ].filter(Boolean).join(" · ");
