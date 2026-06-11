import { useState, useEffect } from "react";
import { ShoppingCart, MapPin, Menu, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import logo from "@/assets/logo.svg";
import { useCart } from "@/context/CartContext";
import { useQuery } from "@tanstack/react-query";
import { apiService } from "@/services/api";

export const Navbar = () => {
  const { count, setOpen, sede, setSede } = useCart();
  const [scrolled, setScrolled] = useState(false);
  const [mobile, setMobile] = useState(false);
  const [popped, setPopped] = useState(false);

  // Obtener sedes directo del backend para mostrar el nombre correcto
  const { data: sedes = [] } = useQuery({
    queryKey: ['sedes'],
    queryFn: () => apiService.getSedes(),
  });

  // Obtener categorías desde el backend para los links dinámicos
  const { data: categories = [] } = useQuery({
    queryKey: ['categories'],
    queryFn: () => apiService.getCategories(),
  });

  // Filtrar adiciones (id_categoria === 5) o por nombre y generar los enlaces
  const navLinks = categories
    .filter((cat) => cat.id_categoria !== 5 && !cat.nombre_categoria.toLowerCase().includes('adicion'))
    .map((cat) => ({
      href: `#${cat.nombre_categoria.toLowerCase().replace(/\s+/g, "-")}`,
      label: cat.nombre_categoria,
    }));
  
  // Agregar enlace estático para "Encuéntranos" al final
  const links = [...navLinks, { href: "#encuentranos", label: "Encuéntranos" }];

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 20);
    window.addEventListener("scroll", onScroll);
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  useEffect(() => {
    if (count > 0) {
      setPopped(true);
      const t = setTimeout(() => setPopped(false), 300);
      return () => clearTimeout(t);
    }
  }, [count]);

  const sedeName = sedes.find((s) => s.id_sede === sede)?.nombre_sede ?? "Elige sede";

  return (
    <header
      className={`fixed top-0 left-0 right-0 z-40 transition-smooth ${
        scrolled ? "bg-background/90 backdrop-blur-md shadow-card" : "bg-transparent"
      }`}
    >
      <div className="container flex items-center justify-between gap-2 py-3 px-4 sm:px-6">
        <a href="#top" className="flex items-center gap-2 hover-scale shrink-0">
          <img src={logo} alt="DeliStars logo" width={56} height={56} className="w-11 h-11 sm:w-14 sm:h-14 object-contain" />
          <span className="hidden sm:flex flex-col leading-none">
            <span className="font-display text-base tracking-widest text-foreground">DELISTARS</span>
            <span className="font-display text-[10px] tracking-widest text-primary">·Tasty & Cool·</span>
          </span>
        </a>

        <nav className="hidden lg:flex items-center gap-8">
          {links.map((l) => (
            <a
              key={l.href}
              href={l.href}
              className="font-display font-medium text-foreground/80 hover:text-primary transition-smooth relative after:content-[''] after:absolute after:left-0 after:-bottom-1 after:h-0.5 after:w-0 after:bg-primary hover:after:w-full after:transition-all"
            >
              {l.label}
            </a>
          ))}
        </nav>

        <div className="flex items-center gap-1.5 sm:gap-2 shrink-0">
          <button
            onClick={() => setSede(null)}
            className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground hover:text-primary transition-smooth px-2 sm:px-3 py-1.5 sm:py-2 rounded-full bg-secondary/60 max-w-[120px] sm:max-w-none"
          >
            <MapPin className="w-3.5 h-3.5 shrink-0" /> <span className="truncate">{sedeName}</span>
          </button>

          <Button
            onClick={() => setOpen(true)}
            variant="default"
            size="sm"
            className={`relative bg-gradient-hero text-primary-foreground border-0 shadow-soft hover:shadow-glow transition-smooth px-3 sm:px-4 ${popped ? "animate-pop" : ""}`}
          >
            <ShoppingCart className="w-4 h-4" />
            <span className="hidden sm:inline ml-2">Carrito</span>
            {count > 0 && (
              <span className="absolute -top-1.5 -right-1.5 bg-cream text-primary text-xs font-bold rounded-full w-5 h-5 sm:w-6 sm:h-6 flex items-center justify-center shadow-card border-2 border-primary">
                {count}
              </span>
            )}
          </Button>

          <button onClick={() => setMobile(!mobile)} className="lg:hidden p-1.5 text-foreground" aria-label="Menú">
            {mobile ? <X /> : <Menu />}
          </button>
        </div>
      </div>

      {mobile && (
        <nav className="lg:hidden bg-background border-t border-border animate-fade-in shadow-soft">
          <div className="container py-4 flex flex-col gap-3">
            {links.map((l) => (
              <a
                key={l.href}
                href={l.href}
                onClick={() => setMobile(false)}
                className="font-display py-2 text-foreground hover:text-primary transition-smooth"
              >
                {l.label}
              </a>
            ))}
            <button
              onClick={() => { setSede(""); setMobile(false); }}
              className="flex items-center gap-2 mt-2 pt-4 border-t border-border text-sm font-medium text-muted-foreground hover:text-primary transition-smooth w-full text-left"
            >
              <MapPin className="w-4 h-4 text-primary" /> Cambiar de sede (Actual: {sedeName})
            </button>
          </div>
        </nav>
      )}
    </header>
  );
};
