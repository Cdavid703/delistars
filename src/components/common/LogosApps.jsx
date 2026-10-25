import { useId } from 'react'
import { siWhatsapp, siGooglemaps, siWaze, siInstagram, siFacebook, siTiktok } from 'simple-icons'

// Logos a color de las apps que la web nombra o abre (25 oct 2026). Las formas
// de WhatsApp, Google Maps, Waze, Instagram, Facebook y TikTok son las oficiales
// de Simple Icons (CC0), con sus colores de marca; Google Maps e Instagram con
// sus colores reales encima de la forma oficial. Nequi, Bancolombia y Daviplata
// no están en Simple Icons: van como marca simplificada con sus colores.
// `blanco`: sobre un botón de color (verde, rojo), el logo va en blanco.

function Caja({ size, children, label }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" className="flex-shrink-0"
      {...(label ? { role: 'img', 'aria-label': label } : { 'aria-hidden': 'true' })}>
      {children}
    </svg>
  )
}

export function LogoWhatsApp({ size = 18, blanco = false, label }) {
  return <Caja size={size} label={label}><path d={siWhatsapp.path} fill={blanco ? '#FFFFFF' : `#${siWhatsapp.hex}`} /></Caja>
}

export function LogoGoogleMaps({ size = 18, blanco = false, label }) {
  const id = useId().replace(/:/g, '')
  if (blanco) return <Caja size={size} label={label}><path d={siGooglemaps.path} fill="#FFFFFF" /></Caja>
  return (
    <Caja size={size} label={label}>
      <defs><clipPath id={`gm${id}`}><path d={siGooglemaps.path} /></clipPath></defs>
      <g clipPath={`url(#gm${id})`}>
        <rect x="0" y="0" width="12" height="10" fill="#1A73E8" />
        <rect x="12" y="0" width="12" height="10" fill="#EA4335" />
        <rect x="0" y="10" width="12" height="14" fill="#34A853" />
        <rect x="12" y="10" width="12" height="14" fill="#FBBC04" />
      </g>
    </Caja>
  )
}

export function LogoWaze({ size = 18, blanco = false, label }) {
  return <Caja size={size} label={label}><path d={siWaze.path} fill={blanco ? '#FFFFFF' : `#${siWaze.hex}`} /></Caja>
}

export function LogoInstagram({ size = 18, blanco = false, label }) {
  const id = useId().replace(/:/g, '')
  if (blanco) return <Caja size={size} label={label}><path d={siInstagram.path} fill="#FFFFFF" /></Caja>
  return (
    <Caja size={size} label={label}>
      <defs>
        <linearGradient id={`ig${id}`} x1="0" y1="1" x2="1" y2="0">
          <stop offset="0" stopColor="#FEDA75" /><stop offset="0.3" stopColor="#FA7E1E" />
          <stop offset="0.6" stopColor="#D62976" /><stop offset="0.85" stopColor="#962FBF" />
          <stop offset="1" stopColor="#4F5BD5" />
        </linearGradient>
      </defs>
      <path d={siInstagram.path} fill={`url(#ig${id})`} />
    </Caja>
  )
}

export function LogoFacebook({ size = 18, blanco = false, label }) {
  return <Caja size={size} label={label}><path d={siFacebook.path} fill={blanco ? '#FFFFFF' : `#${siFacebook.hex}`} /></Caja>
}

/** TikTok con sus sombras cian y roja. `oscuro`: sobre fondo oscuro la nota va en blanco. */
export function LogoTikTok({ size = 18, oscuro = false, label }) {
  return (
    <Caja size={size} label={label}>
      <path d={siTiktok.path} fill="#25F4EE" transform="translate(-0.7 -0.7)" />
      <path d={siTiktok.path} fill="#FE2C55" transform="translate(0.7 0.7)" />
      <path d={siTiktok.path} fill={oscuro ? '#FFFFFF' : '#000000'} />
    </Caja>
  )
}

// Medios de pago (marca simplificada: no hay vectores abiertos oficiales).
export function LogoNequi({ size = 18, label }) {
  return (
    <Caja size={size} label={label}>
      <rect x="1" y="1" width="22" height="22" rx="6" fill="#210049" />
      <path d="M7.5 17V7h2.2l4.6 6.4V7h2.2v10h-2.2L9.7 10.6V17z" fill="#FFFFFF" />
      <circle cx="18.2" cy="5.8" r="1.7" fill="#DA0081" />
    </Caja>
  )
}

export function LogoBancolombia({ size = 18, label }) {
  return (
    <Caja size={size} label={label}>
      <rect x="1" y="1" width="22" height="22" rx="6" fill="#2C2A29" />
      <path d="M5.5 16.5L9.3 7.5h2.3l-3.8 9z" fill="#FDDA24" />
      <path d="M9.6 16.5l3.8-9h2.3l-3.8 9z" fill="#FDDA24" />
      <path d="M13.7 16.5l3.8-9h2.3l-3.8 9z" fill="#FDDA24" />
    </Caja>
  )
}

export function LogoDaviplata({ size = 18, label }) {
  return (
    <Caja size={size} label={label}>
      <rect x="1" y="1" width="22" height="22" rx="6" fill="#E30613" />
      <path d="M8 7h3.6c3.1 0 5 1.9 5 5s-1.9 5-5 5H8zm2.2 2v6h1.3c1.8 0 2.9-1.1 2.9-3s-1.1-3-2.9-3z" fill="#FFFFFF" />
    </Caja>
  )
}

/** El logo del medio de pago o del banco, si es una app (Efectivo y Transferencia no tienen). */
export function LogoPago({ medio, size = 16 }) {
  const m = String(medio || '').toLowerCase()
  if (m.includes('nequi')) return <LogoNequi size={size} />
  if (m.includes('bancolombia')) return <LogoBancolombia size={size} />
  if (m.includes('daviplata')) return <LogoDaviplata size={size} />
  return null
}
