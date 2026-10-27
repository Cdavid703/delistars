import { useEffect, useState } from "react";
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
