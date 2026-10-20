import { useEffect, useState } from 'react'
import { KeyRound, MapPin, Store, Check, ArrowLeft } from 'lucide-react'
import Logo from '../components/common/Logo'
import AccesoCuenta from '../components/common/AccesoCuenta'
import { useAuth } from '../contexts/AuthContext'
import { llamarPedidos, ErrorApi } from '../services/pedidosApi'
import { progreso } from '../utils/etapas'

// Seguir un pedido hecho en la caja con su código privado (Fase 4, P-16), sin
// cuenta. Con cuenta, se puede guardar en "Mis pedidos". La página consulta al
// servidor cada 20 s: el cliente sin cuenta no puede leer el pedido en Firestore.

const fmt = (v) => (v == null ? null : `$${Number(v).toLocaleString('es-CO')}`)

async function verCodigo(codigo) {
  const res = await fetch('/api/v1/pedidos/codigo/ver', {
    method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ codigo }),
  })
  let datos = {}
  try { datos = await res.json() } catch { /* sin cuerpo */ }
  if (!res.ok) throw new ErrorApi(datos.error || 'No se pudo consultar. Intenta de nuevo.', datos.codigo || 'http', res.status)
  return datos
}

export default function SeguirConCodigo({ codigoInicial = '' }) {
  const { user } = useAuth()
  const [texto, setTexto] = useState(codigoInicial)
  const [codigo, setCodigo] = useState(null)       // el que funcionó
  const [pedido, setPedido] = useState(null)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [acceso, setAcceso] = useState(false)
  const [guardado, setGuardado] = useState(false)
  const conCuenta = !!user && !user.isAnonymous

  const buscar = async (c = texto) => {
    if (!c.trim()) { setError('Escribe el código que te mandó la sede.'); return }
    setBusy(true); setError('')
    try {
      const p = await verCodigo(c)
      setPedido(p); setCodigo(c)
    } catch (err) {
      setError(err instanceof ErrorApi ? err.message : 'Sin conexión. Revisa tu internet e intenta de nuevo.')
    } finally { setBusy(false) }
  }

  // Con el enlace (?codigo=…) se abre directo.
  useEffect(() => { if (codigoInicial) buscar(codigoInicial) }, []) // eslint-disable-line react-hooks/exhaustive-deps

  // Se actualiza solo mientras la pantalla está abierta.
  useEffect(() => {
    if (!codigo) return
    const t = setInterval(() => { verCodigo(codigo).then(setPedido).catch(() => {}) }, 20000)
    return () => clearInterval(t)
  }, [codigo])

  const guardar = async () => {
    setBusy(true); setError('')
    try {
      await llamarPedidos('codigo/vincular', { codigo })
      setGuardado(true)
    } catch (err) {
      setError(err instanceof ErrorApi ? err.message : 'No se pudo guardar. Intenta de nuevo.')
    } finally { setBusy(false) }
  }

  // A "Mis pedidos" ya en la sede del pedido (sin volver a preguntarla).
  const irAMisPedidos = () => {
    try { if (pedido?.sedeId) sessionStorage.setItem('ds_sede_pedido', pedido.sedeId) } catch { /* sin almacenamiento */ }
    window.location.replace('/domicilios/')
  }

  return (
    <div className="min-h-screen-safe bg-gradient-to-br from-cherry via-tangelo to-mustard px-4 py-8 flex flex-col items-center">
      <div className="w-full max-w-md flex flex-col gap-4">
        <div className="bg-cream rounded-3xl shadow-2xl p-6 flex flex-col gap-4">
          <div className="flex items-center justify-between">
            <Logo variant="light" size="md" />
            <a href="/domicilios/" className="btn-icon" aria-label="Volver"><ArrowLeft size={18} /></a>
          </div>

          {!pedido ? (
            <>
              <div>
                <p className="font-display text-2xl tracking-wide text-coal flex items-center gap-2">
                  <KeyRound size={22} className="text-cherry" /> Sigue tu pedido
                </p>
                <p className="font-body text-sm text-coal/65 mt-1 leading-relaxed">
                  Escribe el código privado que te mandó la sede por WhatsApp (8 letras y números).
                </p>
              </div>
              <form onSubmit={(e) => { e.preventDefault(); buscar() }} className="flex flex-col gap-2">
                <input
                  className="w-full bg-white border border-coal/15 rounded-xl px-4 py-3 font-mono text-xl tracking-[0.2em] text-center uppercase text-coal focus:outline-none focus:border-cherry"
                  placeholder="K7QM-4ZP9" autoCapitalize="characters" autoComplete="off" spellCheck={false}
                  value={texto} onChange={(e) => setTexto(e.target.value)} maxLength={12} />
                <button type="submit" disabled={busy} className="btn-primary w-full">
                  {busy ? 'Buscando…' : 'Ver mi pedido'}
                </button>
              </form>
            </>
          ) : (
            <VistaPedido pedido={pedido} />
          )}

          {error && <p className="font-body text-sm text-pepper">{error}</p>}
        </div>

        {/* Guardarlo en la cuenta: después sale en "Mis pedidos" con avisos y chat */}
        {pedido && !pedido.vinculado && !guardado && (
          <div className="bg-cream rounded-3xl shadow-xl p-5 flex flex-col gap-2">
            <p className="font-display text-lg tracking-wide text-coal">Guárdalo en tu cuenta</p>
            <p className="font-body text-xs text-coal/65 leading-relaxed">
              Así lo sigues desde cualquier celular, chateas con la sede y acumulas premios.
            </p>
            {conCuenta ? (
              <button onClick={guardar} disabled={busy} className="btn-primary w-full">
                {busy ? 'Guardando…' : `Guardar en mi cuenta (${user.email})`}
              </button>
            ) : (
              <button onClick={() => setAcceso(true)} className="btn-primary w-full">Entrar o crear cuenta</button>
            )}
          </div>
        )}
        {(guardado || (pedido?.vinculado && conCuenta)) && (
          <div className="bg-mint text-cream rounded-3xl shadow-xl p-5 flex flex-col gap-2">
            <p className="font-display text-lg tracking-wide flex items-center gap-2"><Check size={18} /> Pedido en tu cuenta</p>
            <button onClick={irAMisPedidos} className="bg-cream text-mint font-body font-bold rounded-xl py-2.5">Ir a mis pedidos</button>
          </div>
        )}
      </div>
      {acceso && <AccesoCuenta titulo="Guarda tu pedido" onCerrar={() => setAcceso(false)} onListo={() => window.location.reload()} />}
    </div>
  )
}

