import { useEffect, useState } from "react";
import { Dialog, DialogContent, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Sparkles, X } from "lucide-react";
import { useCart } from "@/context/CartContext";
import { apiService, type Product as ApiProduct } from "@/services/api";

const PROMO_PRODUCT_ID = 4;

export const PromoModal = ({ onOpenProduct }: { onOpenProduct: (p: ApiProduct) => void }) => {
  const { sede } = useCart();
  const [open, setOpen] = useState(false);
  const [product, setProduct] = useState<ApiProduct | null>(null);

  useEffect(() => {
    apiService.getProductById(PROMO_PRODUCT_ID).then(setProduct);
  }, []);

  useEffect(() => {
    if (!sede || !product) return;
    const t = setTimeout(() => setOpen(true), 400);
    return () => clearTimeout(t);
  }, [sede, product]);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent className="max-w-3xl w-[95vw] max-h-[90vh] p-0 overflow-y-auto overflow-x-hidden border-0 bg-card [&>button]:hidden">
        <DialogTitle className="sr-only">Promoción especial DeliStars</DialogTitle>
        <DialogDescription className="sr-only">
          Descubre nuestra hamburguesa estrella con 20% de descuento
        </DialogDescription>

        <button
          onClick={() => setOpen(false)}
          aria-label="Cerrar"
          className="absolute top-3 right-3 z-20 w-9 h-9 rounded-full bg-background/80 backdrop-blur-md flex items-center justify-center text-foreground hover:bg-primary hover:text-primary-foreground transition-smooth shadow-card"
        >
          <X className="w-5 h-5" />
        </button>

        <div className="grid md:grid-cols-2 h-full">
          <div className="relative h-48 sm:h-64 md:h-auto overflow-hidden bg-foreground shrink-0">
            <img
              src={product?.image_url1 || ""}
              alt={product?.nombre_producto || "Hamburguesa DeliStars"}
              width={1024}
              height={1280}
              loading="lazy"
              className="w-full h-full object-cover animate-scale-in"
            />
            <div className="absolute top-4 left-4 bg-primary text-primary-foreground rounded-full px-4 py-1.5 text-xs font-bold shadow-glow animate-bounce-soft">
              ¡SOLO HOY!
            </div>
          </div>

          <div className="p-5 sm:p-6 md:p-8 flex flex-col justify-center bg-gradient-soft animate-fade-in">
            <span className="inline-flex items-center gap-2 self-start px-3 py-1 rounded-full bg-secondary text-secondary-foreground text-xs font-semibold mb-3">
              <Sparkles className="w-3.5 h-3.5" /> Oferta estrella
            </span>
            <h2 className="text-3xl md:text-4xl font-display leading-tight text-foreground">
              Hamburguesa
              <br />
              <span className="font-script text-primary text-4xl md:text-5xl">Especial</span>
            </h2>
            <p className="text-muted-foreground mt-2 md:mt-3 text-sm md:text-base">
              Carne de res con ingredientes especiales de la casa, una combinación única.
              ¡Pídela ahora y siéntete una estrella! ✨
            </p>

            <div className="flex items-baseline gap-3 mt-4 md:mt-5">
              <span className="text-3xl font-display text-primary">$20.000</span>
            </div>

            <div className="flex flex-col sm:flex-row gap-2 mt-5 md:mt-6">
              <Button
                size="lg"
                onClick={() => {
                  if (product) onOpenProduct(product);
                  setOpen(false);
                }}
                className="bg-gradient-hero text-primary-foreground border-0 shadow-soft hover:shadow-glow transition-smooth"
              >
                ¡La quiero! 🍔
              </Button>
              <Button
                variant="outline"
                size="lg"
                onClick={() => setOpen(false)}
                className="border-2 border-primary text-primary hover:bg-primary hover:text-primary-foreground transition-smooth"
              >
                Seguir mirando
              </Button>
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};
