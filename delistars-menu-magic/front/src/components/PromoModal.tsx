import { useEffect, useState } from "react";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Heart, X } from "lucide-react";
import { useCart } from "@/context/CartContext";

// Promoción de temporada. Aparece DESPUÉS de que el visitante elige sede (antes
// no: el modal de sede es obligatorio y dos ventanas encima se estorban).
//
// Las piezas ya traen el nombre, el contenido y el precio impresos, así que el
// popup solo las muestra: el texto no se repite debajo. En el menú, en cambio,
// cada combo usa una foto sin texto y toda esa información va en su descripción.
//
// Para cambiar de promoción se edita PROMOS; para apagarla, basta con quitar
// <PromoModal /> de Index.tsx (o dejar PROMOS vacío).
const PROMOS = [
  {
    producto: "Combo Amor",        // debe coincidir con el nombre en el menú
    imagen: "/promos/combo-amor.jpg",
    alt: "Combo Amor: 2 hamburguesas especiales, papas grandes y 2 bebidas por $54.900",
  },
  {
    producto: "Combo Amistad",
    imagen: "/promos/combo-amistad.jpg",
    alt: "Combo Amistad: perro especial, hamburguesa especial, papas grandes y 2 bebidas por $54.900",
  },
];

const ETIQUETA = "Amor y Amistad";

// Los combos son de temporada: solo septiembre. Pasada esta fecha el popup
// deja de aparecer SOLO, sin que nadie tenga que acordarse de bajarlo.
// La hora va con el desfase de Colombia a propósito: con una fecha "pelada" el
// navegador la interpreta en UTC y la promoción moriría a las 7:00 PM del 30.
const FIN = new Date("2026-10-01T00:00:00-05:00");

const enTemporada = () => Date.now() < FIN.getTime();

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
    if (!sede || yaLaVio() || PROMOS.length === 0 || !enTemporada()) return;
    // Pequeña pausa: si aparece en el mismo instante en que se cierra el modal
    // de sede, se siente como si el clic hubiera abierto otra cosa por error.
    const id = setTimeout(() => setOpen(true), 600);
    return () => clearTimeout(id);
  }, [sede]);

  const cerrar = () => {
    setOpen(false);
    try { localStorage.setItem(CLAVE, String(Date.now())); } catch { /* sin almacenamiento */ }
  };

  const verProducto = (nombre: string) => {
    cerrar();
    // MenuSection escucha esto: abre la categoría del producto, baja hasta
    // ella y muestra la ficha. El scroll lo hace allá para no duplicarlo.
    window.dispatchEvent(new CustomEvent("ds:ver-producto", { detail: nombre }));
  };

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) cerrar(); }}>
      <DialogContent className="max-w-3xl w-[94vw] max-h-[92dvh] overflow-y-auto p-0 border-0 bg-coal text-cream [&>button]:hidden">
        <button onClick={cerrar} aria-label="Cerrar"
          className="absolute right-3 top-3 z-10 w-8 h-8 rounded-full bg-black/50 text-white flex items-center justify-center hover:bg-black/70 transition-smooth">
          <X className="w-4 h-4" />
        </button>

        <div className="px-5 pt-5 text-center">
          <span className="inline-flex items-center gap-1.5 bg-primary/20 text-primary rounded-full px-3 py-1 text-xs font-semibold uppercase tracking-wide">
            <Heart className="w-3.5 h-3.5" /> {ETIQUETA}
          </span>
        </div>

        {/* Las piezas se ven completas: no se recortan ni se tapan con texto */}
        <div className="grid gap-4 p-5 sm:grid-cols-2">
          {PROMOS.map((p) => (
            <button
              key={p.producto}
              onClick={() => verProducto(p.producto)}
              className="group block w-full text-left rounded-2xl overflow-hidden bg-black/20 transition-smooth hover:ring-2 hover:ring-primary focus-visible:ring-2 focus-visible:ring-primary"
            >
              <img
                src={p.imagen}
                alt={p.alt}
                loading="lazy"
                className="w-full h-auto block"
              />
              <span className="block py-3 text-center text-sm font-semibold text-cream group-hover:text-primary transition-smooth">
                Lo quiero pedir
              </span>
            </button>
          ))}
        </div>

        <div className="pb-6 text-center">
          <button onClick={cerrar} className="text-xs text-cream/50 underline underline-offset-2">
            Ahora no, gracias
          </button>
        </div>
      </DialogContent>
    </Dialog>
  );
};
