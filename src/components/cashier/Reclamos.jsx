import { useEffect, useMemo, useState } from 'react'
import { collection, onSnapshot, query, where } from 'firebase/firestore'
import { AlertCircle, Check, ClipboardList, Send, X, Banknote, ShieldCheck, Clock } from 'lucide-react'
import { db } from '../../services/firebase'
import { llamarApi, ErrorApi } from '../../services/pedidosApi'
import { ESTADOS, ABIERTOS, REEMBOLSO } from '../../utils/reclamos'
import useBackClose from '../../hooks/useBackClose'
import { BotonFoto, FotosMensaje } from '../common/FotosChat'

const fmt = (v) => `$${Number(v || 0).toLocaleString('es-CO')}`
const hora = (ts) => (ts ? new Date(ts).toLocaleString('es-CO', { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' }) : '')
const hace = (t) => {
  const ms = t?.toMillis?.() ?? (typeof t === 'number' ? t : null)
  if (ms == null) return ''
  const min = Math.round((Date.now() - ms) / 60000)
  return min < 60 ? `hace ${min} min` : min < 1440 ? `hace ${Math.round(min / 60)} h` : `hace ${Math.round(min / 1440)} d`
}

// Reclamos de los clientes (§14, Fase 7). La caja ve los de comida de su sede
// y propone soluciones (con reembolso, si hace falta: lo autoriza
// administración); administración ve todos, autoriza reembolsos y puede
// cerrar un caso sin acuerdo, con motivo.
export default function Reclamos({ sedeId, esAdmin, onAbiertos }) {
  const [lista, setLista] = useState([])
  const [filtro, setFiltro] = useState('abiertos')
  const [abierto, setAbierto] = useState(null)

  useEffect(() => {
    if (!sedeId) return
    const col = collection(db, 'reclamos')
    // La regla de lectura de la caja exige categoría "producto": la consulta
    // tiene que filtrarla o Firestore la rechaza entera.
    const filtros = [...(sedeId !== 'all' ? [where('sedeId', '==', sedeId)] : []), ...(esAdmin ? [] : [where('categoria', '==', 'producto')])]
    return onSnapshot(query(col, ...filtros), (snap) => {
      const l = snap.docs.map(d => ({ id: d.id, ...d.data() }))
      l.sort((a, b) => (b.actualizadoAt?.toMillis?.() || 0) - (a.actualizadoAt?.toMillis?.() || 0))
      setLista(l)
    }, (e) => { console.error('reclamos:', e); setLista([]) })
  }, [sedeId, esAdmin])

  const abiertos = useMemo(() => lista.filter(r => ABIERTOS.includes(r.estado)), [lista])
  useEffect(() => { onAbiertos?.(abiertos.length) }, [abiertos.length, onAbiertos])
  const visibles = filtro === 'abiertos' ? abiertos : lista
  const seleccionado = abierto ? lista.find(r => r.id === abierto) : null

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center gap-2">
        <button onClick={() => setFiltro('abiertos')} className={`btn btn-sm ${filtro === 'abiertos' ? 'bg-cherry text-cream' : 'btn-secondary'}`}>Abiertos · {abiertos.length}</button>
        <button onClick={() => setFiltro('todos')} className={`btn btn-sm ${filtro === 'todos' ? 'bg-cherry text-cream' : 'btn-secondary'}`}>Todos · {lista.length}</button>
      </div>
      {visibles.length === 0 && (
        <div className="flex flex-col items-center justify-center gap-3 py-16 text-center">
          <ClipboardList size={32} className="text-coal/25" aria-hidden="true" />
          <p className="font-body text-coal/40">{filtro === 'abiertos' ? 'No hay reclamos abiertos' : 'No hay reclamos'}</p>
        </div>
      )}
      {visibles.map(r => (
        <button key={r.id} onClick={() => setAbierto(r.id)} className="order-card w-full text-left">
          <div className="flex items-start justify-between gap-2 mb-1">
            <div className="min-w-0">
              <p className="font-body text-sm font-semibold text-coal truncate">
                {r.clientNombre || 'Cliente'}{r.orderNumber ? ` · pedido #${r.orderNumber}` : ''}
              </p>
              <p className="font-body text-xs text-coal/60">{r.motivo} · {r.categoria === 'producto' ? 'comida' : 'entrega'}{sedeId === 'all' && r.sedeName ? ` · ${r.sedeName}` : ''}</p>
            </div>
            <Estado r={r} />
          </div>
          <p className="font-body text-xs text-coal/70 line-clamp-2">{r.descripcion}</p>
          <div className="flex items-center gap-2 mt-2 font-body text-[11px] text-coal/45">
            <Clock size={11} aria-hidden="true" /> {hace(r.actualizadoAt)}
            {r.reembolso?.monto > 0 && <span className="ml-auto text-tangelo font-semibold">{fmt(r.reembolso.monto)} · {REEMBOLSO[r.reembolso.estado] || r.reembolso.estado}</span>}
          </div>
        </button>
      ))}
      {seleccionado && <FichaEquipo r={seleccionado} esAdmin={esAdmin} onClose={() => setAbierto(null)} />}
    </div>
  )
}

function Estado({ r }) {
  const esperaAdmin = r.reembolso?.estado === 'solicitado'
  const cls = r.estado === 'resuelto' ? 'bg-mint/15 text-mint' : r.estado === 'cierre_administrativo' ? 'bg-coal/10 text-coal/60'
    : r.estado === 'recibido' ? 'bg-cherry text-cream' : esperaAdmin ? 'bg-mustard/30 text-coal' : 'bg-tangelo/15 text-tangelo'
  return (
    <span className={`font-body text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full whitespace-nowrap ${cls}`}>
      {esperaAdmin && r.estado === 'en_revision' ? 'Espera a admin' : ESTADOS[r.estado]?.texto || r.estado}
    </span>
  )
}

function FichaEquipo({ r, esAdmin, onClose }) {
  useBackClose(true, onClose)
  const [texto, setTexto]       = useState('')
  const [reembolso, setReemb]   = useState('')
  const [monto, setMonto]       = useState('')
  const [motivo, setMotivo]     = useState('')
  const [modo, setModo]         = useState(null) // 'proponer' | 'rechazar' | 'cerrar'
  const [error, setError]       = useState('')
  const [busy, setBusy]         = useState(false)
  const final = !!ESTADOS[r.estado]?.final
  const esperaAdmin = r.reembolso?.estado === 'solicitado'
  const puedeProponer = !final && r.estado !== 'propuesta' && !esperaAdmin
  const mensajes = (r.mensajes || []).filter(m => !m.interno || esAdmin)

  const llamar = async (accion, cuerpo) => {
    setError(''); setBusy(true)
    try { await llamarApi('POST', `reclamos/${r.id}/${accion}`, cuerpo); return true }
    catch (e) { setError(e instanceof ErrorApi ? e.message : 'No se pudo guardar. Revisa la conexión.'); return false }
    finally { setBusy(false) }
  }
  const proponer = async () => {
    if (texto.trim().length < 5) { setError('Escribe la solución que le propones al cliente'); return }
    const cuerpo = { texto: texto.trim() }
    if (reembolso.trim()) cuerpo.reembolso = Number(reembolso.replace(/\D/g, ''))
    if (await llamar('proponer', cuerpo)) { setTexto(''); setReemb(''); setModo(null) }
  }
  const autorizar = async () => {
    const cuerpo = monto.trim() ? { monto: Number(monto.replace(/\D/g, '')) } : {}
    if (await llamar('autorizar', cuerpo)) setMonto('')
  }
  const rechazar = async () => {
    if (motivo.trim().length < 5) { setError('Escribe por qué no se autoriza'); return }
    if (await llamar('autorizar', { rechazar: true, motivo: motivo.trim() })) { setMotivo(''); setModo(null) }
  }
  const cerrar = async () => {
    if (motivo.trim().length < 5) { setError('El cierre necesita un motivo'); return }
    if (await llamar('cerrar', { motivo: motivo.trim() })) { setMotivo(''); setModo(null); onClose() }
  }
  const mensaje = async () => {
    if (!texto.trim()) return
    if (await llamar('mensaje', { texto: texto.trim() })) setTexto('')
  }
  // Foto para el cliente: sale con lo que esté escrito.
  const enviarFoto = async (foto) => {
    if (await llamar('mensaje', { texto: texto.trim(), foto })) setTexto('')
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-coal/50 backdrop-blur-sm animate-fade-in"
      onClick={e => { if (e.target === e.currentTarget) onClose() }}>
      <div className="bg-cream w-full max-w-lg rounded-t-3xl sm:rounded-3xl max-h-[92dvh] overflow-y-auto scroll-custom animate-sheet-up sm:animate-scale-in">
        <div className="sticky top-0 z-10 bg-cream/95 backdrop-blur-sm flex items-center justify-between px-5 py-4 border-b border-coal/10">
          <div className="min-w-0">
            <p className="font-display text-lg text-coal tracking-wide truncate">{r.clientNombre || 'Cliente'}{r.orderNumber ? ` · #${r.orderNumber}` : ''}</p>
            <p className="font-body text-xs text-coal/55">{r.motivo} · {r.sedeName}{r.clientEmail ? ` · ${r.clientEmail}` : ''}</p>
          </div>
          <div className="flex items-center gap-2 flex-shrink-0">
            <Estado r={r} />
            <button onClick={onClose} className="btn-icon" aria-label="Cerrar"><X size={20} aria-hidden="true" /></button>
          </div>
        </div>

        <div className="p-5 flex flex-col gap-4">
          <div className="card-quiet">
            <p className="font-body text-[10px] uppercase tracking-wider text-coal/45 mb-1">Lo que contó el cliente</p>
            <p className="font-body text-sm text-coal whitespace-pre-line">{r.descripcion}</p>
            {/* Fotos que mandó el cliente con el reporte */}
            <FotosMensaje fotos={r.fotos} />
            <p className="font-body text-[11px] text-coal/45 mt-2">Pedido de {fmt(r.totalPrice)} · {r.payment || 'sin forma de pago'} · {hace(r.creadoAt)}</p>
          </div>

          {mensajes.length > 1 && (
            <div className="flex flex-col gap-2">
              {mensajes.slice(1).map((m, i) => (
                <div key={i} className={`rounded-xl px-3 py-2 ${m.role === 'client' ? 'bg-cherry/5 border border-cherry/20 mr-6' : 'bg-tangelo/10 border border-tangelo/20 ml-6'}`}>
                  <p className={`font-body text-[10px] font-bold uppercase tracking-wider mb-0.5 ${m.role === 'client' ? 'text-cherry' : 'text-tangelo'}`}>
                    {m.role === 'client' ? 'Cliente' : m.role === 'admin' ? 'Administración' : 'Caja'} · {m.name} · {hora(m.ts)}
                  </p>
                  {m.text && <p className="font-body text-sm text-coal whitespace-pre-line">{m.text}</p>}
                  <FotosMensaje foto={m.foto} fotos={m.fotos} />
                </div>
              ))}
            </div>
          )}

          {/* Reembolso: dónde va la plata */}
          {r.reembolso?.monto > 0 && (
            <div className={`rounded-2xl p-4 border-2 ${esperaAdmin ? 'bg-mustard/15 border-mustard' : 'bg-mint/10 border-mint/40'}`}>
              <p className="font-display text-base tracking-wide text-coal flex items-center gap-2">
                <Banknote size={17} className="text-coal/50" aria-hidden="true" /> Reembolso de {fmt(r.reembolso.monto)} · {REEMBOLSO[r.reembolso.estado] || r.reembolso.estado}
              </p>
              {r.reembolso.motivoRechazo && <p className="font-body text-xs text-coal/70 mt-1">No autorizado: {r.reembolso.motivoRechazo}</p>}
              {r.reembolso.eleccion && (
                <p className="font-body text-xs text-coal/70 mt-1">
                  {r.reembolso.estado === 'faltan_datos'
                    ? 'El cliente eligió transferencia pero todavía no deja sus datos. Cuando los complete, aparece en la franja de devoluciones de la caja.'
                    : <>
                        El cliente eligió {r.reembolso.eleccion === 'saldo' ? 'saldo a favor (ya quedó en su cuenta)' : `transferencia a ${r.reembolso.datos?.medio || ''} ${r.reembolso.datos?.numero || ''} (${r.reembolso.datos?.titular || ''})`}.
                        {r.reembolso.eleccion === 'transferencia' && r.reembolso.estado !== 'ejecutado' && ' Está en la franja de devoluciones de la caja.'}
                      </>}
                </p>
              )}
              {esperaAdmin && !esAdmin && <p className="font-body text-xs text-coal/70 mt-1">Esperando que administración lo autorice. El cliente todavía no ve la propuesta.</p>}
              {esperaAdmin && esAdmin && modo !== 'rechazar' && (
                <div className="flex flex-col gap-2 mt-3">
                  <p className="font-body text-xs text-coal/70">Propuesta de la caja: «{r.propuesta?.texto}»</p>
                  <input className="input-field" inputMode="numeric" value={monto} onChange={e => setMonto(e.target.value)} placeholder={`Autorizar ${fmt(r.reembolso.monto)} (o escribe otro monto)`} />
                  <button onClick={autorizar} disabled={busy} className="btn-mint w-full"><ShieldCheck size={17} aria-hidden="true" /> Autorizar reembolso</button>
                  <button onClick={() => setModo('rechazar')} className="btn-ghost w-full">No autorizar</button>
                </div>
              )}
              {esperaAdmin && esAdmin && modo === 'rechazar' && (
                <div className="flex flex-col gap-2 mt-3">
                  <textarea className="textarea-field h-16 scroll-custom text-sm" value={motivo} onChange={e => setMotivo(e.target.value)} placeholder="Por qué no se autoriza (la caja lo ve)" />
                  <button onClick={rechazar} disabled={busy} className="btn-danger w-full">No autorizar</button>
                  <button onClick={() => setModo(null)} className="btn-ghost w-full">Volver</button>
                </div>
              )}
            </div>
          )}

          {r.estado === 'propuesta' && (
            <p className="font-body text-sm text-coal/70 bg-cherry/5 border border-cherry/20 rounded-xl px-3 py-2">
              Propuesta enviada: «{r.propuesta?.texto}». Esperando al cliente.
            </p>
          )}
          {r.cierre?.motivo && <p className="font-body text-sm text-coal/70">Cerrado por administración: {r.cierre.motivo}</p>}

          {/* Acciones del equipo */}
          {r.estado === 'recibido' && (
            <button onClick={() => llamar('revisar')} disabled={busy} className="btn-primary w-full">
              <Check size={17} aria-hidden="true" /> Tomar el caso
            </button>
          )}
          {puedeProponer && r.estado !== 'recibido' && modo !== 'proponer' && modo !== 'cerrar' && (
            <button onClick={() => setModo('proponer')} className="btn-primary w-full">Proponer una solución</button>
          )}
          {modo === 'proponer' && (
            <div className="card-quiet flex flex-col gap-2">
              <label className="label-field">Solución para el cliente</label>
              <textarea className="textarea-field h-20 scroll-custom text-sm" value={texto} onChange={e => setTexto(e.target.value)}
                placeholder="Ej: te enviamos la gaseosa que faltó ya mismo, sin costo" />
              <label className="label-field">Reembolso en pesos <span className="text-[10px] text-coal/40 normal-case font-normal">(opcional{esAdmin ? '' : '; lo autoriza administración'})</span></label>
              <input className="input-field" inputMode="numeric" value={reembolso} onChange={e => setReemb(e.target.value)} placeholder="0" />
              <button onClick={proponer} disabled={busy} className="btn-primary w-full">{busy ? 'Enviando…' : <><Send size={16} aria-hidden="true" /> Enviar propuesta</>}</button>
              <button onClick={() => setModo(null)} className="btn-ghost w-full">Cancelar</button>
            </div>
          )}
          {!final && esAdmin && modo !== 'cerrar' && modo !== 'proponer' && (
            <button onClick={() => setModo('cerrar')} className="btn-link text-xs self-start text-pepper decoration-pepper/40">Cerrar el caso sin acuerdo</button>
          )}
          {modo === 'cerrar' && (
            <div className="card-quiet flex flex-col gap-2">
              <label className="label-field">Motivo del cierre (el cliente lo ve)</label>
              <textarea className="textarea-field h-16 scroll-custom text-sm" value={motivo} onChange={e => setMotivo(e.target.value)} />
              <button onClick={cerrar} disabled={busy} className="btn-danger w-full">Cerrar el caso</button>
              <button onClick={() => setModo(null)} className="btn-ghost w-full">Volver</button>
            </div>
          )}

          {!final && modo === null && (
            <div className="flex gap-2">
              <textarea className="textarea-field flex-1 h-14 scroll-custom text-sm" value={texto} onChange={e => setTexto(e.target.value)} placeholder="Mensaje al cliente…" />
              <BotonFoto orderId={r.orderId} onSubida={enviarFoto} disabled={busy} etiqueta="Mandarle una foto al cliente" />
              <button onClick={mensaje} disabled={busy || !texto.trim()} className="btn-primary px-3 self-end" aria-label="Enviar"><Send size={16} aria-hidden="true" /></button>
            </div>
          )}
          {error && <p className="font-body text-xs text-pepper flex items-start gap-1.5"><AlertCircle size={13} className="flex-shrink-0 mt-0.5" aria-hidden="true" /> {error}</p>}
        </div>
      </div>
    </div>
  )
}
