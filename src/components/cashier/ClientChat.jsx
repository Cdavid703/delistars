import { useState } from 'react'
import { doc, updateDoc, arrayUnion, serverTimestamp } from 'firebase/firestore'
import { db } from '../../services/firebase'
import { useAuth } from '../../contexts/AuthContext'
import { MessageSquare, Send } from 'lucide-react'

// Chat cajero ↔ cliente de un pedido. Componente compartido para que esté
// disponible en TODAS las pantallas donde la caja gestiona un pedido: antes
// solo existía en el detalle, así que un pedido ya cotizado (que se abre en
// "Asignar domicilio") mostraba el aviso de mensaje nuevo sin forma de leerlo
// ni responderlo.
export default function ClientChat({ order, unreadCount = 0, compact = false }) {
  const { user } = useAuth()
  const [text, setText]       = useState('')
  const [sending, setSending] = useState(false)
  const [error, setError]     = useState('')

  const msgs = order.clientMessages || []
  const cerrado = ['rejected', 'cancelled', 'completed'].includes(order.status)

  const send = async () => {
    if (!text.trim()) return
    setError('')
    setSending(true)
    try {
      await updateDoc(doc(db, 'orders', order.id), {
        clientMessages: arrayUnion({
          role: 'cashier',
          name: user?.displayName || user?.email || 'Cajero',
          text: text.trim(),
          ts:   Date.now(),
        }),
        updatedAt: serverTimestamp(),
      })
      setText('')
    } catch (err) {
      console.error('Error al enviar mensaje:', err)
      setError('No se pudo enviar el mensaje. Revisa tu conexión e intenta de nuevo.')
    } finally { setSending(false) }
  }

  return (
    <div className={`card flex flex-col gap-3 ${unreadCount > 0 ? 'border-2 border-cherry bg-cherry/5' : 'border border-cherry/15'}`}>
      <div className="flex items-center gap-2">
        <MessageSquare size={15} className="text-cherry" />
        <p className="font-display text-sm tracking-wide text-coal">Chat con el cliente</p>
        {unreadCount > 0 && (
          <span className="ml-auto inline-flex items-center gap-1 bg-cherry text-cream rounded-full px-2 py-0.5 text-[10px] font-body font-bold uppercase tracking-wider">
            {unreadCount} nuevo{unreadCount > 1 ? 's' : ''}
          </span>
        )}
      </div>

      {msgs.length > 0 ? (
        <div className={`flex flex-col gap-2 ${compact ? 'max-h-44 overflow-y-auto scroll-custom' : ''}`}>
          {[...msgs].sort((a, b) => a.ts - b.ts).map((m, i) => (
            <div key={i} className={`rounded-xl px-3 py-2 ${m.role === 'cashier' ? 'bg-tangelo/10 border border-tangelo/20 ml-4' : 'bg-cherry/5 border border-cherry/20 mr-4'}`}>
              <p className={`font-body text-[10px] font-bold uppercase tracking-wider mb-0.5 ${m.role === 'cashier' ? 'text-tangelo' : 'text-cherry'}`}>
                {m.role === 'cashier' ? '🧾 Cajero' : '🛍️ Cliente'} · {m.name}
              </p>
              <p className="font-body text-sm text-coal">{m.text}</p>
            </div>
          ))}
        </div>
      ) : (
        <p className="font-body text-xs text-coal/40">
          Sin mensajes aún — escríbele al cliente apenas entra su pedido si necesitas confirmar algo.
        </p>
      )}

      {!cerrado && (
        <div className="flex flex-col gap-1">
          <div className="flex gap-2">
            <textarea
              className="textarea-field flex-1 h-14 scroll-custom text-sm"
              placeholder="Mensaje para el cliente (ej: tu pedido está casi listo…)"
              value={text}
              onChange={e => setText(e.target.value)}
            />
            <button onClick={send} disabled={sending || !text.trim()} className="btn-primary px-3 self-end">
              <Send size={16} />
            </button>
          </div>
          {error && <p className="font-body text-xs text-pepper">{error}</p>}
        </div>
      )}
    </div>
  )
}
