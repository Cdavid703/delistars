import { useState, useEffect } from "react";
import { ShoppingCart, MapPin, Menu, X, CalendarClock, LogIn, LogOut, Briefcase, Building2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import logo from "@/assets/logo.svg";
import { useCart } from "@/context/CartContext";
import { useQuery } from "@tanstack/react-query";
import { apiService } from "@/services/api";
import { useStaffAuth } from "@/hooks/useStaffAuth";
import { isStaff } from "@/lib/staff";
import { useAllRoles } from "@/hooks/useAllRoles";
import { RoleSwitcher } from "@/components/RoleSwitcher";

export const Navbar = () => {
  const { count, setOpen, sede, setSede } = useCart();
  const { user, login, loginGuest, logout, isGuest } = useStaffAuth();
  const staff = isStaff(user?.email);
  const allRoles = useAllRoles(user);
  const [scrolled, setScrolled] = useState(false);
  const [mobile, setMobile] = useState(false);
  const [popped, setPopped] = useState(false);
  const [loginOpen, setLoginOpen] = useState(false);

  const doLogin = async () => {
    try { await login(); setLoginOpen(false); setMobile(false); }
    catch { /* popup cerrado: sin acción */ }
  };
  const doGuest = async () => {
    try { await loginGuest(); setLoginOpen(false); setMobile(false); }
    catch { /* sin acción */ }
  };

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

  // Filtrar adiciones (id_categoria === 5), salsas (8) o por nombre
  const navLinks = categories
    .filter((cat) => cat.id_categoria !== 5 && cat.id_categoria !== 8 && !cat.nombre_categoria.toLowerCase().includes('adicion'))
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
          {/* Entre 1280 y 1535 px el nombre se oculta para que quepan los enlaces */}
          <span className="hidden sm:flex xl:hidden 2xl:flex flex-col leading-none">
            <span className="font-display text-base tracking-widest text-foreground">DELISTARS</span>
            <span className="font-display text-[10px] tracking-widest text-primary">·Tasty & Cool·</span>
          </span>
        </a>

        {/* Son 10 enlaces: con lg (1024 px) no cabían y en portátiles de 1366 px
            "Trabaja con nosotros" se partía en tres renglones. Por debajo de xl
            se usa el menú de hamburguesa. */}
        <nav className="hidden xl:flex items-center gap-5 2xl:gap-8 whitespace-nowrap text-sm 2xl:text-base">
          {links.map((l) => (
            <a
              key={l.href}
              href={l.href}
              className="font-display font-medium text-foreground/80 hover:text-primary transition-smooth relative after:content-[''] after:absolute after:left-0 after:-bottom-1 after:h-0.5 after:w-0 after:bg-primary hover:after:w-full after:transition-all"
            >
              {l.label}
            </a>
          ))}
          {/* Empresas — público */}
          <a href="/empresas" className="font-display font-medium text-foreground/80 hover:text-primary transition-smooth flex items-center gap-1.5">
            <Building2 className="w-4 h-4" /> Empresas
          </a>
          {/* Vacantes — público */}
          <a href="/vacantes/" className="font-display font-medium text-foreground/80 hover:text-primary transition-smooth flex items-center gap-1.5">
            <Briefcase className="w-4 h-4" />
            <span className="2xl:hidden">Trabaja aquí</span>
            <span className="hidden 2xl:inline">Trabaja con nosotros</span>
          </a>
          {/* Mis turnos — solo equipo autenticado */}
          {staff && (
            <a href="/turnos/" className="font-display font-medium text-primary hover:opacity-80 transition-smooth flex items-center gap-1.5">
              <CalendarClock className="w-4 h-4" /> Mis turnos
            </a>
          )}
        </nav>

        <div className="flex items-center gap-1.5 sm:gap-2 shrink-0">
          {/* Cambiar entre los paneles del usuario (admin/cajero/domiciliario/cliente) */}
          <RoleSwitcher user={user} />

          <button
            onClick={() => setSede(null)}
            /* min-h-[44px]: es el botón que cambia toda la experiencia y medía
               28 px de alto, por debajo del mínimo tocable recomendado. */
            className="flex items-center justify-center gap-1.5 min-h-[44px] text-xs font-medium text-muted-foreground hover:text-primary transition-smooth px-3 rounded-full bg-secondary/60 max-w-[120px] sm:max-w-none"
          >
            <MapPin className="w-3.5 h-3.5 shrink-0" /> <span className="truncate">{sedeName}</span>
          </button>

          <Button
            onClick={() => setOpen(true)}
            variant="default"
            size="sm"
            className={`relative min-h-[44px] bg-gradient-hero text-primary-foreground border-0 shadow-soft hover:shadow-glow transition-smooth px-3 sm:px-4 ${popped ? "animate-pop" : ""}`}
          >
            <ShoppingCart className="w-4 h-4" />
            <span className="hidden sm:inline ml-2">Carrito</span>
            {count > 0 && (
              <span className="absolute -top-1.5 -right-1.5 bg-cream text-primary text-xs font-bold rounded-full w-5 h-5 sm:w-6 sm:h-6 flex items-center justify-center shadow-card border-2 border-primary">
                {count}
              </span>
            )}
          </Button>

          {/* Login del cliente / equipo — la sesión vale también en /domicilios/ */}
          {user ? (
            <button
              onClick={logout}
              title={`Cerrar sesión${user.email ? ` (${user.email})` : ' (invitado)'}`}
              className="hidden sm:flex items-center gap-1.5 px-3 py-2 rounded-full text-sm font-medium text-muted-foreground hover:text-primary hover:bg-secondary/60 transition-smooth"
            >
              <LogOut className="w-4 h-4" />
              <span className="hidden md:inline">{isGuest ? 'Invitado' : 'Salir'}</span>
            </button>
          ) : (
            <div className="hidden sm:block relative">
              <Button
                onClick={() => setLoginOpen((v) => !v)}
                variant="outline"
                size="sm"
                className="gap-1.5"
              >
                <LogIn className="w-4 h-4" /> Iniciar sesión
              </Button>
              {loginOpen && (
                <>
                  <div className="fixed inset-0 z-40" onClick={() => setLoginOpen(false)} />
                  <div className="absolute right-0 mt-2 w-64 z-50 bg-background border border-border rounded-xl shadow-card p-2 flex flex-col gap-1 animate-fade-in">
                    <div className="px-2 pt-1.5 pb-2 mb-1 border-b border-border">
                      <p className="text-xs font-semibold text-foreground flex items-center gap-1">🎁 Programa de fidelización</p>
                      <p className="text-[11px] text-muted-foreground leading-snug mt-0.5">
                        Inicia con <strong>Google</strong> y cada 10 domicilios entregados ganas una <strong>Hamburguesa Especial + un Perro Grande con tocineta gratis</strong>. Como invitado no acumulas.
                      </p>
                    </div>
                    <button onClick={doLogin} className="flex items-center gap-2 px-2 py-2 rounded-lg text-sm font-medium hover:bg-secondary/60 transition-smooth text-left">
                      <LogIn className="w-4 h-4 text-primary" /> Entrar con Google
                    </button>
                    <button onClick={doGuest} className="flex items-center gap-2 px-2 py-2 rounded-lg text-sm font-medium hover:bg-secondary/60 transition-smooth text-left">
                      <ShoppingCart className="w-4 h-4 text-primary" /> Continuar sin cuenta
                    </button>
                  </div>
                </>
              )}
            </div>
          )}

          <button onClick={() => setMobile(!mobile)} className="xl:hidden flex items-center justify-center w-11 h-11 text-foreground" aria-label="Menú">
            {mobile ? <X /> : <Menu />}
          </button>
        </div>
      </div>

      {mobile && (
        <nav className="xl:hidden bg-background border-t border-border animate-fade-in shadow-soft">
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

            {/* Empresas — público */}
            <a href="/empresas" onClick={() => setMobile(false)} className="font-display py-2 text-foreground hover:text-primary transition-smooth flex items-center gap-2">
              <Building2 className="w-4 h-4" /> Empresas
            </a>
            {/* Vacantes — público */}
            <a href="/vacantes/" onClick={() => setMobile(false)} className="font-display py-2 text-foreground hover:text-primary transition-smooth flex items-center gap-2">
              <Briefcase className="w-4 h-4" /> Trabaja con nosotros
            </a>
            {/* Cambiar entre los paneles del usuario (admin/cajero/domiciliario/cliente) */}
            {allRoles.length > 1 && (
              <div className="py-1">
                <RoleSwitcher user={user} />
              </div>
            )}
            {/* Mis turnos — solo equipo */}
            {staff && (
              <a href="/turnos/" onClick={() => setMobile(false)} className="font-display py-2 text-primary hover:opacity-80 transition-smooth flex items-center gap-2">
                <CalendarClock className="w-4 h-4" /> Mis turnos
              </a>
            )}

            {/* Login del cliente / equipo */}
            {user ? (
              <button
                onClick={() => { logout(); setMobile(false); }}
                className="flex items-center gap-2 text-sm font-medium text-muted-foreground hover:text-primary transition-smooth w-full text-left py-2"
              >
                <LogOut className="w-4 h-4" /> {isGuest ? 'Salir (invitado)' : 'Cerrar sesión'}
              </button>
            ) : (
              <div className="flex flex-col gap-1 py-1">
                <div className="bg-secondary/40 rounded-lg px-2.5 py-2 mb-1">
                  <p className="text-xs font-semibold text-foreground">🎁 Programa de fidelización</p>
                  <p className="text-[11px] text-muted-foreground leading-snug mt-0.5">
                    Inicia con <strong>Google</strong>: cada 10 domicilios entregados ganas una <strong>Hamburguesa Especial + un Perro Grande con tocineta gratis</strong>. Como invitado no acumulas.
                  </p>
                </div>
                <button onClick={doLogin} className="flex items-center gap-2 text-sm font-medium text-foreground hover:text-primary transition-smooth w-full text-left py-1.5">
                  <LogIn className="w-4 h-4 text-primary" /> Entrar con Google
                </button>
                <button onClick={doGuest} className="flex items-center gap-2 text-sm font-medium text-foreground hover:text-primary transition-smooth w-full text-left py-1.5">
                  <ShoppingCart className="w-4 h-4 text-primary" /> Continuar sin cuenta
                </button>
              </div>
            )}

            <button
              onClick={() => { setSede(null); setMobile(false); }}
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
