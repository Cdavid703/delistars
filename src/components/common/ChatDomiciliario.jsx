import { useEffect, useRef, useState } from 'react'
import { collection, onSnapshot, orderBy, query } from 'firebase/firestore'
import { MessageSquare, Send, Lock } from 'lucide-react'
import { db } from '../../services/firebase'
import { llamarPedidos, ErrorApi } from '../../services/pedidosApi'
import { motivoCerrado, textoCerrado, MAX_TEXTO } from '../../utils/chat'
import { BotonFoto, FotosMensaje } from './FotosChat'

// Chat cliente ↔ domiciliario de un pedido (especificación §8.3, Fase 7). Vive
// en orders/{id}/chat_domiciliario y la caja no lo lee: aquí lo ven el cliente
// (rol 'client'), el domiciliario asignado ('driver') y administración ('admin',
// solo lectura, para reclamos). Los mensajes se mandan por la API, que revisa
// quién habla y que el chat siga abierto (hasta 3 h después de la entrega).
export default function ChatDomiciliario({ order, rol, soloLectura = false, className = '' }) {
  const [mensajes, setMensajes] = useState(null) // null = cargando
  const [texto, setTexto]       = useState('')
  const [enviando, setEnviando] = useState(false)
  const [error, setError]       = useState('')
  const finRef = useRef(null)

  useEffect(() => {
    if (!order?.id) return
    const q = query(collection(db, 'orders', order.id, 'chat_domiciliario'), orderBy('ts', 'asc'))
    return onSnapshot(q, (snap) => setMensajes(snap.docs.map(d => ({ id: d.id, ...d.data() }))),
      (e) => { console.error('chat domiciliario:', e); setMensajes([]) })
  }, [order?.id])

  // El último mensaje siempre a la vista, sin saltos cuando llega uno nuevo.
  useEffect(() => { finRef.current?.scrollIntoView({ block: 'nearest' }) }, [mensajes?.length])

  const cerrado = motivoCerrado(order, 'domiciliario')
  // Para el cliente sin domiciliario todavía no vale la pena mostrar la caja.
  if (cerrado === 'sin_domiciliario' && rol === 'client' && !(mensajes?.length)) return null

  const otro = rol === 'driver' ? 'el cliente' : 'el domiciliario'
  const titulo = rol === 'driver' ? 'Chat con el cliente' : rol === 'client' ? 'Chat con el domiciliario' : 'Chat cliente ↔ domiciliario'
  const mio = (m) => (rol === 'client' && m.role === 'client') || (rol === 'driver' && m.role === 'driver')
  const quien = (m) => m.role === 'client' ? (rol === 'client' ? 'Tú' : m.name || 'Cliente')
    : m.role === 'driver' ? (rol === 'driver' ? 'Tú' : m.name || 'Domiciliario') : m.name || 'Administración'

  const enviar = async () => {
    const t = texto.trim()
    if (!t || enviando) return
    setError('')
    setEnviando(true)
    try {
      await llamarPedidos(`${order.id}/mensajes`, { canal: 'domiciliario', texto: t })
      setTexto('')
    } catch (e) {
      setError(e instanceof ErrorApi ? e.message : 'No se pudo enviar. Revisa tu conexión e intenta de nuevo.')
    } finally { setEnviando(false) }
  }
  // Foto (§8.3): sale con lo que esté escrito.
  const enviarFoto = async (foto) => {
    setError('')
    await llamarPedidos(`${order.id}/mensajes`, { canal: 'domiciliario', texto: texto.trim(), foto })
    setTexto('')
  }

  return (
    <div className={`card border-2 border-mint/30 flex flex-col gap-3 ${className}`}>
      <div className="flex items-center gap-2">
        <MessageSquare size={16} className="text-mint" aria-hidden="true" />
        <p className="font-display text-base tracking-wide text-coal">{titulo}</p>
        {rol === 'admin' && <span className="ml-auto font-body text-[10px] uppercase tracking-wider text-coal/45">Solo lectura</span>}
      </div>
      {rol !== 'admin' && (
        <p className="font-body text-xs text-coal/50 -mt-1">
          {rol === 'driver' ? 'Solo lo ven el cliente y tú; la caja no.' : 'Solo lo ven el domiciliario y tú.'}
        </p>
      )}

      {mensajes === null ? (
        <p className="font-body text-xs text-coal/40">Cargando…</p>
      ) : mensajes.length > 0 ? (
        <div className="flex flex-col gap-2 max-h-72 overflow-y-auto scroll-custom pr-1">
          {mensajes.map((m) => (
            <div key={m.id} className={`rounded-xl px-3 py-2 ${mio(m) ? 'bg-mint/10 border border-mint/20 ml-6' : 'bg-smoked/60 border border-coal/10 mr-6'}`}>
              <p className={`font-body text-[10px] font-bold uppercase tracking-wider mb-0.5 ${mio(m) ? 'text-mint' : 'text-coal/55'}`}>
                {quien(m)}
              </p>
              {m.text && <p className="font-body text-sm text-coal whitespace-pre-line">{m.text}</p>}
              <FotosMensaje foto={m.foto} />
            </div>
          ))}
          <div ref={finRef} />
        </div>
      ) : (
        <p className="font-body text-xs text-coal/40">
          {cerrado ? 'Sin mensajes.' : `Aún no hay mensajes. Escríbele a ${otro} si necesitas coordinar la entrega.`}
        </p>
      )}

      {soloLectura || rol === 'admin' ? null : cerrado ? (
        <p className="font-body text-xs text-coal/50 flex items-center gap-1.5">
          <Lock size={13} aria-hidden="true" /> {textoCerrado(cerrado, 'domiciliario')}
        </p>
      ) : (
        <div className="flex flex-col gap-1">
          <div className="flex gap-2">
            <textarea
              className="textarea-field flex-1 h-14 scroll-custom text-sm"
              placeholder={rol === 'driver' ? 'Ej: ya voy llegando, ¿me abres?' : 'Ej: el timbre no sirve, llámame al llegar'}
              value={texto}
              maxLength={MAX_TEXTO}
              onChange={e => setTexto(e.target.value)}
            />
            <BotonFoto orderId={order.id} onSubida={enviarFoto} disabled={enviando} />
            <button onClick={enviar} disabled={enviando || !texto.trim()} className="btn-mint px-3 self-end" aria-label="Enviar">
              <Send size={16} aria-hidden="true" />
            </button>
          </div>
          {error && <p className="font-body text-xs text-pepper">{error}</p>}
        </div>
      )}
    </div>
  )
}
