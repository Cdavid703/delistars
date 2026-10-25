// Agotado por sede (§7.2, P-14; 25 oct 2026). La caja marca un producto agotado
// solo en su sede (agotados/{sedeSlug} en Firestore: { ids, nombres }). El
// producto sigue en el menú con la etiqueta «Agotado» y no se puede agregar; si
// ya estaba en el carrito, se señala y hay que quitarlo antes de pedir (no se
// borra solo). El servidor también lo rechaza (409 agotado_en_sede).
import { useEffect, useState } from "react";
import { doc, onSnapshot } from "firebase/firestore";
import { db } from "@/services/firebase";

const VACIO: ReadonlySet<number> = new Set();

/** Ids agotados en la sede, en vivo. Sin sede o sin conexión: ninguno. */
export function useAgotados(sedeSlug: string | null): ReadonlySet<number> {
  const [ids, setIds] = useState<ReadonlySet<number>>(VACIO);
  useEffect(() => {
    if (!sedeSlug) { setIds(VACIO); return; }
    return onSnapshot(
      doc(db, "agotados", sedeSlug),
      (snap) => setIds(new Set(((snap.data()?.ids as unknown[]) || []).map(Number))),
      () => setIds(VACIO),
    );
  }, [sedeSlug]);
  return ids;
}

interface ItemConOpciones {
  product: { id_producto: number; nombre_producto: string };
  addons?: { id: number; name: string }[];
  salsas?: { id: number; name: string }[];
  cebollas?: { id: number; name: string }[];
  unidadesIds?: { salsas: number[]; cebollas: number[] }[];
}

/** Qué se agotó de este ítem del carrito (el producto o alguna de sus opciones). */
export function agotadoEnItem(it: ItemConOpciones, agotados: ReadonlySet<number>): string[] {
  if (!agotados.size) return [];
  const out: string[] = [];
  if (agotados.has(it.product.id_producto)) out.push(it.product.nombre_producto);
  for (const o of [...(it.addons || []), ...(it.salsas || []), ...(it.cebollas || [])]) {
    if (agotados.has(o.id) && !out.includes(o.name)) out.push(o.name);
  }
  for (const u of it.unidadesIds || []) {
    for (const id of [...(u.salsas || []), ...(u.cebollas || [])]) {
      if (agotados.has(id) && !out.includes("una salsa o cebolla del combo")) out.push("una salsa o cebolla del combo");
    }
  }
  return out;
}
