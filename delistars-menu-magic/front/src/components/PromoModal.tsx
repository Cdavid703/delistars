import { useEffect, useState } from "react";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Flame, X } from "lucide-react";
import { useCart } from "@/context/CartContext";

// Promoción de temporada. Aparece DESPUÉS de que el visitante elige sede (antes
// no: el modal de sede es obligatorio y dos ventanas encima se estorban).
//
// Para cambiar de promoción se edita este bloque; para apagarla, basta con
// quitar <PromoModal /> de Index.tsx.
const PROMO = {
  producto: "Mexistars",           // debe coincidir con el nombre en el menú
  imagen: "/productos/mexistars.jpg",
  precio: "$23.000",
  titulo: "MexiStars",
  gancho: "¡Sabor que enamora!",
  detalle: "Carne, queso fundido, tocineta, nachos, pico de gallo y jalapeños, con mayochipotle y guacamole.",
};

// Se muestra una vez al día por navegador: promocionar es bueno, perseguir no.
const CLAVE = "ds_promo_vista";
const UN_DIA = 24 * 60 * 60 * 1000;

/** ?promo=1 en la URL la fuerza, aunque ya se haya visto hoy (para revisarla). */
const forzada = () => {
  try {
    return new URLSearchParams(window.location.search).get("promo") === "1";
  } catch {
    return false;
  }
};

function yaLaVio() {
  if (forzada()) return false;
  try {
    const t = Number(localStorage.getItem(CLAVE) || 0);
    return Date.now() - t < UN_DIA;
  } catch {
    return false; // navegador sin almacenamiento: se muestra igual
  }
}

export const PromoModal = () => {
  const { sede } = useCart();
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!sede || yaLaVio()) return;
    // Pequeña pausa: si aparece en el mismo instante en que se cierra el modal
    // de sede, se siente como si el clic hubiera abierto otra cosa por error.
    const id = setTimeout(() => setOpen(true), 600);
    return () => clearTimeout(id);
  }, [sede]);

  const cerrar = () => {
    setOpen(false);
    try { localStorage.setItem(CLAVE, String(Date.now())); } catch { /* sin almacenamiento */ }
  };

  const verProducto = () => {
    cerrar();
    // MenuSection escucha esto: abre la categoría del producto, baja hasta
    // ella y muestra la ficha. El scroll lo hace allá para no duplicarlo.
    window.dispatchEvent(new CustomEvent("ds:ver-producto", { detail: PROMO.producto }));
  };

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) cerrar(); }}>
      <DialogContent className="max-w-sm w-[92vw] p-0 overflow-hidden border-0 bg-coal text-cream [&>button]:hidden">
        <button onClick={cerrar} aria-label="Cerrar"
          className="absolute right-3 top-3 z-10 w-8 h-8 rounded-full bg-black/50 text-white flex items-center justify-center hover:bg-black/70 transition-smooth">
          <X className="w-4 h-4" />
        </button>

        <img src={PROMO.imagen} alt={PROMO.titulo} className="w-full aspect-square object-cover" />

        <div className="p-5 text-center">
          <span className="inline-flex items-center gap-1.5 bg-primary/20 text-primary rounded-full px-3 py-1 text-xs font-semibold uppercase tracking-wide">
            <Flame className="w-3.5 h-3.5" /> Hamburguesa de temporada
          </span>

          <h2 className="font-display text-3xl mt-3 leading-none">{PROMO.titulo}</h2>
          <p className="text-sm text-cream/70 mt-1">{PROMO.gancho}</p>
          <p className="font-display text-4xl text-secondary mt-3">{PROMO.precio}</p>
          <p className="text-xs text-cream/60 mt-3 leading-relaxed">{PROMO.detalle}</p>

          <Button onClick={verProducto} size="lg"
            className="w-full mt-5 bg-gradient-hero text-primary-foreground border-0">
            La quiero probar
          </Button>
          <button onClick={cerrar} className="text-xs text-cream/50 mt-3 underline underline-offset-2">
            Ahora no, gracias
          </button>
        </div>
      </DialogContent>
    </Dialog>
  );
};
