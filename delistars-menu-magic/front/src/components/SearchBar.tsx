import { useState, useRef, useEffect } from "react";
import { Search, X } from "lucide-react";

interface SearchBarProps {
  value: string;
  onChange: (value: string) => void;
  resultsCount?: number;
}

export const SearchBar = ({ value, onChange, resultsCount }: SearchBarProps) => {
  const [focused, setFocused] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  // Shortcut: "/" abre la barra de búsqueda
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "/" && document.activeElement?.tagName !== "INPUT") {
        e.preventDefault();
        inputRef.current?.focus();
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, []);

  const hasValue = value.length > 0;

  return (
    <div
      className={`relative mx-auto transition-smooth ${
        focused ? "max-w-2xl" : "max-w-xl"
      }`}
    >
      {/* Glow de fondo cuando está activo */}
      {focused && (
        <div className="absolute -inset-1 rounded-full bg-gradient-hero opacity-20 blur-lg pointer-events-none" />
      )}

      <div
        className={`relative flex items-center gap-3 rounded-full border-2 px-5 py-3 bg-card/80 backdrop-blur-sm transition-smooth ${
          focused
            ? "border-primary shadow-glow"
            : "border-border/60 shadow-card hover:border-primary/40"
        }`}
      >
        {/* Icono de búsqueda */}
        <Search
          className={`w-5 h-5 shrink-0 transition-smooth ${
            focused ? "text-primary" : "text-muted-foreground"
          }`}
        />

        <input
          ref={inputRef}
          type="text"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
          placeholder="Buscar producto... (presiona / para buscar)"
          className="flex-1 bg-transparent outline-none text-foreground placeholder:text-muted-foreground/60 font-medium text-sm sm:text-base"
        />

        {/* Botón limpiar */}
        {hasValue && (
          <button
            onMouseDown={(e) => {
              e.preventDefault(); // evita que se dispare onBlur del input
              onChange("");
              inputRef.current?.focus();
            }}
            className="shrink-0 w-6 h-6 rounded-full bg-muted hover:bg-primary hover:text-primary-foreground transition-smooth flex items-center justify-center"
            aria-label="Limpiar búsqueda"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        )}

        {/* Badge de resultados */}
        {hasValue && resultsCount !== undefined && (
          <span className="shrink-0 text-xs font-display font-bold bg-gradient-hero text-primary-foreground rounded-full px-2.5 py-0.5 whitespace-nowrap">
            {resultsCount} {resultsCount === 1 ? "resultado" : "resultados"}
          </span>
        )}
      </div>
    </div>
  );
};
