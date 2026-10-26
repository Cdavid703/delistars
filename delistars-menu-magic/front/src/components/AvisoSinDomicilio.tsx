import { useEffect, useState } from "react";
import { Bike } from "lucide-react";
import { sinDomicilioHoy } from "@/lib/sinDomicilio";

/** Hoy (hora de Colombia) no hay domicilios: null si sí hay. Se revisa cada minuto. */
export function useSinDomicilio() {
  const [ahora, setAhora] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setAhora(Date.now()), 60_000);
    return () => clearInterval(id);
  }, []);
  return sinDomicilioHoy(ahora);
}

/**
 * Franja arriba del menú los días sin domicilios (lunes: pico y placa del
 * domiciliario, pedido de David del 26 oct 2026), para que el cliente lo sepa
 * antes de armar el carrito.
 */
export const AvisoSinDomicilio = () => {
  const hoy = useSinDomicilio();
  if (!hoy) return null;
  return (
    <div role="status" className="bg-mustard text-foreground">
      <p className="container px-4 sm:px-6 py-2 flex items-center justify-center gap-2 text-center text-xs sm:text-sm font-semibold leading-snug">
        <Bike className="w-4 h-4 shrink-0" aria-hidden="true" />
        {hoy.texto}
      </p>
    </div>
  );
};
