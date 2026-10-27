import { Bike } from "lucide-react";
import { useSinDomicilio } from "@/hooks/useSinDomicilio";

/**
 * Aviso de los días sin domicilios (lunes: pico y placa del domiciliario,
 * pedido de David del 26 oct 2026). Va dentro de la página, donde se lee al
 * abrir el menú: arriba del todo quedaba tapado en algunos celulares.
 */
export const AvisoSinDomicilio = ({ className = "" }: { className?: string }) => {
  const hoy = useSinDomicilio();
  if (!hoy) return null;
  return (
    <div role="status" className={`rounded-2xl bg-mustard text-foreground px-4 py-3 flex items-start gap-3 shadow-card ${className}`}>
      <Bike className="w-6 h-6 shrink-0 mt-0.5" aria-hidden="true" />
      <p className="text-base font-semibold leading-snug">{hoy.texto}</p>
    </div>
  );
};
