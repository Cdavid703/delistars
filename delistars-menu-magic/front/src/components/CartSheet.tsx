import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { useCart, formatCOP } from "@/context/CartContext";
import { SEDES } from "@/data/menu";
import { Minus, Plus, Trash2, ShoppingBag } from "lucide-react";

export const CartSheet = () => {
  const { items, isOpen, setOpen, removeItem, updateQty, total, count, sede } = useCart();

  const handleOrder = () => {
    const handoff = {
      items: items.map((it) => ({
        name: it.product.nombre_producto,
        quantity: it.quantity,
        unitPrice: it.unitPrice,
        addons: it.addons.map((a) => a.name),
        notes: it.notes,
      })),
      total,
      // El slug de la sede es la única fuente de verdad (definido en data/menu.ts).
      sedeId: SEDES.find((s) => s.id === sede)?.slug ?? null,
    };
    localStorage.setItem("ds_cart_handoff", JSON.stringify(handoff));
    window.location.href = "/domicilios/";
  };

  return (
    <>
      <Sheet open={isOpen} onOpenChange={setOpen}>
        <SheetContent className="w-full sm:max-w-md flex flex-col p-0 bg-background">
          <SheetHeader className="p-6 border-b border-border">
            <SheetTitle className="font-display text-2xl flex items-center gap-2">
              <ShoppingBag className="text-primary" /> Tu carrito
              {count > 0 && <span className="text-sm text-muted-foreground font-normal">({count})</span>}
            </SheetTitle>
          </SheetHeader>

          {items.length === 0 ? (
            <div className="flex-1 flex flex-col items-center justify-center p-6 text-center">
              <div className="text-6xl mb-3 animate-bounce-soft">🛒</div>
              <p className="text-muted-foreground">Tu carrito está vacío</p>
              <p className="text-sm text-muted-foreground mt-1">¡Añade algo delicioso del menú!</p>
            </div>
          ) : (
            <>
              <div className="flex-1 overflow-y-auto p-4 space-y-3">
                {items.map((it) => (
                  <div key={it.uid} className="bg-card rounded-2xl p-3 flex gap-3 shadow-card animate-scale-in">
                    <img src={it.product.image_url1 || ""} alt={it.product.nombre_producto} className="w-20 h-20 rounded-xl object-cover" />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-start justify-between gap-2">
                        <h4 className="font-display text-sm leading-tight">{it.product.nombre_producto}</h4>
                        <button onClick={() => removeItem(it.uid)} className="text-muted-foreground hover:text-destructive transition-smooth">
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                      {it.addons.length > 0 && (
                        <p className="text-xs text-muted-foreground mt-1 line-clamp-2">
                          + {it.addons.map((a) => a.name).join(", ")}
                        </p>
                      )}
                      {it.notes && <p className="text-xs italic text-muted-foreground mt-1">"{it.notes}"</p>}
                      <div className="flex items-center justify-between mt-2">
                        <div className="flex items-center gap-1 bg-muted rounded-full">
                          <button onClick={() => updateQty(it.uid, it.quantity - 1)} className="p-1 hover:text-primary">
                            <Minus className="w-3 h-3" />
                          </button>
                          <span className="text-sm font-semibold w-6 text-center">{it.quantity}</span>
                          <button onClick={() => updateQty(it.uid, it.quantity + 1)} className="p-1 hover:text-primary">
                            <Plus className="w-3 h-3" />
                          </button>
                        </div>
                        <span className="font-display text-primary text-sm">{formatCOP(it.unitPrice * it.quantity)}</span>
                      </div>
                    </div>
                  </div>
                ))}
              </div>

              <div className="p-6 border-t border-border bg-gradient-soft space-y-4">
                <div className="flex justify-between items-center">
                  <span className="font-display text-lg">Total</span>
                  <span className="font-display text-2xl text-primary">{formatCOP(total)}</span>
                </div>
                <Button onClick={handleOrder} size="lg" className="w-full bg-gradient-hero text-primary-foreground border-0 shadow-soft hover:shadow-glow transition-smooth">
                  Hacer pedido
                </Button>
              </div>
            </>
          )}
        </SheetContent>
      </Sheet>
    </>
  );
};
