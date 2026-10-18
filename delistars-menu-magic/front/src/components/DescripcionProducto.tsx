import { itemsDescripcion } from "@/lib/descripcion";

/**
 * Descripción del producto como lista de lo que trae. Si es un párrafo viejo
 * (una sola línea), se muestra como párrafo. `max` corta la lista y dice cuántos faltan.
 */
export const DescripcionProducto = ({ texto, max, className = "" }: { texto: string; max?: number; className?: string }) => {
  const items = itemsDescripcion(texto);
  if (items.length <= 1) return <p className={className}>{items[0] ?? ""}</p>;
  const visibles = max ? items.slice(0, max) : items;
  const faltan = items.length - visibles.length;
  return (
    <ul className={`space-y-0.5 ${className}`}>
      {visibles.map((item, i) => (
        <li key={i} className="flex gap-2">
          <span aria-hidden className="text-primary">•</span>
          <span>{item}</span>
        </li>
      ))}
      {faltan > 0 && <li className="pl-4 text-foreground/55">y {faltan} más…</li>}
    </ul>
  );
};
