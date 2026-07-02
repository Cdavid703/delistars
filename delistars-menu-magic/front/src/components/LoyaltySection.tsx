import { useEffect, useState } from "react";
import { collection, doc, onSnapshot } from "firebase/firestore";
import type { Timestamp } from "firebase/firestore";
import { db } from "@/services/firebase";
import { useStaffAuth } from "@/hooks/useStaffAuth";
import { Button } from "@/components/ui/button";
import { Gift, LogIn, MapPin, Package, MessageSquare } from "lucide-react";

// La fidelización vive en Firestore (customers/{uid} + subcolección rewards),
// escrita por la app de domicilios. Aquí solo se LEE: el menú es donde el
// cliente pasa su tiempo ahora, así que el progreso debe verse aquí.
const SEDE_NAMES: Record<string, string> = {
  santa_lucia: "Santa Lucía",
  santa_teresita: "Santa Teresita",
};

type SedeLoyalty = { count?: number; totalDelivered?: number };
interface Reward {
  id: string;
  sedeId: string;
  status: string;
  expiresAt?: Timestamp;
}

// Un premio puede seguir con status 'available' aunque ya venció (nada lo
// actualiza solo) — siempre validar la fecha además del status.
const isLive = (r: Reward) =>
  r.status === "available" && (!r.expiresAt?.toDate || r.expiresAt.toDate().getTime() > Date.now());

export const LoyaltySection = () => {
  const { user, login } = useStaffAuth();
  const isGoogleUser = !!user?.email;
  const [loyalty, setLoyalty] = useState<Record<string, SedeLoyalty>>({});
  const [rewards, setRewards] = useState<Reward[]>([]);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!user?.uid || !user.email) { setLoyalty({}); setRewards([]); return; }
    const unsub1 = onSnapshot(doc(db, "customers", user.uid), (snap) => {
      setLoyalty(snap.exists() ? ((snap.data().loyalty as Record<string, SedeLoyalty>) || {}) : {});
    }, () => {});
    const unsub2 = onSnapshot(collection(db, "customers", user.uid, "rewards"), (snap) => {
      setRewards(snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<Reward, "id">) })));
    }, () => {});
    return () => { unsub1(); unsub2(); };
  }, [user?.uid, user?.email]);

  const doLogin = async () => {
    setBusy(true);
    try { await login(); } catch { /* popup cerrado */ } finally { setBusy(false); }
  };

  // ─── Cliente sin cuenta: contarle las ventajas ────────────────────────────
  if (!isGoogleUser) {
    return (
      <section className="container px-4 sm:px-6 py-8">
        <div className="bg-gradient-soft border border-border rounded-3xl p-6 sm:p-8 shadow-card">
          <h2 className="font-display text-2xl sm:text-3xl text-foreground mb-1">
            🎁 Entra con Google y gana
          </h2>
          <p className="text-sm text-muted-foreground mb-5">
            Con tu cuenta de Google tus pedidos suman — como invitado no acumulas nada.
          </p>
          <div className="grid sm:grid-cols-3 gap-4 mb-6">
            <div className="flex items-start gap-3">
              <Gift className="w-6 h-6 text-primary shrink-0 mt-0.5" />
              <p className="text-sm text-foreground">
                <strong>Hamburguesa Especial GRATIS</strong> cada 10 domicilios entregados, en cada sede.
              </p>
            </div>
            <div className="flex items-start gap-3">
              <Package className="w-6 h-6 text-primary shrink-0 mt-0.5" />
              <p className="text-sm text-foreground">
                <strong>Pide más rápido:</strong> tu nombre, teléfono y direcciones quedan guardados.
              </p>
            </div>
            <div className="flex items-start gap-3">
              <MessageSquare className="w-6 h-6 text-primary shrink-0 mt-0.5" />
              <p className="text-sm text-foreground">
                <strong>Sigue tu pedido</strong> en tiempo real y chatea directo con la caja.
              </p>
            </div>
          </div>
          <Button onClick={doLogin} disabled={busy} size="lg"
            className="bg-gradient-hero text-primary-foreground border-0 shadow-soft hover:shadow-glow transition-smooth">
            <LogIn className="w-4 h-4" /> {busy ? "Conectando…" : "Entrar con Google"}
          </Button>
        </div>
      </section>
    );
  }

  // ─── Cliente con cuenta: su progreso real por sede ────────────────────────
  const sedeIds = Object.keys(SEDE_NAMES);
  const liveRewards = rewards.filter(isLive);

  return (
    <section className="container px-4 sm:px-6 py-8">
      <div className="bg-gradient-soft border border-border rounded-3xl p-6 sm:p-8 shadow-card">
        <div className="flex flex-wrap items-center justify-between gap-3 mb-1">
          <h2 className="font-display text-2xl sm:text-3xl text-foreground">🍔 Tu fidelización</h2>
          <a href="/domicilios/"
            className="text-sm font-medium text-primary underline underline-offset-4 hover:opacity-80">
            Ver mis pedidos →
          </a>
        </div>
        <p className="text-sm text-muted-foreground mb-5">
          Cada 10 domicilios entregados te regalamos una <strong>Hamburguesa Especial</strong> ($20.000) — el progreso es independiente en cada sede.
        </p>

        {liveRewards.length > 0 && (
          <div className="bg-primary/10 border border-primary/30 rounded-2xl px-4 py-3 mb-5 flex items-center gap-3">
            <Gift className="w-6 h-6 text-primary shrink-0" />
            <p className="text-sm text-foreground">
              <strong>¡Tienes {liveRewards.length} premio{liveRewards.length > 1 ? "s" : ""} disponible{liveRewards.length > 1 ? "s" : ""}!</strong>{" "}
              Lo canjeas al hacer tu próximo pedido{liveRewards.length > 1 ? " (hasta 3 a la vez)" : ""}.
            </p>
          </div>
        )}

        <div className="grid sm:grid-cols-2 gap-4">
          {sedeIds.map((sedeId) => {
            const loy = loyalty[sedeId] || {};
            const count = loy.count ?? 0;
            const inCycle = count % 10;
            const pct = count > 0 && inCycle === 0 ? 100 : (inCycle / 10) * 100;
            const sedeRewards = liveRewards.filter((r) => r.sedeId === sedeId).length;
            return (
              <div key={sedeId} className="bg-background border border-border rounded-2xl p-4">
                <div className="flex items-center justify-between mb-2">
                  <p className="font-display text-base text-foreground flex items-center gap-1.5">
                    <MapPin className="w-4 h-4 text-primary" /> {SEDE_NAMES[sedeId]}
                  </p>
                  {sedeRewards > 0 && (
                    <span className="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full bg-primary/15 text-primary">
                      {sedeRewards} premio{sedeRewards > 1 ? "s" : ""}
                    </span>
                  )}
                </div>
                <div className="w-full bg-muted rounded-full h-2.5 overflow-hidden">
                  <div className="bg-gradient-hero h-2.5 rounded-full transition-all" style={{ width: `${pct}%` }} />
                </div>
                <p className="text-xs text-muted-foreground mt-1.5">
                  {count}/10 domicilios entregados
                  {inCycle === 9 && " — ¡el próximo te regala tu Hamburguesa Especial! 🎉"}
                </p>
                {(loy.totalDelivered ?? 0) > 0 && (
                  <p className="text-[11px] text-muted-foreground mt-0.5">{loy.totalDelivered} entregados en total</p>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
};
