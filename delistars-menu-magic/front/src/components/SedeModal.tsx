import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { MapPin, Clock, Phone } from "lucide-react";
import { useCart } from "@/context/CartContext";
import logo from "@/assets/logo.svg";
import { useQuery } from "@tanstack/react-query";
import { apiService } from "@/services/api";

export const SedeModal = () => {
  const { sede, setSede } = useCart();
  const open = !sede;

  // Cargar sedes desde la base de datos
  const { data: sedes = [], isLoading } = useQuery({
    queryKey: ['sedes'],
    queryFn: () => apiService.getSedes(),
  });

  return (
    <Dialog open={open}>
      <DialogContent className="max-w-2xl w-[95vw] max-h-[90vh] flex flex-col border-0 bg-gradient-soft [&>button]:hidden p-4 md:p-6" onPointerDownOutside={(e) => e.preventDefault()} onEscapeKeyDown={(e) => e.preventDefault()}>
        <DialogHeader className="items-center text-center space-y-2 md:space-y-3 shrink-0">
          <img src={logo} alt="DeliStars" width={90} height={90} className="md:w-[120px] md:h-[120px] w-[90px] h-[90px] animate-bounce-soft object-contain" />
          <DialogTitle className="text-2xl md:text-3xl font-display">¡Bienvenido a DeliStars!</DialogTitle>
          <DialogDescription className="text-sm md:text-base">
            Antes de empezar, cuéntanos: <span className="font-semibold text-primary">¿en qué sede quieres pedir?</span>
          </DialogDescription>
        </DialogHeader>

        <div className="grid md:grid-cols-2 gap-3 md:gap-4 mt-2 md:mt-4 overflow-y-auto pr-1 sm:pr-2 pb-2">
          {isLoading ? (
             <div className="col-span-1 md:col-span-2 text-center text-muted-foreground p-4">Cargando sedes...</div>
          ) : (
            sedes.map((s) => (
              <button
                key={s.id_sede}
                onClick={() => setSede(s.id_sede)}
                className="group bg-card rounded-2xl p-6 text-left shadow-card hover-lift border-2 border-transparent hover:border-primary transition-smooth"
              >
                <h3 className="text-xl font-display text-primary mb-3 group-hover:scale-105 transition-bounce origin-left">
                  {s.nombre_sede}
                </h3>
                <div className="space-y-1 text-sm text-muted-foreground mb-4">
                  <p className="flex items-start gap-2 mb-2"><MapPin className="w-4 h-4 mt-0.5 text-primary shrink-0" /> {s.direccion_sede}</p>
                  <p className="flex items-center gap-2 text-primary font-medium"><Clock className="w-4 h-4 shrink-0" /> Horarios:</p>
                  <p className="ml-6 text-muted-foreground text-xs font-semibold">Lunes - Jueves: <span className="font-normal">{s.horario_lunes_jueves}</span></p>
                  <p className="ml-6 text-muted-foreground text-xs font-semibold">Viernes: <span className="font-normal">{s.horario_viernes}</span></p>
                  <p className="ml-6 text-muted-foreground text-xs font-semibold">Sábados: <span className="font-normal">{s.horario_sabado}</span></p>
                  <p className="ml-6 text-muted-foreground text-xs font-semibold">Domingos: <span className="font-normal">{s.horario_domingo}</span></p>
                  <p className="flex items-center gap-2 mt-2 pt-2"><Phone className="w-4 h-4 text-primary shrink-0" /> {s.telefono_sede}</p>
                </div>
                <Button variant="default" className="mt-4 w-full bg-gradient-hero text-primary-foreground border-0 shadow-soft">
                  Elegir esta sede
                </Button>
              </button>
            ))
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
};
