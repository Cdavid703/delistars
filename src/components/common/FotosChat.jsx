import { useRef, useState } from 'react'
import { Camera, Loader2 } from 'lucide-react'
import { subirFoto } from '../../services/fotos'

// Fotos en los chats y reclamos (§8.3, §14): el botón de la cámara y la foto
// dentro del mensaje. En el celular, el botón deja tomar la foto o elegirla de
// la galería.

/**
 * Botón para adjuntar una foto. Sube la foto del pedido y llama
 * `onSubida({ url, path })` (que normalmente envía el mensaje).
 */
export function BotonFoto({ orderId, onSubida, disabled = false, className = '', etiqueta = 'Enviar una foto' }) {
  const input = useRef(null)
  const [progreso, setProgreso] = useState(null)
  const [error, setError] = useState('')
  const elegir = async (e) => {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    setError(''); setProgreso(0)
    try {
      const foto = await subirFoto(orderId, file, setProgreso)
      await onSubida(foto)
    } catch (err) {
      setError(err?.message || 'No se pudo subir la foto. Intenta de nuevo.')
    } finally { setProgreso(null) }
  }
  const subiendo = progreso !== null
  return (
    <span className="inline-flex flex-col items-start">
      <input ref={input} type="file" accept="image/*" className="hidden" onChange={elegir} />
      <button type="button" onClick={() => input.current?.click()} disabled={disabled || subiendo}
        className={`btn-secondary px-3 self-end ${className}`} aria-label={etiqueta} title={etiqueta}>
        {subiendo
          ? <><Loader2 size={16} className="animate-spin" aria-hidden="true" /><span className="font-body text-[11px]">{progreso}%</span></>
          : <Camera size={16} aria-hidden="true" />}
      </button>
      {error && <span className="font-body text-[11px] text-pepper mt-1 max-w-[12rem]">{error}</span>}
    </span>
  )
}

/** La foto (o fotos) de un mensaje. Al tocarla se abre en grande. */
export function FotosMensaje({ foto, fotos }) {
  const lista = [...(foto ? [foto] : []), ...(Array.isArray(fotos) ? fotos : [])].filter((f) => f?.url)
  if (!lista.length) return null
  return (
    <div className="flex flex-wrap gap-1.5 mt-1">
      {lista.map((f) => (
        <a key={f.path || f.url} href={f.url} target="_blank" rel="noreferrer" className="block">
          <img src={f.url} alt="Foto enviada" loading="lazy"
            className="max-h-44 max-w-[12rem] rounded-lg border border-coal/10 object-cover bg-smoked/40" />
        </a>
      ))}
    </div>
  )
}
