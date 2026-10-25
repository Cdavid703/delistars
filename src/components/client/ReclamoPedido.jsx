import { useEffect, useState } from 'react'
import { collection, onSnapshot, query, where } from 'firebase/firestore'
import { AlertCircle, Check, ClipboardList, Lock, MessageSquare, Send, Wallet, Building2, Banknote } from 'lucide-react'
import { db } from '../../services/firebase'
import { llamarApi, ErrorApi } from '../../services/pedidosApi'
import { CATEGORIAS, ESTADOS, REEMBOLSO, MAX_DESCRIPCION, motivoNoReclamable, textoNoReclamable, textoParaCliente } from '../../utils/reclamos'
import { MEDIOS_DEVOLUCION, erroresDatosDevolucion } from '../../utils/devolucion'

const fmt = (v) => `$${Number(v || 0).toLocaleString('es-CO')}`
const hora = (ts) => (ts ? new Date(ts).toLocaleString('es-CO', { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' }) : '')

// Reportar un problema de un pedido entregado y seguir el caso (§14, Fase 7).
// La ficha vive en reclamos/{id}; aquí el cliente la crea, lee el hilo,
// responde a la propuesta del equipo y, si hay plata de vuelta, elige cómo.
export default function ReclamoPedido({ order, user }) {
  const [reclamo, setReclamo] = useState(undefined) // undefined = cargando, null = no hay
  const [abrirForm, setAbrirForm] = useState(false)

  useEffect(() => {
    if (!order?.id || !user?.uid) { setReclamo(null); return }
    const q = query(collection(db, 'reclamos'), where('orderId', '==', order.id), where('clientUid', '==', user.uid))
    return onSnapshot(q, (snap) => {
      const lista = snap.docs.map(d => ({ id: d.id, ...d.data() }))
      lista.sort((a, b) => (b.creadoAt?.toMillis?.() || 0) - (a.creadoAt?.toMillis?.() || 0))
      setReclamo(lista[0] || null)
    }, () => setReclamo(null))
  }, [order?.id, user?.uid])

  if (reclamo === undefined) return null
  if (reclamo) return <FichaReclamo reclamo={reclamo} order={order} />

  const no = motivoNoReclamable(order)
  if (no === 'no_entregado') return null
  if (no) {
    return (
      <p className="font-body text-xs text-coal/50 flex items-start gap-1.5">
        <Lock size={13} className="flex-shrink-0 mt-0.5" aria-hidden="true" /> {textoNoReclamable(no)}
      </p>
    )
  }
  if (!abrirForm) {
    return (
      <button type="button" onClick={() => setAbrirForm(true)} className="btn-secondary w-full">
        <AlertCircle size={17} aria-hidden="true" /> Reportar un problema
      </button>
    )
  }
  return <FormularioReclamo order={order} onCancel={() => setAbrirForm(false)} />
}

function FormularioReclamo({ order, onCancel }) {
  const [categoria, setCategoria] = useState('')
  const [motivo, setMotivo]       = useState('')
  const [descripcion, setDesc]    = useState('')
  const [error, setError]         = useState('')
  const [busy, setBusy]           = useState(false)
  const puedeEntrega = order.deliveryMode !== 'pickup'

  const enviar = async () => {
    setError('')
    if (!categoria) { setError('Elige qué falló: la comida o la entrega'); return }
    if (!motivo) { setError('Elige el motivo'); return }
    if (descripcion.trim().length < 10) { setError('Cuéntanos un poco más (mínimo 10 letras)'); return }
    setBusy(true)
    try {
      await llamarApi('POST', 'reclamos', { orderId: order.id, categoria, motivo, descripcion: descripcion.trim() })
    } catch (e) {
      setError(e instanceof ErrorApi ? e.message : 'No se pudo enviar. Revisa tu conexión e intenta de nuevo.')
      setBusy(false)
    }
  }

  return (
    <div className="card border-2 border-tangelo/40 flex flex-col gap-3">
      <p className="font-display text-base tracking-wide text-coal flex items-center gap-2">
        <AlertCircle size={17} className="text-tangelo" aria-hidden="true" /> ¿Qué pasó con tu pedido?
      </p>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
        {Object.entries(CATEGORIAS).filter(([k]) => k !== 'entrega' || puedeEntrega).map(([k, c]) => (
          <button key={k} type="button" onClick={() => { setCategoria(k); setMotivo('') }}
            className={`btn btn-sm w-full justify-center border-2 ${categoria === k ? 'border-cherry bg-cherry/10 text-cherry' : 'border-coal/15 text-coal/70'}`}>
            {c.texto}
          </button>
        ))}
      </div>
      {categoria && (
        <div className="flex flex-wrap gap-2">
          {CATEGORIAS[categoria].motivos.map(m => (
            <button key={m} type="button" onClick={() => setMotivo(m)}
              className={`btn btn-sm border ${motivo === m ? 'bg-cherry text-cream border-cherry' : 'bg-white text-coal/70 border-coal/15'}`}>
              {m}
            </button>
          ))}
        </div>
      )}
      <textarea className="textarea-field h-24 scroll-custom text-sm" value={descripcion} maxLength={MAX_DESCRIPCION}
        onChange={e => setDesc(e.target.value)} placeholder="Cuéntanos qué pasó con el mayor detalle posible" />
      {error && <p className="font-body text-xs text-pepper flex items-start gap-1.5"><AlertCircle size={13} className="flex-shrink-0 mt-0.5" aria-hidden="true" /> {error}</p>}
      <div className="flex flex-col gap-2">
        <button type="button" onClick={enviar} disabled={busy} className="btn-primary w-full">
          {busy ? 'Enviando…' : <><Send size={16} aria-hidden="true" /> Enviar el reporte</>}
        </button>
        <button type="button" onClick={onCancel} className="btn-ghost w-full">Cancelar</button>
      </div>
    </div>
  )
}

// Cómo quiere el cliente su plata: saldo (solo con cuenta con correo) o
// transferencia con sus datos. Se usa al aceptar la propuesta y al completar
// una transferencia que eligió sin datos desde el reloj.
function ElegirDevolucion({ monto, sedeName, conCorreo, eleccion, setElec, datos, setDatos }) {
  return (
    <>
      <p className="font-body text-sm text-coal flex items-center gap-2">
        <Banknote size={16} className="text-coal/50" aria-hidden="true" /> Te devolvemos <strong>{fmt(monto)}</strong>. ¿Cómo la quieres?
      </p>
      <div className="flex flex-col gap-2">
        {conCorreo && (
          <button type="button" onClick={() => setElec('saldo')}
            className={`w-full text-left rounded-xl border-2 px-4 py-3 font-body ${eleccion === 'saldo' ? 'border-mint bg-mint/10' : 'border-coal/15 bg-cream'}`}>
            <p className="text-sm font-bold text-coal flex items-center gap-2"><Wallet size={16} className="text-mint" aria-hidden="true" /> Saldo a favor para mi próximo pedido</p>
            <p className="text-xs text-coal/60">Queda ya mismo en tu cuenta para pedir en {sedeName || 'esta sede'}. No vence.</p>
          </button>
        )}
        <button type="button" onClick={() => setElec('transferencia')}
          className={`w-full text-left rounded-xl border-2 px-4 py-3 font-body ${eleccion === 'transferencia' ? 'border-cherry bg-cherry/10' : 'border-coal/15 bg-cream'}`}>
          <p className="text-sm font-bold text-coal flex items-center gap-2"><Building2 size={16} className="text-coal/50" aria-hidden="true" /> Transferencia</p>
          <p className="text-xs text-coal/60">La caja te la envía a tu cuenta o Nequi.</p>
        </button>
      </div>
      {eleccion === 'transferencia' && (
        <div className="flex flex-col gap-2">
          <select className="input-field" value={datos.medio} onChange={e => setDatos(d => ({ ...d, medio: e.target.value }))}>
            <option value="">¿A dónde te transferimos?</option>
            {MEDIOS_DEVOLUCION.map(m => <option key={m}>{m}</option>)}
          </select>
          <input className="input-field" inputMode="numeric" value={datos.numero} placeholder="Número de cuenta o celular"
            onChange={e => setDatos(d => ({ ...d, numero: e.target.value }))} />
          <input className="input-field" value={datos.titular} placeholder="Nombre del titular"
            onChange={e => setDatos(d => ({ ...d, titular: e.target.value }))} />
          {['Bancolombia', 'Otro banco'].includes(datos.medio) && (
            <input className="input-field" inputMode="numeric" value={datos.documento} placeholder="Cédula del titular (opcional)"
              onChange={e => setDatos(d => ({ ...d, documento: e.target.value }))} />
          )}
        </div>
      )}
    </>
  )
}

function FichaReclamo({ reclamo: r, order }) {
  const [texto, setTexto]     = useState('')
  const [eleccion, setElec]   = useState(r.reembolso?.estado === 'faltan_datos' ? 'transferencia' : '')
  const [datos, setDatos]     = useState({ medio: '', numero: '', titular: '', documento: '' })
  const [sigue, setSigue]     = useState(false)
  const [error, setError]     = useState('')
  const [busy, setBusy]       = useState(false)
  const final = !!ESTADOS[r.estado]?.final
  const mensajes = (r.mensajes || []).filter(m => !m.interno)
  const reembolsoAutorizado = r.estado === 'propuesta' && r.reembolso?.estado === 'autorizado'
  // Eligió transferencia desde el reloj sin dejar sus datos (W-6): los completa aquí.
  const faltanDatos = r.reembolso?.estado === 'faltan_datos'
  const conCorreo = !!r.clientEmail

  const llamar = async (accion, cuerpo) => {
    setError(''); setBusy(true)
    try { await llamarApi('POST', `reclamos/${r.id}/${accion}`, cuerpo); return true }
    catch (e) { setError(e instanceof ErrorApi ? e.message : 'No se pudo enviar. Revisa tu conexión e intenta de nuevo.'); return false }
    finally { setBusy(false) }
  }
  // Elección y datos validados, o null si falta algo (deja el error en pantalla).
  const eleccionValida = () => {
    if (!eleccion) { setError('Elige cómo quieres tu plata'); return null }
    if (eleccion !== 'transferencia') return { eleccion }
    const errs = erroresDatosDevolucion(datos)
    if (errs.length) { setError(errs.join('. ')); return null }
    return { eleccion, datos: { medio: datos.medio, numero: datos.numero.trim(), titular: datos.titular.trim(), documento: datos.documento.trim() || null } }
  }
  const aceptar = async () => {
    let cuerpo = { acepta: true }
    if (reembolsoAutorizado) {
      const e = eleccionValida()
      if (!e) return
      cuerpo = { ...cuerpo, ...e }
    }
    await llamar('responder', cuerpo)
  }
  const completar = async () => {
    const e = eleccionValida()
    if (e) await llamar('reembolso', e)
  }
  // El comentario es opcional: «el problema sigue» basta.
  const noSirve = async () => {
    const t = texto.trim()
    if (await llamar('responder', t ? { acepta: false, texto: t } : { acepta: false })) { setTexto(''); setSigue(false) }
  }
  const mensaje = async () => {
    if (!texto.trim()) return
    if (await llamar('mensaje', { texto: texto.trim() })) setTexto('')
  }

  return (
    <div className={`card border-2 flex flex-col gap-3 ${final ? 'border-coal/10' : 'border-tangelo/40'}`}>
      <div className="flex items-center gap-2">
        <ClipboardList size={17} className="text-tangelo" aria-hidden="true" />
        <p className="font-display text-base tracking-wide text-coal">Tu reporte</p>
        <span className={`ml-auto font-body text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full ${
          r.estado === 'resuelto' ? 'bg-mint/15 text-mint' : r.estado === 'propuesta' ? 'bg-cherry/10 text-cherry' : 'bg-coal/10 text-coal/60'}`}>
          {ESTADOS[r.estado]?.texto || r.estado}
        </span>
      </div>
      <p className="font-body text-xs text-coal/60">{r.motivo} · {textoParaCliente(r)}</p>

      {mensajes.length > 0 && (
        <div className="flex flex-col gap-2 max-h-72 overflow-y-auto scroll-custom pr-1">
          {mensajes.map((m, i) => (
            <div key={i} className={`rounded-xl px-3 py-2 ${m.role === 'client' ? 'bg-cherry/5 border border-cherry/20 ml-6' : 'bg-tangelo/10 border border-tangelo/20 mr-6'}`}>
              <p className={`font-body text-[10px] font-bold uppercase tracking-wider mb-0.5 ${m.role === 'client' ? 'text-cherry' : 'text-tangelo'}`}>
                {m.role === 'client' ? 'Tú' : m.role === 'admin' ? 'Administración' : 'La sede'} · {hora(m.ts)}
              </p>
              <p className="font-body text-sm text-coal whitespace-pre-line">{m.text}</p>
            </div>
          ))}
        </div>
      )}

      {/* La propuesta del equipo: aceptar (eligiendo cómo recibir la plata) o decir que sigue */}
      {r.estado === 'propuesta' && (
        <div className="bg-cherry/5 border-2 border-cherry rounded-2xl p-4 flex flex-col gap-3">
          <p className="font-display text-base tracking-wide text-cherry">Nuestra propuesta</p>
          <p className="font-body text-sm text-coal/85 whitespace-pre-line">{r.propuesta?.texto}</p>
          {reembolsoAutorizado && (
            <ElegirDevolucion monto={r.reembolso.monto} sedeName={r.sedeName} conCorreo={conCorreo}
              eleccion={eleccion} setElec={setElec} datos={datos} setDatos={setDatos} />
          )}
          {!sigue ? (
            <div className="flex flex-col gap-2">
              <button type="button" onClick={aceptar} disabled={busy} className="btn-primary w-full">
                {busy ? 'Enviando…' : <><Check size={17} aria-hidden="true" /> Me sirve, aceptar</>}
              </button>
              <button type="button" onClick={() => setSigue(true)} className="btn-ghost w-full">El problema sigue</button>
            </div>
          ) : (
            <div className="flex flex-col gap-2">
              <textarea className="textarea-field h-20 scroll-custom text-sm" value={texto} onChange={e => setTexto(e.target.value)}
                placeholder="Cuéntanos qué sigue mal (opcional)" />
              <button type="button" onClick={noSirve} disabled={busy} className="btn-primary w-full">{busy ? 'Enviando…' : 'Enviar'}</button>
              <button type="button" onClick={() => setSigue(false)} className="btn-ghost w-full">Volver</button>
            </div>
          )}
        </div>
      )}

      {faltanDatos && (
        <div className="bg-cherry/5 border-2 border-cherry rounded-2xl p-4 flex flex-col gap-3">
          <p className="font-body text-sm text-coal/80">Elegiste transferencia desde tu reloj. Falta que nos digas a dónde, o cámbiala por saldo a favor.</p>
          <ElegirDevolucion monto={r.reembolso.monto} sedeName={r.sedeName} conCorreo={conCorreo}
            eleccion={eleccion} setElec={setElec} datos={datos} setDatos={setDatos} />
          <button type="button" onClick={completar} disabled={busy} className="btn-primary w-full">
            {busy ? 'Guardando…' : 'Guardar'}
          </button>
        </div>
      )}

      {r.estado === 'resuelto' && r.reembolso?.monto > 0 && !faltanDatos && (
        <p className="font-body text-sm text-coal/80 bg-mint/10 border border-mint/30 rounded-xl px-3 py-2 flex items-start gap-2">
          <Banknote size={16} className="text-mint flex-shrink-0 mt-0.5" aria-hidden="true" />
          <span>
            {r.reembolso.eleccion === 'saldo'
              ? <>Tienes <strong>{fmt(r.reembolso.monto)}</strong> a favor para tu próximo pedido en {r.sedeName || 'esta sede'}. No vence.</>
              : r.reembolso.estado === 'ejecutado'
                ? <>Ya te transferimos <strong>{fmt(r.reembolso.monto)}</strong>.</>
                : <>La caja te transfiere <strong>{fmt(r.reembolso.monto)}</strong> a {r.reembolso.datos?.medio || 'tu cuenta'}. Te avisamos cuando esté hecho.</>}
          </span>
        </p>
      )}
      {r.estado === 'cierre_administrativo' && r.cierre?.motivo && (
        <p className="font-body text-sm text-coal/70">Motivo: {r.cierre.motivo}</p>
      )}

      {!final && r.estado !== 'propuesta' && (
        <div className="flex gap-2">
          <textarea className="textarea-field flex-1 h-14 scroll-custom text-sm" value={texto} maxLength={MAX_DESCRIPCION}
            onChange={e => setTexto(e.target.value)} placeholder="Agregar algo al caso…" />
          <button type="button" onClick={mensaje} disabled={busy || !texto.trim()} className="btn-primary px-3 self-end" aria-label="Enviar">
            <Send size={16} aria-hidden="true" />
          </button>
        </div>
      )}
      {error && <p className="font-body text-xs text-pepper">{error}</p>}
      {final && (
        <p className="font-body text-[11px] text-coal/45 flex items-center gap-1.5">
          <MessageSquare size={12} aria-hidden="true" /> Caso cerrado. Si necesitas algo más, escríbenos por WhatsApp.
        </p>
      )}
    </div>
  )
}
