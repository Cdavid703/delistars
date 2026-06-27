import { MapPin, Phone, Clock } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { apiService } from "@/services/api";

export const Encuentranos = () => {
  const { data: sedes = [], isLoading } = useQuery({
    queryKey: ['sedes'],
    queryFn: () => apiService.getSedes(),
  });

  return (
    <section id="encuentranos" className="py-16 md:py-24 scroll-mt-20">
      <div className="container">
        <div className="text-center mb-12 space-y-2 animate-fade-in">
          <span className="text-5xl inline-block">📍</span>
          <h2 className="text-4xl md:text-5xl font-display">Encuéntranos</h2>
          <p className="text-muted-foreground">Te esperamos en cualquiera de nuestras sedes</p>
          <div className="w-20 h-1 bg-gradient-hero rounded-full mx-auto mt-3" />
        </div>

        <div className="grid md:grid-cols-2 gap-6">
          {isLoading ? (
            <div className="col-span-2 text-center text-muted-foreground p-4">Cargando ubicaciones...</div>
          ) : (
            sedes.map((s) => (
              <div key={s.id_sede} className="bg-card rounded-3xl overflow-hidden shadow-card hover-lift">
                <iframe
                  src={`https://www.google.com/maps?q=${encodeURIComponent(`DeliStars ${s.nombre_sede}`)}&output=embed`}
                  className="w-full h-56 border-0"
                  loading="lazy"
                  title={`Mapa ${s.nombre_sede}`}
                />
                <div className="p-6 space-y-3">
                  <h3 className="font-display text-2xl text-primary">{s.nombre_sede}</h3>
                  <p className="flex items-start gap-2 text-sm"><MapPin className="w-4 h-4 mt-0.5 text-primary shrink-0" /> {s.direccion_sede}</p>
                  <p className="flex items-center gap-2 text-sm"><Phone className="w-4 h-4 text-primary shrink-0" /> {s.telefono_sede}</p>
                  <div className="flex flex-col gap-1 text-sm mt-2">
                    <p className="flex items-center gap-2 font-medium"><Clock className="w-4 h-4 text-primary shrink-0" /> Horarios:</p>
                    <p className="ml-6 text-muted-foreground text-xs">Lunes a Jueves: {s.horario_lunes_jueves}</p>
                    <p className="ml-6 text-muted-foreground text-xs">Viernes: {s.horario_viernes}</p>
                    <p className="ml-6 text-muted-foreground text-xs">Sábados: {s.horario_sabado}</p>
                    <p className="ml-6 text-muted-foreground text-xs">Domingos: {s.horario_domingo}</p>
                  </div>
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </section>
  );
};
