import { useEffect, useState } from 'react'

// Modo oscuro del cliente (rediseño del 25 oct 2026). Pone <html class="oscuro">
// (ver src/oscuro.css) solo mientras la pantalla del cliente está abierta.
// Desde el 26 oct 2026 (decisión de David) sigue el modo del celular, igual que
// el domiciliario y la app; si el cliente lo cambia en «Más», se guarda su
// elección en este aparato y esa manda.
const LLAVE = 'ds_tema'
const guardado = () => {
  try { const t = localStorage.getItem(LLAVE); return t === 'oscuro' || t === 'claro' ? t : null } catch { return null }
}
const consulta = () => (typeof window !== 'undefined' && window.matchMedia ? window.matchMedia('(prefers-color-scheme: dark)') : null)

export default function useTema(activo = true) {
  const [elegido, setElegido] = useState(guardado)
  const [celularOscuro, setCelularOscuro] = useState(() => !!consulta()?.matches)
  useEffect(() => {
    const m = consulta()
    if (!m) return undefined
    const cambio = (e) => setCelularOscuro(e.matches)
    m.addEventListener?.('change', cambio)
    return () => m.removeEventListener?.('change', cambio)
  }, [])
  const tema = elegido ?? (celularOscuro ? 'oscuro' : 'claro')

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
  const cambiar = (t) => { try { localStorage.setItem(LLAVE, t) } catch { /* sin almacenamiento */ } setElegido(t) }
  return [tema, cambiar]
}
