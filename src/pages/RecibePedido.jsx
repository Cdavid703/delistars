import { useEffect, useState, lazy, Suspense } from 'react'
import { Gift, MapPin, Check, Banknote } from 'lucide-react'
import Logo from '../components/common/Logo'
import { progreso } from '../utils/etapas'

// Quien recibe un pedido para otra persona (§7.3) lo sigue con su enlace
// (?recibe=<token>), sin cuenta. Ve el estado, el mapa mientras va en camino y
// lo que tiene que pagar (o que no paga nada). Sin chats, precios del pedido
// ni datos de quien lo pidió. El enlace vence 3 horas después de entregado.
// La página consulta al servidor cada 15 s.

const LiveDriverMap = lazy(() => import('../components/client/LiveDriverMap'))

const fmt = (v) => `$${Number(v).toLocaleString('es-CO')}`

class ErrorEnlace extends Error {
  constructor(mensaje, status) { super(mensaje); this.status = status }
}

async function verEnlace(token) {
  const res = await fetch('/api/v1/pedidos/destinatario/ver', {
    method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ token }),
  })
  let datos = {}
  try { datos = await res.json() } catch { /* sin cuerpo */ }
  if (!res.ok) throw new ErrorEnlace(datos.error || 'No se pudo consultar. Intenta de nuevo.', res.status)
  return datos
}

export default function RecibePedido({ token }) {
  const [pedido, setPedido] = useState(null)
  const [error, setError] = useState('')

  useEffect(() => {
    let vigente = true
    const cargar = () => verEnlace(token)
      .then((p) => { if (vigente) { setPedido(p); setError('') } })
      .catch((err) => {
        if (!vigente) return
        // Sin conexión un momento: se deja lo último que se vio.
        if (err instanceof ErrorEnlace) { setPedido(null); setError(err.message) }
        else setError((e) => e || 'Sin conexión. Revisa tu internet.')
      })
    cargar()
    const t = setInterval(cargar, 15000)
    return () => { vigente = false; clearInterval(t) }
  }, [token])

  return (
    <div className="min-h-screen-safe bg-gradient-to-br from-cherry via-tangelo to-mustard px-4 py-8 flex flex-col items-center">
      <div className="w-full max-w-md bg-cream rounded-3xl shadow-2xl p-6 flex flex-col gap-4">
        <Logo variant="light" size="md" />
        {pedido ? <Vista p={pedido} /> : error ? (
          <p className="font-body text-sm text-coal/75 leading-relaxed">{error}</p>
        ) : (
          <p className="font-body text-sm text-coal/55">Cargando tu pedido…</p>
        )}
        {pedido && error && <p className="font-body text-xs text-pepper">{error}</p>}
      </div>
    </div>
  )
}

function Vista({ p }) {
  const prog = progreso(p)
  const exc = prog.excepcion
  return (
    <div className="flex flex-col gap-4">
      <div>
        <p className="font-display text-2xl tracking-wide text-coal flex items-center gap-2">
          <Gift size={22} className="text-cherry flex-shrink-0" aria-hidden="true" />
          {p.recibe ? `${p.recibe}, te llega un pedido` : 'Te llega un pedido'}
        </p>
        <p className="font-body text-sm text-coal/60 mt-1">
          {p.envia ? `Te lo mandó ${p.envia}` : 'Te lo mandaron'} desde DeliStars {p.sedeName || ''}
          {p.orderNumber ? ` · Pedido #${p.orderNumber}` : ''}
        </p>
      </div>

      {exc && (
        <div className={`rounded-2xl p-4 border-2 ${exc.final ? 'bg-pepper/10 border-pepper/40' : 'bg-tangelo/10 border-tangelo/40'}`}>
          <p className="font-display text-lg tracking-wide text-coal">{exc.texto}</p>
          {exc.final && <p className="font-body text-sm text-coal/70 mt-1">Pregúntale a {p.envia || 'quien te lo mandó'} qué pasó.</p>}
        </div>
      )}

      <ol className="flex flex-col gap-1.5">
        {prog.pasos.map((paso) => (
          <li key={paso.id} className="flex items-center gap-2.5">
            <span className={`w-6 h-6 rounded-full flex items-center justify-center text-[11px] font-bold ${
              paso.estado === 'hecha' ? 'bg-mint text-cream'
                : paso.estado === 'actual' ? 'bg-cherry text-cream ring-4 ring-cherry/20'
                  : 'bg-coal/10 text-coal/40'}`}>
              {paso.estado === 'hecha' ? <Check size={13} strokeWidth={3} /> : null}
            </span>
            <span className={`font-body text-sm ${paso.estado === 'pendiente' ? 'text-coal/40' : 'text-coal font-semibold'}`}>
              {paso.texto}
              {paso.estado === 'actual' && paso.id === 'en_camino' && p.domiciliario ? ` · ${p.domiciliario}` : ''}
            </span>
          </li>
        ))}
      </ol>

      {p.ubicacion && (
        <div className="flex flex-col gap-1.5">
          <Suspense fallback={<div className="h-[240px] rounded-xl bg-coal/5" />}>
            <LiveDriverMap driverLat={p.ubicacion.lat} driverLng={p.ubicacion.lng}
              destLat={p.destino?.lat} destLng={p.destino?.lng} />
          </Suspense>
          <p className="font-body text-[11px] text-coal/50 text-center">La moto es el domiciliario y la casa, tu dirección.</p>
        </div>
      )}

      {/* Plata: solo lo que tiene que pagar quien recibe (o que no paga nada). */}
      {p.noPaga ? (
        <div className="bg-mint/10 border-2 border-mint/40 rounded-2xl p-4">
          <p className="font-display text-lg tracking-wide text-mint flex items-center gap-2">
            <Check size={18} aria-hidden="true" /> No tienes que pagar al recibir
          </p>
        </div>
      ) : (
        <div className="bg-white border-2 border-mustard/50 rounded-2xl p-4 flex flex-col gap-1.5 font-body text-sm">
          <p className="font-display text-base tracking-wide text-coal flex items-center gap-2">
            <Banknote size={18} className="text-mustard" aria-hidden="true" /> Pagas en efectivo al recibir
          </p>
          <div className="flex justify-between"><span className="text-coal/60">A pagar</span>
            <span className="font-display text-2xl text-cherry">{p.aPagar != null ? fmt(p.aPagar) : 'La sede lo está confirmando'}</span></div>
          {p.billete != null && p.billete > (p.aPagar ?? 0) && (<>
            <div className="flex justify-between"><span className="text-coal/60">Pagas con</span><span className="font-semibold">{fmt(p.billete)}</span></div>
            <div className="flex justify-between"><span className="text-coal/60">Te devuelven</span><span className="font-semibold">{fmt(p.cambio ?? p.billete - p.aPagar)}</span></div>
          </>)}
        </div>
      )}

      {p.direccion && (
        <p className="font-body text-xs text-coal/60 flex items-start gap-1.5">
          <MapPin size={14} className="flex-shrink-0 mt-0.5" aria-hidden="true" /> {p.direccion}
        </p>
      )}
      <p className="font-body text-[11px] text-coal/45 text-center">
        {p.venceAt ? 'Este enlace deja de funcionar 3 horas después de la entrega.' : 'Se actualiza solo.'}
      </p>
    </div>
  )
}
