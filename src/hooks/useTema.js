import { useEffect, useState } from 'react'

// Modo oscuro del cliente (rediseño del 25 oct 2026). Se guarda en este aparato
// y pone <html class="oscuro"> (ver src/oscuro.css) solo mientras la pantalla
// del cliente está abierta: la caja y el domiciliario no lo tienen.
// Por ahora empieza en claro; quien quiera lo activa en «Más».
const LLAVE = 'ds_tema'
const leer = () => { try { return localStorage.getItem(LLAVE) === 'oscuro' ? 'oscuro' : 'claro' } catch { return 'claro' } }

export default function useTema(activo = true) {
  const [tema, setTema] = useState(leer)
  useEffect(() => {
    if (!activo) return undefined
    const raiz = document.documentElement
    raiz.classList.toggle('oscuro', tema === 'oscuro')
    // La barra del navegador del celular, del mismo color.
    const meta = document.querySelector('meta[name="theme-color"]')
    const antes = meta?.getAttribute('content')
    if (meta) meta.setAttribute('content', tema === 'oscuro' ? '#15110D' : (antes || '#EA3329'))
    return () => { raiz.classList.remove('oscuro'); if (meta && antes) meta.setAttribute('content', antes) }
  }, [activo, tema])
  const cambiar = (t) => { try { localStorage.setItem(LLAVE, t) } catch { /* sin almacenamiento */ } setTema(t) }
  return [tema, cambiar]
}
