import { useRef, useState } from 'react'
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage'
import { ImagePlus, Loader2, X } from 'lucide-react'
import { toast } from 'sonner'
import { storage } from '@/services/firebase'

// Subir una imagen de Mercadeo a Firebase Storage (carpeta mercadeo/) y
// devolver su enlace público. Se puede elegir el archivo, pegarla (Cmd/Ctrl+V)
// o arrastrarla. Se achica en el navegador (máx. 1200 px de ancho, JPEG) para
// que los correos pesen poco y carguen rápido en el celular.
const MAX_ANCHO = 1200
const MAX_MB = 15

async function reducir(file: File): Promise<Blob> {
  // GIF animados se suben tal cual (al redibujarlos se perdería la animación).
  if (file.type === 'image/gif') return file
  const bmp = await createImageBitmap(file)
  const escala = Math.min(1, MAX_ANCHO / bmp.width)
  const canvas = document.createElement('canvas')
  canvas.width = Math.round(bmp.width * escala)
  canvas.height = Math.round(bmp.height * escala)
  const ctx = canvas.getContext('2d')!
  ctx.fillStyle = '#ffffff' // PNG con transparencia → fondo blanco en el correo
  ctx.fillRect(0, 0, canvas.width, canvas.height)
  ctx.drawImage(bmp, 0, 0, canvas.width, canvas.height)
  return new Promise((ok, mal) => canvas.toBlob((b) => (b ? ok(b) : mal(new Error('No se pudo procesar la imagen'))), 'image/jpeg', 0.85))
}

export default function SubirImagen({ valor, onCambio, carpeta = 'campanas', texto = 'Subir imagen' }: {
  valor?: string
  onCambio: (url: string) => void
  carpeta?: string
  texto?: string
}) {
  const input = useRef<HTMLInputElement>(null)
  const [subiendo, setSubiendo] = useState(false)
  const [encima, setEncima] = useState(false)

  const subir = async (file?: File | null) => {
    if (!file) return
    if (!file.type.startsWith('image/')) { toast.error('Eso no es una imagen (usa JPG, PNG o GIF)'); return }
    if (file.size > MAX_MB * 1024 * 1024) { toast.error(`La imagen pesa más de ${MAX_MB} MB`); return }
    setSubiendo(true)
    try {
      const blob = await reducir(file)
      const ext = blob.type === 'image/gif' ? 'gif' : 'jpg'
      const nombre = `${Date.now()}_${file.name.replace(/\.[^.]+$/, '').replace(/[^\w-]+/g, '_').slice(0, 40) || 'imagen'}.${ext}`
      const r = ref(storage, `mercadeo/${carpeta}/${nombre}`)
      await uploadBytes(r, blob, { contentType: blob.type || 'image/jpeg', cacheControl: 'public, max-age=31536000' })
      onCambio(await getDownloadURL(r))
      toast.success('Imagen subida')
    } catch (err) {
      const code = (err as { code?: string })?.code || ''
      toast.error(code === 'storage/unauthorized'
        ? 'Sin permiso para subir imágenes (falta publicar la regla de Storage)'
        : 'No se pudo subir la imagen')
    } finally {
      setSubiendo(false)
      if (input.current) input.current.value = ''
    }
  }

  return (
    <div
      tabIndex={0}
      onPaste={(e) => {
        const f = [...e.clipboardData.files].find((x) => x.type.startsWith('image/'))
        if (f) { e.preventDefault(); subir(f) }
      }}
      onDragOver={(e) => { e.preventDefault(); setEncima(true) }}
      onDragLeave={() => setEncima(false)}
      onDrop={(e) => { e.preventDefault(); setEncima(false); subir(e.dataTransfer.files?.[0]) }}
      className={`rounded-lg border-2 border-dashed p-3 outline-none focus:border-primary transition-colors ${encima ? 'border-primary bg-primary/5' : 'border-gray-300'}`}
    >
      {valor ? (
        <div className="flex items-center gap-3">
          <img src={valor} alt="" className="w-20 h-20 object-cover rounded-md border border-gray-200" />
          <div className="flex flex-col gap-1.5 text-xs">
            <button type="button" onClick={() => input.current?.click()} disabled={subiendo} className="text-primary font-semibold hover:underline text-left">
              {subiendo ? 'Subiendo…' : 'Cambiar imagen'}
            </button>
            <button type="button" onClick={() => onCambio('')} className="text-red-600 hover:underline text-left inline-flex items-center gap-1">
              <X className="w-3 h-3" /> Quitar
            </button>
          </div>
        </div>
      ) : (
        <button type="button" onClick={() => input.current?.click()} disabled={subiendo}
          className="w-full flex flex-col items-center gap-1 py-2 text-sm text-coal">
          {subiendo ? <Loader2 className="w-6 h-6 animate-spin text-primary" /> : <ImagePlus className="w-6 h-6 text-primary" />}
          <span className="font-semibold">{subiendo ? 'Subiendo…' : texto}</span>
          <span className="text-[11px] text-muted-fg">Elige un archivo, arrástralo aquí o haz clic y pégalo (Ctrl/Cmd + V)</span>
        </button>
      )}
      <input ref={input} type="file" accept="image/*" className="hidden" onChange={(e) => subir(e.target.files?.[0])} />
    </div>
  )
}
