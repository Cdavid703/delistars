import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { MapPin, Clock, Phone, ChevronDown } from "lucide-react";
import { useCart } from "@/context/CartContext";
import logo from "@/assets/logo.svg";
import { useQuery } from "@tanstack/react-query";
import { apiService } from "@/services/api";

// Elección de sede. Es el PRIMER contacto con la marca, así que las dos sedes
// tienen que caber en pantalla sin hacer scroll.
//
// Antes no cabían: en celular el modal dejaba 250 px por debajo del borde y
// Santa Teresita quedaba oculta. El visitante veía una sola sede y elegía esa
// — y en los rechazos del mes aparece justo eso ("pidió en la sede de santa
// teresita"). Los horarios y el teléfono, que era lo que ocupaba el espacio,
// ahora van plegados.
export const SedeModal = () => {
  const { sede, setSede } = useCart();
  const [abierta, setAbierta] = useState<number | null>(null);
  const open = !sede;

  const { data: sedes = [], isLoading } = useQuery({
    queryKey: ["sedes"],
    queryFn: () => apiService.getSedes(),
  });

  return (
    <Dialog open={open}>
      <DialogContent
        className="max-w-2xl w-[95vw] max-h-[92vh] flex flex-col border-0 bg-gradient-soft [&>button]:hidden p-4 md:p-6"
        onPointerDownOutside={(e) => e.preventDefault()}
        onEscapeKeyDown={(e) => e.preventDefault()}
      >
        <DialogHeader className="items-center text-center space-y-1 md:space-y-3 shrink-0">
          <img
            src={logo}
            alt="DeliStars"
            className="w-14 h-14 md:w-[110px] md:h-[110px] animate-bounce-soft object-contain"
          />
          <DialogTitle className="text-xl md:text-3xl font-display">¡Bienvenido a DeliStars!</DialogTitle>
          <DialogDescription className="text-sm md:text-base">
            ¿En qué sede quieres pedir? <span className="font-semibold text-primary">Tenemos dos.</span>
          </DialogDescription>
        </DialogHeader>

        <div className="grid md:grid-cols-2 gap-2.5 md:gap-4 mt-2 md:mt-4 overflow-y-auto pr-1 pb-1">
          {isLoading ? (
            <div className="col-span-1 md:col-span-2 text-center text-muted-foreground p-4">Cargando sedes…</div>
          ) : (
            sedes.map((s) => (
              <div
                key={s.id_sede}
                className="bg-card rounded-2xl shadow-card border-2 border-transparent hover:border-primary transition-smooth overflow-hidden"
              >
                {/* Área principal: toda la tarjeta elige la sede. Alto cómodo
                    para el dedo, muy por encima del mínimo de 44 px. */}
                <button
                  onClick={() => setSede(s.id_sede)}
                  className="w-full text-left p-4 group"
                >
                  <h3 className="text-lg md:text-xl font-display text-primary group-hover:scale-[1.02] transition-bounce origin-left">
                    {s.nombre_sede}
                  </h3>
                  <p className="flex items-start gap-1.5 text-xs md:text-sm text-muted-foreground mt-1.5">
                    <MapPin className="w-4 h-4 mt-0.5 text-primary shrink-0" />
                    <span className="line-clamp-2">{s.direccion_sede}</span>
                  </p>
                  <span className="mt-3 flex items-center justify-center w-full min-h-[44px] rounded-xl bg-gradient-hero text-primary-foreground font-semibold shadow-soft">
                    Pedir en esta sede
                  </span>
                </button>

                {/* Horarios y teléfono plegados: son la información que antes
                    empujaba la segunda sede fuera de pantalla. */}
                <button
                  onClick={() => setAbierta(abierta === s.id_sede ? null : s.id_sede)}
                  className="w-full min-h-[44px] px-4 flex items-center gap-1.5 text-xs text-muted-foreground border-t border-border hover:bg-secondary/40 transition-smooth"
                >
                  <Clock className="w-3.5 h-3.5 text-primary shrink-0" />
                  Horarios y teléfono
                  <ChevronDown
                    className={`w-4 h-4 ml-auto transition-transform ${abierta === s.id_sede ? "rotate-180" : ""}`}
                  />
                </button>

                {abierta === s.id_sede && (
                  <div className="px-4 pb-3 space-y-0.5 text-xs text-muted-foreground animate-fade-in">
                    <p><span className="font-semibold">Lunes a jueves:</span> {s.horario_lunes_jueves}</p>
                    <p><span className="font-semibold">Viernes:</span> {s.horario_viernes}</p>
                    <p><span className="font-semibold">Sábados:</span> {s.horario_sabado}</p>
                    <p><span className="font-semibold">Domingos:</span> {s.horario_domingo}</p>
                    <a
                      href={`tel:${s.telefono_sede}`}
                      className="flex items-center gap-1.5 pt-2 text-primary font-semibold min-h-[44px]"
                    >
                      <Phone className="w-3.5 h-3.5 shrink-0" /> {s.telefono_sede}
                    </a>
                  </div>
                )}
              </div>
            ))
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
};
