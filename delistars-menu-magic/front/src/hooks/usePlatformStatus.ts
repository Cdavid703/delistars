import { useEffect, useState } from "react";
import { doc, onSnapshot } from "firebase/firestore";
import { db } from "@/services/firebase";

// Estado de la plataforma de domicilios (config/client_platform.active),
// el mismo interruptor que maneja la caja y el admin. El menú lo lee para
// permitir navegar siempre, pero avisar al intentar pedir cuando está cerrada.
// null = aún cargando (no bloquear todavía).
export function usePlatformStatus(): boolean | null {
  const [active, setActive] = useState<boolean | null>(null);

  useEffect(() => {
    return onSnapshot(
      doc(db, "config", "client_platform"),
      (snap) => setActive(snap.exists() ? !!snap.data().active : false),
      // Si no se puede leer (permiso/red), no bloqueamos el pedido.
      () => setActive(true),
    );
  }, []);

  return active;
}
