import { Plus } from "lucide-react";
import type { Product as ApiProduct } from "@/services/api";
import { Button } from "@/components/ui/button";
import { formatCOP } from "@/context/CartContext";
import { optimizeImage } from "@/lib/utils";

export const ProductCard = ({ product, onClick }: { product: ApiProduct; onClick: () => void }) => {
  const hasPresentations = !!(product.presentations && product.presentations.length > 0);
  const minPrice = hasPresentations && product.presentations
    ? Math.min(...product.presentations.map((p) => p.precio_venta))
    : parseFloat(product.precio_venta);

  return (
    <article className="group bg-card rounded-3xl overflow-hidden shadow-card hover-lift border border-border/50 flex flex-col">
      <div className="relative overflow-hidden aspect-[4/3] bg-muted cursor-pointer" onClick={onClick}>
        <img
          src={optimizeImage(
            product.image_url1 || "",
            800,
            600,
            product.id_producto === 48 ? "g_south" : "g_auto"
          )}
          alt={product.nombre_producto}
          loading="lazy"
          width={768}
          height={768}
          className="w-full h-full object-cover transition-bounce group-hover:scale-110"
        />
      </div>
      <div className="p-5 flex flex-col gap-3 flex-1">
        <div className="flex items-start justify-between gap-3">
          <h3 className="font-display text-xl text-foreground">{product.nombre_producto}</h3>
          <span className="font-display text-primary text-lg whitespace-nowrap">
            {hasPresentations ? `Desde ${formatCOP(minPrice)}` : formatCOP(minPrice)}
          </span>
        </div>
        <p className="text-base md:text-[1.05rem] leading-relaxed text-foreground/75 font-medium flex-1">{product.descripcion_producto}</p>
        <Button
          onClick={onClick}
          className="w-full bg-gradient-hero text-primary-foreground border-0 shadow-soft hover:shadow-glow transition-smooth"
        >
          <Plus className="w-4 h-4 mr-1" /> Añadir
        </Button>
      </div>
    </article>
  );
};
