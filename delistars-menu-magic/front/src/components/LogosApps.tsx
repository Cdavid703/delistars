import { useId, type ReactNode } from "react";
import { siWhatsapp, siInstagram, siFacebook, siTiktok } from "simple-icons";

// Logos a color de las apps que el menú enlaza (25 oct 2026). Formas oficiales
// de Simple Icons (CC0) con sus colores de marca; Instagram con su degradado.
// `blanco`: sobre un botón de color, el logo va en blanco.

type Props = { size?: number; blanco?: boolean; className?: string };

function Caja({ size, className, children }: { size: number; className?: string; children: ReactNode }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden="true" className={`shrink-0 ${className ?? ""}`}>
      {children}
    </svg>
  );
}

export const LogoWhatsApp = ({ size = 18, blanco = false, className }: Props) => (
  <Caja size={size} className={className}><path d={siWhatsapp.path} fill={blanco ? "#FFFFFF" : `#${siWhatsapp.hex}`} /></Caja>
);

export const LogoFacebook = ({ size = 18, blanco = false, className }: Props) => (
  <Caja size={size} className={className}><path d={siFacebook.path} fill={blanco ? "#FFFFFF" : `#${siFacebook.hex}`} /></Caja>
);

export const LogoInstagram = ({ size = 18, blanco = false, className }: Props) => {
  const id = useId().replace(/:/g, "");
  if (blanco) return <Caja size={size} className={className}><path d={siInstagram.path} fill="#FFFFFF" /></Caja>;
  return (
    <Caja size={size} className={className}>
      <defs>
        <linearGradient id={`ig${id}`} x1="0" y1="1" x2="1" y2="0">
          <stop offset="0" stopColor="#FEDA75" /><stop offset="0.3" stopColor="#FA7E1E" />
          <stop offset="0.6" stopColor="#D62976" /><stop offset="0.85" stopColor="#962FBF" />
          <stop offset="1" stopColor="#4F5BD5" />
        </linearGradient>
      </defs>
      <path d={siInstagram.path} fill={`url(#ig${id})`} />
    </Caja>
  );
};

/** TikTok con sus sombras cian y roja; `blanco` = la nota en blanco (fondo oscuro). */
export const LogoTikTok = ({ size = 18, blanco = false, className }: Props) => (
  <Caja size={size} className={className}>
    <path d={siTiktok.path} fill="#25F4EE" transform="translate(-0.7 -0.7)" />
    <path d={siTiktok.path} fill="#FE2C55" transform="translate(0.7 0.7)" />
    <path d={siTiktok.path} fill={blanco ? "#FFFFFF" : "#000000"} />
  </Caja>
);
