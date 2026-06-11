import { useEffect, useState } from "react";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Minus, Plus, ChevronLeft, ChevronRight } from "lucide-react";
import { useCart, formatCOP } from "@/context/CartContext";
import { apiService, type Addon, type Product as ApiProduct } from "@/services/api";
import { optimizeImage } from "@/lib/utils";
import { toast } from "sonner";

export const ProductDialog = ({ product, onClose }: { product: ApiProduct | null; onClose: () => void }) => {
  const { addItem } = useCart();
  const [qty, setQty] = useState(1);
  const [addonQtys, setAddonQtys] = useState<Record<number, number>>({});
  const [notes, setNotes] = useState("");
  const [addons, setAddons] = useState<Addon[]>([]);
  const [currentImageIndex, setCurrentImageIndex] = useState(0);

  useEffect(() => {
    if (product) {
      setQty(1);
      setAddonQtys({});
      setNotes("");
      setCurrentImageIndex(0);
    }
  }, [product]);

  useEffect(() => {
    const fetchAddons = async () => {
      try {
        const apiAddons = await apiService.getAddons();
        setAddons(apiAddons);
      } catch (error) {
        console.error('Error loading addons:', error);
      }
    };

    fetchAddons();
  }, []);

  if (!product) return null;

  // Obtener imágenes disponibles del producto
  const images = [product.image_url1, product.image_url2].filter(Boolean) as string[];
  const currentImage = images[currentImageIndex] || product.image_url1 || "";

  const handlePrevImage = () => {
    setCurrentImageIndex((prev) => (prev === 0 ? images.length - 1 : prev - 1));
  };

  const handleNextImage = () => {
    setCurrentImageIndex((prev) => (prev === images.length - 1 ? 0 : prev + 1));
  };

  const setAddonQty = (id: number, val: number) =>
    setAddonQtys((prev) => ({ ...prev, [id]: Math.max(0, val) }));

  // Expandir cada addon tantas veces como su cantidad
  const selectedAddons = addons.flatMap((a) =>
    Array(addonQtys[a.id] ?? 0).fill(a)
  );
  
  const productPrice = parseFloat(product.precio_venta);
  const unit = productPrice + selectedAddons.reduce((s, a) => s + a.price, 0);
  const total = unit * qty;

  const handleAdd = () => {
    if (notes.length > 250) {
      toast.error("El comentario es muy largo");
      return;
    }
    addItem({ product, quantity: qty, addons: selectedAddons, notes: notes.trim() });
    toast.success(`${product.nombre_producto} agregado al carrito 🎉`);
    onClose();
  };

  return (
    <Dialog open={!!product} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-lg w-full p-0 border-0 rounded-3xl shadow-glow overflow-hidden flex flex-col max-h-[95dvh]">

        {/* Imagen protagonista con overlay — altura fija para no comerse el viewport */}
        <div className="relative w-full h-48 sm:h-64 overflow-hidden bg-muted shrink-0 group">
          <img
            src={optimizeImage(currentImage, 800, 600)}
            alt={product.nombre_producto}
            className="w-full h-full object-cover transition-smooth"
          />
          <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/20 to-transparent" />
          <div className="absolute bottom-0 inset-x-0 p-4 sm:p-5 space-y-0.5">
            <p className="font-display text-[10px] tracking-widest text-white/60">·Tasty & Cool·</p>
            <DialogTitle className="font-display text-2xl sm:text-3xl text-white leading-tight">
              {product.nombre_producto}
            </DialogTitle>
            <p className="font-display text-xl sm:text-2xl text-primary">{formatCOP(parseFloat(product.precio_venta))}</p>
          </div>

          {/* Navegación de imágenes — visible solo si hay más de una imagen */}
          {images.length > 1 && (
            <>
              <button
                onClick={handlePrevImage}
                className="absolute left-2 top-1/2 -translate-y-1/2 bg-black/50 hover:bg-black/70 text-white p-2 rounded-full opacity-0 group-hover:opacity-100 transition-opacity"
              >
                <ChevronLeft className="w-5 h-5" />
              </button>
              <button
                onClick={handleNextImage}
                className="absolute right-2 top-1/2 -translate-y-1/2 bg-black/50 hover:bg-black/70 text-white p-2 rounded-full opacity-0 group-hover:opacity-100 transition-opacity"
              >
                <ChevronRight className="w-5 h-5" />
              </button>

              {/* Puntos indicadores */}
              <div className="absolute bottom-4 left-1/2 -translate-x-1/2 flex gap-1">
                {images.map((_, idx) => (
                  <button
                    key={idx}
                    onClick={() => setCurrentImageIndex(idx)}
                    className={`w-2 h-2 rounded-full transition-smooth ${
                      idx === currentImageIndex ? "bg-primary" : "bg-white/50"
                    }`}
                  />
                ))}
              </div>
            </>
          )}
        </div>

        {/* Contenido scrollable — min-h-0 es clave para que flex funcione bien */}
        <div className="flex-1 overflow-y-auto min-h-0">
          <div className="p-5 space-y-5">

            <p className="text-base text-foreground/80 leading-relaxed">{product.descripcion_producto}</p>

            <div>
              <p className="font-display text-lg tracking-wide mb-1">Adiciones</p>
              <p className="text-xs text-muted-foreground mb-3">Personaliza tu pedido</p>
              <div className="space-y-2">
                {addons.map((a) => {
                  const q = addonQtys[a.id] ?? 0;
                  return (
                    <div
                      key={a.id}
                      className={`flex items-center justify-between gap-3 p-3 rounded-xl transition-smooth ${q > 0 ? "bg-primary/10 border border-primary/30" : "bg-muted/50"}`}
                    >
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium truncate">{a.name}</p>
                        <p className="text-xs text-primary font-semibold">+{formatCOP(a.price)}</p>
                      </div>
                      <div className="flex items-center gap-1 bg-background rounded-full p-0.5 border border-border shrink-0">
                        <button
                          onClick={() => setAddonQty(a.id, q - 1)}
                          disabled={q === 0}
                          className="h-7 w-7 rounded-full flex items-center justify-center text-foreground hover:bg-muted disabled:opacity-30 transition-smooth"
                        >
                          <Minus className="w-3 h-3" />
                        </button>
                        <span className="font-display text-base w-6 text-center">{q}</span>
                        <button
                          onClick={() => setAddonQty(a.id, q + 1)}
                          className="h-7 w-7 rounded-full flex items-center justify-center bg-primary text-primary-foreground hover:bg-primary/90 transition-smooth"
                        >
                          <Plus className="w-3 h-3" />
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            <div>
              <Label htmlFor="notes" className="font-display text-lg tracking-wide">Comentarios</Label>
              <Textarea
                id="notes"
                value={notes}
                onChange={(e) => setNotes(e.target.value.slice(0, 250))}
                placeholder="¿Algo especial? Ej: sin cebolla, salsa aparte..."
                className="mt-2 resize-none"
                rows={2}
              />
              <p className="text-xs text-muted-foreground mt-1 text-right">{notes.length}/250</p>
            </div>
          </div>
        </div>

        {/* Footer siempre visible — shrink-0 para que nunca desaparezca */}
        <div className="shrink-0 bg-card border-t border-border px-5 py-4 space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-1 bg-muted rounded-full p-1">
              <Button size="icon" variant="ghost" className="h-9 w-9 rounded-full" onClick={() => setQty(Math.max(1, qty - 1))}>
                <Minus className="w-4 h-4" />
              </Button>
              <span className="font-display text-xl w-9 text-center">{qty}</span>
              <Button size="icon" variant="ghost" className="h-9 w-9 rounded-full" onClick={() => setQty(qty + 1)}>
                <Plus className="w-4 h-4" />
              </Button>
            </div>
            <span className="font-display text-2xl text-primary">{formatCOP(total)}</span>
          </div>
          <Button
            onClick={handleAdd}
            size="lg"
            className="w-full bg-gradient-hero text-primary-foreground border-0 shadow-soft hover:shadow-glow transition-smooth h-12 text-base"
          >
            Agregar al carrito
          </Button>
        </div>

      </DialogContent>
    </Dialog>
  );
};
