// Productos que van de PRIMEROS en su categoría.
//
// El menú no tenía ningún orden: mostraba los productos como los devuelve la
// base, o sea por orden de creación. Un producto nuevo quedaba siempre de
// último — justo lo contrario de lo que se necesita cuando es el que se está
// promocionando, y peor en celular, donde el visitante tiene que bajar por
// toda la categoría para verlo.
//
// Para quitar o cambiar el destacado basta editar esta lista. Se compara por
// nombre normalizado, así que un cambio de mayúsculas o de tilde en el admin
// no rompe el orden.
export const DESTACADOS = ["combo amor", "combo amistad", "mexistars"];

/** Min\u00fasculas y sin tildes, para comparar nombres sin depender del admin. */
export const normalizarNombre = (s: string) =>
  (s || "").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim();

export const esDestacado = (nombre: string) => DESTACADOS.includes(normalizarNombre(nombre));

/**
 * Deja los destacados de primeros y conserva el orden original del resto
 * (Array.sort es estable, así que no revuelve la categoría).
 */
export function destacadosPrimero<T extends { nombre_producto: string }>(items: T[]): T[] {
  return [...items].sort(
    (a, b) => Number(esDestacado(b.nombre_producto)) - Number(esDestacado(a.nombre_producto)),
  );
}
