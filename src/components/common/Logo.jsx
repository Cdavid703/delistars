import logoMain  from '../../assets/logos/logo_main.png'
import logoDark  from '../../assets/logos/logo_dark.png'
import logoSello from '../../assets/logos/logo_sello.png'

export default function Logo({ variant = 'light', size = 'md', className = '' }) {
  const src = variant === 'dark' ? logoDark : variant === 'sello' ? logoSello : logoMain

  const sizes = {
    xs: 'h-8',
    sm: 'h-10',
    md: 'h-14',
    lg: 'h-20',
    xl: 'h-28',
  }

  // multiply: fondo blanco/gris desaparece sobre fondos claros
  // screen:   fondo negro desaparece sobre fondos oscuros
  const blend = variant === 'dark' ? 'screen' : 'multiply'

  return (
    <img
      src={src}
      alt="DeliStars · Tasty & Cool"
      className={`${sizes[size] || sizes.md} w-auto object-contain ${className}`}
      style={{ mixBlendMode: blend }}
    />
  )
}
