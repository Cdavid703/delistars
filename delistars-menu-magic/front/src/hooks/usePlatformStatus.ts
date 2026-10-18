import { useEffect, useState } from "react";
import { doc, onSnapshot } from "firebase/firestore";
import { db } from "@/services/firebase";
import { useCart } from "@/context/CartContext";
import { SEDES } from "@/data/menu";
import { estadoSede, textoEstado, type Horario } from "@/lib/horarios";

// ¿Recibe pedidos la sede elegida? Sale de config/horarios (horarios por sede
// que define administración, especificación §16.2). El menú se puede navegar
// siempre; al intentar pedir con la sede cerrada se avisa cuándo abre.
// abierta = null mientras carga (no bloquear todavía).
export function usePlatformStatus(): { abierta: boolean | null; texto: string } {
  const { sede } = useCart();
  const slug = SEDES.find((s) => s.id === sede)?.slug ?? null;
  const [horarios, setHorarios] = useState<Record<string, Horario> | null | undefined>(undefined);
  const [ahora, setAhora] = useState(() => Date.now());

  useEffect(() => onSnapshot(
    doc(db, "config", "horarios"),
    (snap) => setHorarios(snap.exists() ? (snap.data() as Record<string, Horario>) : null),
    // Si no se puede leer (permiso/red), no se bloquea el pedido.
    () => setHorarios(null),
  ), []);

  // El estado cambia con la hora: se recalcula cada minuto.
  useEffect(() => {
    const id = setInterval(() => setAhora(Date.now()), 60_000);
    return () => clearInterval(id);
  }, []);

  if (horarios === undefined || !slug) return { abierta: null, texto: "" };
  const e = estadoSede(horarios?.[slug], ahora);
  return { abierta: e.abierta, texto: textoEstado(e, ahora) };
}
