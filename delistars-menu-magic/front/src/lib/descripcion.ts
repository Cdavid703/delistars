// La descripción de un producto (tbl_productos.descripcion_producto) se guarda
// como lista: una línea por ingrediente o componente (decisión del 18 oct 2026,
// informe de productos de Administración). Las descripciones viejas de un solo
// párrafo siguen funcionando: salen como un solo elemento.

/** Elementos de la descripción, sin viñetas ni líneas vacías. */
export function itemsDescripcion(texto: string | null | undefined): string[] {
  return (texto ?? "")
    .split(/\r?\n/)
    .map((l) => l.replace(/^\s*[-•·*]\s*/, "").trim())
    .filter(Boolean);
}

/** Versión en una sola línea (carrusel, vistas previas). */
export const descripcionEnLinea = (texto: string | null | undefined, max = Infinity): string =>
  itemsDescripcion(texto).slice(0, max).join(" · ");
