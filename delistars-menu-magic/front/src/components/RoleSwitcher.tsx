import { useEffect, useRef, useState } from "react";
import { ChevronDown, ShieldCheck, Calculator, Bike, ShoppingBag } from "lucide-react";
import type { User } from "firebase/auth";
import { useAllRoles } from "@/hooks/useAllRoles";
import { ROLES, type RoleName } from "@/lib/staff";

const ROLE_META: Record<RoleName, { label: string; Icon: typeof ShieldCheck; pill: string }> = {
  [ROLES.ADMIN]:   { label: "Admin",        Icon: ShieldCheck, pill: "bg-cherry/15 text-cherry" },
  [ROLES.CASHIER]: { label: "Cajero",       Icon: Calculator,  pill: "bg-primary/15 text-primary" },
  [ROLES.DRIVER]:  { label: "Domiciliario", Icon: Bike,        pill: "bg-emerald-500/15 text-emerald-600" },
  [ROLES.CLIENT]:  { label: "Cliente",      Icon: ShoppingBag, pill: "bg-muted text-muted-foreground" },
};

// Deja guardada la elección en localStorage con la MISMA clave que usa
// AuthContext en la app de domicilios (comparten origen/dominio), así al
// navegar allá ya respeta el rol elegido sin pasar por la pantalla de elección.
function persistViewingAs(uid: string, role: RoleName | null) {
  localStorage.setItem(`viewingAs_${uid}`, role === null ? "null" : role);
}

export function RoleSwitcher({ user }: { user: User | null }) {
  const allRoles = useAllRoles(user);
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  if (!user || allRoles.length <= 1) return null;

  const ownRole = allRoles[0];
  const goTo = (target: RoleName) => {
    if (!user) return;
    setOpen(false);
    if (target === ROLES.CLIENT) {
      persistViewingAs(user.uid, ROLES.CLIENT);
      return; // ya estamos en el menú (vista cliente)
    }
    persistViewingAs(user.uid, target);
    window.location.href = target === ROLES.ADMIN ? "/admin/" : "/domicilios/";
  };

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen((v) => !v)}
        className="flex items-center gap-1 px-2 py-1.5 rounded-full text-sm font-medium text-muted-foreground hover:text-primary hover:bg-secondary/60 transition-smooth"
        title="Cambiar de panel"
      >
        <ShieldCheck className="w-4 h-4" />
        <span className="hidden sm:inline">Mis paneles</span>
        <ChevronDown className={`w-3.5 h-3.5 transition-transform ${open ? "rotate-180" : ""}`} />
      </button>

      {open && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
          <div className="absolute right-0 mt-2 w-56 z-50 bg-background border border-border rounded-xl shadow-card overflow-hidden animate-fade-in">
            <p className="px-4 pt-3 pb-1.5 text-[10px] uppercase tracking-widest text-muted-foreground font-semibold">
              Entrar como
            </p>
            {allRoles.map((r) => {
              const meta = ROLE_META[r];
              const isOwn = r === ownRole;
              return (
                <button
                  key={r}
                  onClick={() => goTo(r)}
                  className="w-full flex items-center gap-3 px-4 py-2.5 text-left hover:bg-secondary/60 transition-smooth"
                >
                  <span className={`flex items-center justify-center w-7 h-7 rounded-full flex-shrink-0 ${meta.pill}`}>
                    <meta.Icon className="w-3.5 h-3.5" />
                  </span>
                  <span className="text-sm font-medium text-foreground">{meta.label}</span>
                  {isOwn && <span className="ml-auto text-[10px] text-muted-foreground">tu rol</span>}
                </button>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}