function VistaPedido({ pedido: p }) {
  const prog = progreso(p)
  const exc = prog.excepcion
  return (
    <div className="flex flex-col gap-4">
      <div>
        <p className="font-display text-2xl tracking-wide text-coal">
          {p.nombre ? `${p.nombre}, tu pedido` : 'Tu pedido'}{p.orderNumber ? ` #${p.orderNumber}` : ''}
        </p>
        <p className="font-body text-xs text-coal/55 mt-0.5">{p.sedeName || 'DeliStars'}</p>
      </div>

      {exc ? (
        <div className={`rounded-2xl p-4 border-2 ${exc.final ? 'bg-pepper/10 border-pepper/40' : 'bg-tangelo/10 border-tangelo/40'}`}>
          <p className="font-display text-lg tracking-wide text-coal">{exc.texto}</p>
          {exc.motivo && <p className="font-body text-sm text-coal/70 mt-1">{exc.motivo}</p>}
        </div>
      ) : null}

      {/* Barra de etapas */}
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

      <div className="bg-white rounded-2xl p-4 flex flex-col gap-2">
        <p className="font-body text-sm text-coal whitespace-pre-line leading-relaxed">{p.items}</p>
        <div className="border-t border-coal/10 pt-2 flex flex-col gap-1 font-body text-sm">
          {p.domicilio != null && p.deliveryMode === 'delivery' && (
            <div className="flex justify-between text-coal/70"><span>Domicilio</span><span>{fmt(p.domicilio)}</span></div>
          )}
          {p.total != null && (
            <div className="flex justify-between font-bold text-coal"><span>Total</span><span className="text-cherry">{fmt(p.total)}</span></div>
          )}
          {p.pago && <div className="flex justify-between text-coal/70"><span>Pago</span><span>{p.pago}</span></div>}
        </div>
      </div>

      <p className="font-body text-xs text-coal/60 flex items-start gap-1.5">
        {p.deliveryMode === 'pickup'
          ? <><Store size={14} className="flex-shrink-0 mt-0.5" /> Lo recoges en {p.sedeName || 'la sede'}.</>
          : <><MapPin size={14} className="flex-shrink-0 mt-0.5" /> {p.direccion}</>}
      </p>
      <p className="font-body text-[11px] text-coal/45 text-center">Se actualiza solo cada 20 segundos.</p>
    </div>
  )
}
