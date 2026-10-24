import { useState } from 'react'
import { KeyRound, Copy, RefreshCw } from 'lucide-react'
import { llamarPedidos, ErrorApi } from '../../services/pedidosApi'

// Código privado de un pedido creado en la caja (Fase 4, decisión P-16): el
// cliente sin cuenta sigue su pedido con el enlace y el código, y si quiere lo
// guarda en su cuenta. Sirve mientras el pedido esté en curso y 30 días
// después. Generar uno nuevo anula el anterior.

// Enlace corto (Fase 6): /c/<código> abre el pedido en la web o, más adelante, en la app.
export const enlaceCodigo = (codigo) => `${window.location.origin}/c/${encodeURIComponent(codigo)}`

export function mensajeCodigo(order, codigo) {
  const nombre = (order.name || '').split(' ')[0]
  return `¡Hola${nombre ? ` ${nombre}` : ''}! Sigue tu pedido${order.orderNumber ? ` #${order.orderNumber}` : ''} de DeliStars aquí: ` +
    `${enlaceCodigo(codigo)}\n\nTu código privado es *${codigo}*. No lo compartas: con él cualquiera ve tu pedido.`
}

export default function CodigoPrivado({ order }) {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [copiado, setCopiado] = useState(false)
  if (order.clientUid) return null // ya está en la cuenta del cliente
  const codigo = order.codigoPrivado?.codigo

  const generar = async () => {
    if (codigo && !window.confirm('¿Generar un código nuevo? El anterior deja de servir.')) return
    setBusy(true); setError('')
    try { await llamarPedidos(`${order.id}/codigo`) }
    catch (err) { setError(err instanceof ErrorApi ? err.message : 'No se pudo generar. Revisa la conexión.') }
    finally { setBusy(false) }
  }
  const copiar = async () => {
    try {
      await navigator.clipboard.writeText(mensajeCodigo(order, codigo))
      setCopiado(true); setTimeout(() => setCopiado(false), 2000)
    } catch { setError('No se pudo copiar: selecciona el código a mano.') }
  }
  const digitos = (order.phone || '').replace(/\D/g, '')
  const waPhone = digitos.length >= 10 ? `57${digitos.slice(-10)}` : ''

  return (
    <div className="bg-white border-2 border-coal/10 rounded-2xl p-4 flex flex-col gap-3">
      <div className="flex items-center gap-2">
        <KeyRound size={18} className="text-cherry" />
        <p className="font-display text-base tracking-wide text-coal">Código privado del cliente</p>
      </div>
      {codigo ? (
        <>
          <p className="font-mono text-2xl font-bold tracking-[0.2em] text-coal text-center bg-smoked/50 rounded-xl py-2 select-all">
            {codigo}
          </p>
          <p className="font-body text-[11px] text-coal/55 leading-relaxed">
            Con el enlace y este código el cliente sigue su pedido sin cuenta, y puede guardarlo en su cuenta.
            Sirve hasta 30 días después de terminado.
          </p>
          <div className="grid grid-cols-2 gap-2">
            {waPhone ? (
              <a href={`https://wa.me/${waPhone}?text=${encodeURIComponent(mensajeCodigo(order, codigo))}`}
                target="_blank" rel="noreferrer"
                className="py-2.5 rounded-xl bg-[#25D366] text-white font-body text-sm font-bold text-center">
                Enviar por WhatsApp
              </a>
            ) : (
              <button onClick={copiar} className="py-2.5 rounded-xl bg-coal text-cream font-body text-sm font-bold">
                {copiado ? 'Copiado' : 'Copiar mensaje'}
              </button>
            )}
            <button onClick={generar} disabled={busy}
              className="py-2.5 rounded-xl border-2 border-coal/15 bg-white text-coal font-body text-sm font-semibold inline-flex items-center justify-center gap-1.5 disabled:opacity-50">
              <RefreshCw size={14} /> {busy ? 'Generando…' : 'Generar otro'}
            </button>
          </div>
          {waPhone && (
            <button onClick={copiar} className="font-body text-xs text-coal/60 underline underline-offset-2 inline-flex items-center gap-1 self-center">
              <Copy size={12} aria-hidden="true" /> {copiado ? 'Copiado' : 'Copiar el mensaje'}
            </button>
          )}
        </>
      ) : (
        <button onClick={generar} disabled={busy} className="btn-primary w-full">
          {busy ? 'Generando…' : 'Generar código para el cliente'}
        </button>
      )}
      {error && <p className="font-body text-xs text-pepper">{error}</p>}
    </div>
  )
}
