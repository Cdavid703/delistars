import { useState } from "react";
import { MapPin, Search, Loader2 } from "lucide-react";
import { consultarCobertura, type Cobertura } from "@/lib/cobertura";

const fmt = (n: number) => `$${n.toLocaleString("es-CO")}`;

// "¿Cuál me queda más cerca?" dentro de la elección de sede: el visitante
// escribe su dirección y ve, por sede, si hay domicilio, cuánto vale y cuánto
// tarda el recorrido. Antes elegía a ciegas (y a veces pedía en la sede lejana).
export const CoberturaCheck = ({
  sedes,
  onElegir,
}: {
  sedes: { id_sede: number; nombre_sede: string }[];
  onElegir: (id: number) => void;
}) => {
  const [abierto, setAbierto] = useState(false);
  const [texto, setTexto] = useState("");
  const [cargando, setCargando] = useState(false);
  const [res, setRes] = useState<Cobertura | null | "error">(null);

  const nombre = (id: number) => sedes.find((s) => s.id_sede === id)?.nombre_sede ?? "";

  const buscar = async (e: React.FormEvent) => {
    e.preventDefault();
    if (texto.trim().length < 5) return;
    setCargando(true);
    const r = await consultarCobertura(texto.trim());
    setRes(r ?? "error");
    setCargando(false);
  };

  if (!abierto) {
    return (
      <button
        onClick={() => setAbierto(true)}
        className="w-full min-h-[44px] mt-2 rounded-xl border-2 border-dashed border-primary/40 text-primary text-sm font-semibold flex items-center justify-center gap-2 hover:bg-primary/5 transition-smooth"
      >
        <MapPin className="w-4 h-4" /> ¿Cuál me queda más cerca? Escribe tu dirección
      </button>
    );
  }

  const llega = res && res !== "error" ? res.opciones.filter((o) => o.precio !== null) : [];

  return (
    <div className="mt-2 bg-card rounded-2xl p-4 shadow-card animate-fade-in">
      <form onSubmit={buscar} className="flex gap-2">
        <input
          autoFocus
          value={texto}
          onChange={(e) => setTexto(e.target.value)}
          placeholder="Ej: Carrera 109 #43-7"
          className="flex-1 min-w-0 min-h-[44px] rounded-xl border border-border bg-background px-3 text-sm"
        />
        <button
          type="submit"
          disabled={cargando || texto.trim().length < 5}
          className="min-h-[44px] px-4 rounded-xl bg-gradient-hero text-primary-foreground font-semibold text-sm flex items-center gap-1.5 disabled:opacity-60"
        >
          {cargando ? <Loader2 className="w-4 h-4 animate-spin" /> : <Search className="w-4 h-4" />}
          Calcular
        </button>
      </form>

      {res === "error" && (
        <p className="mt-3 text-xs text-muted-foreground">No pudimos calcularlo ahora. Elige la sede y te confirmamos el domicilio al pedir.</p>
      )}

      {res && res !== "error" && res.opciones.length === 0 && (
        <p className="mt-3 text-xs text-muted-foreground">No encontramos esa dirección. Revisa que tenga calle o carrera y número (ej: Calle 50 #40-10).</p>
      )}

      {res && res !== "error" && res.opciones.length > 0 && (
        <div className="mt-3 space-y-2">
          <p className="text-xs text-muted-foreground">📍 {res.direccion}</p>
          {llega.length === 0 && (
            <p className="text-sm font-semibold text-primary">
              Estás un poco lejos para domicilio, pero puedes pedir y recoger en la sede.
            </p>
          )}
          {res.opciones.map((o, i) => (
            <div
              key={o.slug}
              className={`rounded-xl border-2 p-3 flex items-center gap-3 ${i === 0 && o.precio !== null ? "border-primary bg-primary/5" : "border-border"}`}
            >
              <div className="flex-1 min-w-0">
                <p className="font-display text-base text-primary leading-tight">
                  {nombre(o.id)}
                  {i === 0 && o.precio !== null && (
                    <span className="ml-2 text-[10px] font-body font-bold uppercase tracking-wider bg-primary text-primary-foreground px-1.5 py-0.5 rounded-full align-middle">
                      Te conviene
                    </span>
                  )}
                </p>
                <p className="text-xs text-muted-foreground mt-0.5">
                  {o.km.toFixed(1)} km por calle
                  {o.min ? ` · ~${o.min} min de camino` : ""}
                  {o.precio !== null ? <> · domicilio <strong className="text-foreground">{fmt(o.precio)}</strong></> : " · no llega a domicilio"}
                </p>
              </div>
              <button
                onClick={() => onElegir(o.id)}
                className="shrink-0 min-h-[44px] px-3 rounded-xl bg-gradient-hero text-primary-foreground text-xs font-semibold"
              >
                Pedir aquí
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};
