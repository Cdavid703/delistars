// Campañas de Mercadeo en el menú (especificación §17): franja de campañas,
// enlace de una notificación (?campana=<id>) y lo que se recuerda para
// atribuir el pedido (ds_campana, lo lee la web de domicilios al enviarlo).
const API_BASE_URL = import.meta.env.VITE_API_URL || "http://localhost:3000/api/v1";
const H24 = 24 * 60 * 60 * 1000;

export interface CampanaPublica {
  id: string;
  vigente: boolean;
  terminada: boolean;
  titulo: string;
  texto: string;
  destino: { tipo: "menu" | "producto" | "categoria" | "premios"; id?: string | number; sedeId?: string };
  sedeId: string | null;
  fin: number | null;
}

/** Id anónimo de este navegador (solo para no contar dos veces la misma apertura). */
function visitante(): string {
  try {
    let v = localStorage.getItem("ds_visitante");
    if (!v) {
      v = (crypto.randomUUID?.() || `${Date.now()}-${Math.random().toString(36).slice(2)}`).replace(/[^A-Za-z0-9-]/g, "");
      localStorage.setItem("ds_visitante", v);
    }
    return v;
  } catch { return ""; }
}

export async function franja(sedeSlug: string | null): Promise<CampanaPublica[]> {
  try {
    const r = await fetch(`${API_BASE_URL}/mercadeo/franja${sedeSlug ? `?sedeId=${sedeSlug}` : ""}`);
    return r.ok ? await r.json() : [];
  } catch { return []; }
}

export async function campanaPublica(id: string): Promise<CampanaPublica | null> {
  try {
    const r = await fetch(`${API_BASE_URL}/mercadeo/campanas/${encodeURIComponent(id)}/publica`);
    return r.ok ? await r.json() : null;
  } catch { return null; }
}

/** Apertura (llegó por la notificación) o clic (tocó la franja). No bloquea nada. */
export function registrar(campanaId: string, tipo: "apertura" | "clic") {
  fetch(`${API_BASE_URL}/mercadeo/eventos`, {
    method: "POST", headers: { "content-type": "application/json" },
    body: JSON.stringify({ campanaId, tipo, visitante: visitante() }), keepalive: true,
  }).catch(() => undefined);
}

/** Recuerda la última campaña abierta (24 h) para atribuirle el pedido. */
export function recordar(c: CampanaPublica) {
  try { localStorage.setItem("ds_campana", JSON.stringify({ id: c.id, sedeId: c.sedeId, abiertaAt: Date.now() })); } catch { /* sin almacenamiento */ }
}

export const vigenteGuardada = (): { id: string; abiertaAt: number } | null => {
  try {
    const c = JSON.parse(localStorage.getItem("ds_campana") || "null");
    return c?.id && Date.now() - Number(c.abiertaAt) < H24 ? { id: c.id, abiertaAt: Number(c.abiertaAt) } : null;
  } catch { return null; }
};
