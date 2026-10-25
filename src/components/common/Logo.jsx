import logoMain  from '../../assets/logos/logo_main.png'
import logoDark  from '../../assets/logos/logo_dark.png'
import logoSello from '../../assets/logos/logo_sello.png'

// Marca DeliStars. Los PNG van recortados al dibujo (antes traían casi la mitad
// de margen vacío y a cualquier alto el logo se veía de la mitad). La versión
// «dark» es la marca en crema con fondo transparente, para fondos rojos u oscuros.
export default function Logo({ variant = 'light', size = 'md', className = '' }) {
  const src = variant === 'dark' ? logoDark : variant === 'sello' ? logoSello : logoMain

  const sizes = {
    xs: 'h-6',
    sm: 'h-8',
    md: 'h-11',
    lg: 'h-16',
    xl: 'h-24',
  }

  // multiply: si queda algún gris claro alrededor, desaparece sobre fondos claros.
  const blend = variant === 'light' ? 'multiply' : 'normal'

  return (
    <img
      src={src}
      alt="DeliStars · Tasty & Cool"
      className={`${sizes[size] || sizes.md} w-auto object-contain ${className}`}
      style={{ mixBlendMode: blend }}
    />
  )
}
