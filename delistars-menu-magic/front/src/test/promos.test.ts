import { describe, it, expect } from "vitest";
import { promoDe, promoPorSlug, estadoPromo, textoUnidad, PROMOS } from "@/lib/promos";
import { vigente } from "@/lib/temporada";

const t = (s: string) => new Date(s).getTime();
const quincena = promoPorSlug("combo-quincena")!;
const parche = promoPorSlug("COMBO-PARCHE")!;

describe("combos con fecha", () => {
  it("Quincena: del 15 al 17 de octubre, hora de Colombia", () => {
    expect(estadoPromo(quincena, t("2026-10-14T23:59:00-05:00"))).toBe("antes");
    expect(estadoPromo(quincena, t("2026-10-15T00:00:00-05:00"))).toBe("activa");
    // 17 a las 9 p. m. en Colombia = 18 a las 2 a. m. UTC: sigue activa.
    expect(estadoPromo(quincena, t("2026-10-18T02:00:00Z"))).toBe("activa");
    expect(estadoPromo(quincena, t("2026-10-18T00:00:00-05:00"))).toBe("terminada");
  });

  it("Parche: 24 y 25 de octubre", () => {
    expect(estadoPromo(parche, t("2026-10-23T20:00:00-05:00"))).toBe("antes");
    expect(estadoPromo(parche, t("2026-10-25T22:00:00-05:00"))).toBe("activa");
    expect(estadoPromo(parche, t("2026-10-26T00:00:00-05:00"))).toBe("terminada");
  });

  it("el menú solo los muestra en sus fechas; el resto de productos no cambia", () => {
    expect(vigente("Combo Quincena", t("2026-10-14T20:00:00-05:00"))).toBe(false);
    expect(vigente("combo quincena", t("2026-10-16T20:00:00-05:00"))).toBe(true);
    expect(vigente("Combo Parche", t("2026-10-16T20:00:00-05:00"))).toBe(false);
    expect(vigente("Combo Hamburguesa Especial", t("2026-10-14T20:00:00-05:00"))).toBe(true);
  });

  it("se encuentran por nombre (sin importar tildes ni mayúsculas) y por slug", () => {
    expect(promoDe("COMBO QUINCENA")?.unidades).toBe(2);
    expect(promoDe("Combo Parche")?.bebidas.length).toBe(8);
    expect(promoPorSlug("no-existe")).toBeUndefined();
    expect(PROMOS.map((p) => p.unidad)).toEqual(["Hamburguesa", "Perro"]);
  });

  it("cada unidad sale clara para la cocina", () => {
    expect(textoUnidad(quincena, { salsas: ["Rosada", "Piña"], cebollas: ["Caramelizada"], bebida: "Coca Cola Zero Pet 400 ml" }, 0))
      .toBe("Hamburguesa 1 · Salsas: Rosada, Piña · Cebolla: Caramelizada · Bebida: Coca Cola Zero Pet 400 ml");
    expect(textoUnidad(parche, { salsas: [], cebollas: [], bebida: "Uva Postobón Pet 400 ml" }, 3))
      .toBe("Perro 4 · Sin salsas · Bebida: Uva Postobón Pet 400 ml");
  });
});
