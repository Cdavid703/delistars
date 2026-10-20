import { describe, it, expect } from "vitest";
import {
  visibleEnMenu, destacadosPrimero, promoDe, estadoPromo, promosVigentes, promoPorSlug,
  opcionDe, bebidasComboDe, admiteAdiciones, admiteSalsas, textoUnidad, type ReglasProducto,
} from "@/lib/reglas";

// Las reglas las calcula el servidor (/products → reglas); aquí se prueba que
// el menú web las use bien.
const t = (s: string) => new Date(s).getTime();
const base: ReglasProducto = {
  visible: true, motivoOculto: null, destacado: false, soloSedes: null, esOpcion: false, tipoOpcion: null,
  promo: null, temporadaHasta: null,
  ficha: { bebidaCombo: null, porUnidad: false, opcion: null, admiteAdiciones: true, admiteSalsas: true },
};
const prod = (nombre: string, cat: number, reglas: Partial<ReglasProducto> = {}) =>
  ({ nombre_producto: nombre, id_categoria: cat, reglas: { ...base, ...reglas, ficha: { ...base.ficha, ...(reglas.ficha ?? {}) } } });
const parche = {
  slug: "combo-parche", desde: "2026-10-24", hasta: "2026-10-25", fechasTexto: "el 24 y 25 de octubre",
  unidades: 4, unidad: "Perro", bebidas: ["Coca Cola Zero Pet 400 ml"],
};

describe("menú con las reglas del servidor", () => {
  it("visibilidad: oculto, solo en una sede, opciones; sin reglas muestra lo que no es opción", () => {
    expect(visibleEnMenu(prod("Combo Amor", 4, { visible: false }), "santa_lucia")).toBe(false);
    const jugos = prod("Jugos de la Casa", 7, { soloSedes: ["santa_teresita"] });
    expect(visibleEnMenu(jugos, "santa_lucia")).toBe(false);
    expect(visibleEnMenu(jugos, "santa_teresita")).toBe(true);
    expect(visibleEnMenu({ nombre_producto: "Tocineta", id_categoria: 5 }, null)).toBe(false);
    expect(visibleEnMenu({ nombre_producto: "Hamburguesa", id_categoria: 1 }, null)).toBe(true);
  });

  it("destacados primero sin revolver el resto", () => {
    const lista = [prod("A", 1), prod("B", 1, { destacado: true }), prod("C", 1)];
    expect(destacadosPrimero(lista).map((p) => p.nombre_producto)).toEqual(["B", "A", "C"]);
  });

  it("combos con fecha: estado en hora de Colombia, franja y enlace de campaña", () => {
    expect(estadoPromo(parche, t("2026-10-23T23:59:00-05:00"))).toBe("antes");
    expect(estadoPromo(parche, t("2026-10-25T22:00:00-05:00"))).toBe("activa");
    expect(estadoPromo(parche, t("2026-10-26T00:00:00-05:00"))).toBe("terminada");
    const combo = prod("Combo Parche", 4, { promo: parche, ficha: { ...base.ficha, porUnidad: true, admiteSalsas: false } });
    expect(promoDe(combo)?.unidades).toBe(4);
    expect(promosVigentes([combo], t("2026-10-24T19:00:00-05:00"))).toHaveLength(1);
    expect(promosVigentes([combo], t("2026-10-20T19:00:00-05:00"))).toHaveLength(0);
    expect(promoPorSlug([combo], "COMBO-PARCHE")?.producto.nombre_producto).toBe("Combo Parche");
    expect(promoPorSlug([combo], "no-existe")).toBeUndefined();
  });

  it("ficha: opción obligatoria, bebidas del combo, adiciones y salsas", () => {
    const pollo = prod("Hamburguesa de Pollo", 1, { ficha: { ...base.ficha, opcion: { titulo: "Elige un ingrediente", subtitulo: "x", items: ["Queso", "Tocineta"] } } });
    expect(opcionDe(pollo)?.items).toEqual(["Queso", "Tocineta"]);
    expect(bebidasComboDe(prod("Combo Especial", 4, { ficha: { ...base.ficha, bebidaCombo: ["Uva"] } }))).toEqual(["Uva"]);
    const bebida = prod("Coca Cola", 7, { ficha: { ...base.ficha, admiteAdiciones: false, admiteSalsas: false } });
    expect(admiteAdiciones(bebida)).toBe(false);
    expect(admiteSalsas(bebida)).toBe(false);
  });

  it("cada unidad sale clara para la cocina", () => {
    expect(textoUnidad(parche, { salsas: [], cebollas: [], bebida: "Uva Postobón Pet 400 ml" }, 3))
      .toBe("Perro 4 · Sin salsas · Bebida: Uva Postobón Pet 400 ml");
  });
});
