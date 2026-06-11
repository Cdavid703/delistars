import { Instagram, Facebook, MessageCircle, Music2, Phone } from "lucide-react";
import logo from "@/assets/logo.svg";

const SOCIALS = [
  { Icon: MessageCircle, label: "WhatsApp", href: "https://wa.me/573135065720", handle: "+57 313 506 5720", sub: "Santa Lucía" },
  { Icon: MessageCircle, label: "WhatsApp", href: "https://wa.me/573150634084", handle: "+57 315 063 4084", sub: "Santa Teresita" },
  { Icon: Instagram, label: "Instagram", href: "https://www.instagram.com/delistars.med", handle: "@delistars.med" },
  { Icon: Facebook, label: "Facebook", href: "https://www.facebook.com/delistars.med/", handle: "/delistars.med" },
  { Icon: Music2, label: "TikTok", href: "https://www.tiktok.com/@delistars.med", handle: "@delistars.med" },
];

export const Footer = () => {
  return (
    <footer className="bg-coal text-cream pt-16 pb-6">
      {/* Sección redes sociales destacada */}
      <div className="container mb-12">
        <div className="text-center mb-8">
          <p className="font-script text-cherry text-2xl md:text-3xl mb-1">síguenos</p>
          <h3 className="font-display text-4xl md:text-5xl tracking-wider">
            ÚNETE A LA <span className="text-cherry">FAMILIA</span> DELISTARS
          </h3>
          <p className="text-sm md:text-base text-cream/70 mt-3 max-w-xl mx-auto">
            Promos, novedades y antojos diarios en tus redes favoritas.
          </p>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-4">
          {SOCIALS.map(({ Icon, label, href, handle, sub }, i) => (
            <a
              key={`${label}-${i}`}
              href={href}
              target="_blank"
              rel="noopener noreferrer"
              aria-label={label}
              className="group flex flex-col items-center gap-2 p-4 rounded-2xl bg-cream/5 border border-cream/10 hover:bg-cherry hover:border-cherry hover:-translate-y-1 transition-smooth"
            >
              <span className="w-12 h-12 rounded-full bg-cream/10 group-hover:bg-cream/20 flex items-center justify-center transition-smooth">
                <Icon className="w-6 h-6 text-cream group-hover:scale-110 transition-bounce" />
              </span>
              <span className="font-display text-sm tracking-wider">{label}</span>
              <span className="text-xs text-cream/60 group-hover:text-cream/90 truncate max-w-full">
                {handle}
              </span>
              {sub && <span className="text-[10px] text-cream/40">{sub}</span>}
            </a>
          ))}
        </div>
      </div>

      <div className="container grid md:grid-cols-3 gap-10 border-t border-cream/10 pt-10">
        <div className="space-y-3">
          <img src={logo} alt="DeliStars" width={80} height={80} className="bg-cream rounded-2xl p-1" />
          <p className="font-display text-lg tracking-widest text-cherry">·Tasty & Cool·</p>
          <p className="text-sm text-cream/70 max-w-xs">
            Sabor que brilla en cada bocado. Perros, hamburguesas y mucho más para alegrar tu día.
          </p>
        </div>

        <div>
          <h4 className="font-display text-lg mb-3 tracking-wider">Menú</h4>
          <ul className="space-y-2 text-sm text-cream/70">
            <li><a href="#perros" className="hover:text-cherry transition-smooth">Perros calientes</a></li>
            <li><a href="#hamburguesas" className="hover:text-cherry transition-smooth">Hamburguesas</a></li>
            <li><a href="#acompanantes" className="hover:text-cherry transition-smooth">Acompañantes</a></li>
            <li><a href="#bebidas" className="hover:text-cherry transition-smooth">Bebidas</a></li>
          </ul>
        </div>

        <div>
          <h4 className="font-display text-lg mb-3 tracking-wider">Contacto</h4>
          <ul className="space-y-2 text-sm text-cream/70">
            <li className="flex items-center gap-2"><Phone className="w-4 h-4 text-cherry" /> +57 313 506 5720 <span className="text-cream/40 text-xs">(Santa Lucía)</span></li>
            <li className="flex items-center gap-2"><Phone className="w-4 h-4 text-cherry" /> +57 315 063 4084 <span className="text-cream/40 text-xs">(Santa Teresita)</span></li>
          </ul>
        </div>
      </div>

      <div className="container mt-10 pt-6 border-t border-cream/10 text-center text-xs text-cream/50">
        © {new Date().getFullYear()} DeliStars. Hecho con 🌭 y ❤️
      </div>
    </footer>
  );
};
