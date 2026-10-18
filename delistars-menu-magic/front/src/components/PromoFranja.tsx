import type { Product as ApiProduct } from "@/services/api";
import { PROMOS, estadoPromo } from "@/lib/promos";
import { normalizarNombre } from "@/lib/destacados";

const fmt = (v: string | number) => `$${Math.round(Number(v)).toLocaleString("es-CO")}`;

// Franja de promociones arriba del menú: los combos con fecha que están
// vigentes hoy. Reemplaza el popup de temporada (especificación §17.2: sin
// ventanas emergentes intrusivas; decisión C5 del 18 oct 2026). Si no hay
// ninguno vigente, no ocupa espacio.
export const PromoFranja = ({ products, onVer }: { products: ApiProduct[]; onVer: (p: ApiProduct) => void }) => {
  const vigentes = PROMOS
    .filter((promo) => estadoPromo(promo) === "activa")
    .map((promo) => ({
      promo,
      producto: products.find((p) => normalizarNombre(p.nombre_producto) === normalizarNombre(promo.producto)),
    }))
    .filter((x): x is { promo: typeof x.promo; producto: ApiProduct } => !!x.producto);

  if (vigentes.length === 0) return null;

  return (
    <div className="container px-3 sm:px-6 pt-4">
      <div className="flex flex-col gap-2">
        {vigentes.map(({ promo, producto }) => (
          <button
            key={promo.slug}
            onClick={() => onVer(producto)}
            className="w-full text-left rounded-2xl bg-gradient-hero text-primary-foreground px-4 py-3 flex items-center gap-3 shadow-soft hover:opacity-95 transition-smooth"
          >
            <span className="text-2xl shrink-0">🔥</span>
            <span className="flex-1 min-w-0">
              <span className="block font-display text-lg leading-tight">
                {producto.nombre_producto} · {fmt(producto.precio_venta)}
              </span>
              <span className="block text-xs opacity-90 truncate">
                Solo {promo.fechasTexto}
              </span>
            </span>
            <span className="shrink-0 rounded-xl bg-white/20 px-3 py-2 text-sm font-semibold">Ver combo</span>
          </button>
        ))}
      </div>
    </div>
  );
};
