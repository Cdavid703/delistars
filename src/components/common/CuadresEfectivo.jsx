import { useEffect, useMemo, useState } from 'react'
import { collection, onSnapshot, query, where } from 'firebase/firestore'
import { AlertCircle, Banknote, Check, HandCoins, ShieldCheck, X } from 'lucide-react'
import { db } from '../../services/firebase'
import { llamarApi, ErrorApi } from '../../services/pedidosApi'
import { ESTADOS, cuentasDelTurno, efectivoCobrado, porCuadrar, textoDiferencia, montoValido } from '../../utils/cuadres'

const fmt = (v) => `$${Number(v || 0).toLocaleString('es-CO')}`
const hora = (t) => { const ms = t?.toMillis?.() ?? (typeof t === 'number' ? t : null); return ms ? new Date(ms).toLocaleTimeString('es-CO', { hour: 'numeric', minute: '2-digit' }) : '' }
const DOS_DIAS = 2 * 24 * 3600 * 1000

// Movimientos de efectivo entre domiciliario y caja (§13.2 y §13.3): entregas
// de plata a la caja y fondos para cambio, cada uno confirmado por el otro
// lado. Se incrusta en el cuadre de turno de los dos: modo 'domiciliario'
// (los míos) y modo 'caja' (los de la sede, por domiciliario; admin resuelve).
export default function CuadresEfectivo({ modo, sedeId, user, esAdmin = false, drivers = [], pedidos = [] }) {
  const [movs, setMovs] = useState([])
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const correo = (user?.email || '').toLowerCase()

  useEffect(() => {
    if (!sedeId) return
    const filtros = [...(sedeId !== 'all' ? [where('sedeId', '==', sedeId)] : []), ...(modo === 'domiciliario' ? [where('driverEmail', '==', correo)] : [])]
    return onSnapshot(query(collection(db, 'cuadres'), ...filtros), (snap) => {
      const desde = Date.now() - DOS_DIAS
      const l = snap.docs.map(d => ({ id: d.id, ...d.data() })).filter(m => (m.creadoAt?.toMillis?.() || Date.now()) >= desde)
      l.sort((a, b) => (b.creadoAt?.toMillis?.() || 0) - (a.creadoAt?.toMillis?.() || 0))
      setMovs(l)
    }, (e) => { console.error('cuadres:', e); setMovs([]) })
  }, [sedeId, modo, correo])

  const llamar = async (ruta, cuerpo) => {
    setError(''); setBusy(true)
    try { await llamarApi('POST', ruta, cuerpo); return true }
    catch (e) { setError(e instanceof ErrorApi ? e.message : 'No se pudo guardar. Revisa la conexión.'); return false }
    finally { setBusy(false) }
  }

  if (modo === 'domiciliario') {
    return <LadoDomiciliario sedeId={sedeId} movs={movs} pedidos={pedidos} llamar={llamar} busy={busy} error={error} />
  }
  return <LadoCaja sedeId={sedeId} movs={movs} pedidos={pedidos} drivers={drivers} esAdmin={esAdmin} llamar={llamar} busy={busy} error={error} />
}

function Cuentas({ c, lado }) {
  return (
    <div className="grid grid-cols-2 gap-2">
      <Dato etiqueta="Fondo para cambio" valor={c.fondos} />
      <Dato etiqueta="Efectivo cobrado" valor={c.cobrado} />
      <Dato etiqueta={lado === 'domiciliario' ? 'Ya entregado a la caja' : 'Ya recibido en caja'} valor={c.entregado} />
      <Dato etiqueta={lado === 'domiciliario' ? 'Debes tener en mano' : 'Debe tener en mano'} valor={c.enMano} fuerte />
    </div>
  )
}
const Dato = ({ etiqueta, valor, fuerte }) => (
  <div className={`rounded-xl px-3 py-2 ${fuerte ? 'bg-mustard/15 border border-mustard/40' : 'bg-cream/70'}`}>
    <p className="font-body text-[10px] uppercase tracking-wider text-coal/50">{etiqueta}</p>
    <p className={`font-display text-lg tabular ${fuerte ? 'text-coal' : 'text-coal/80'}`}>{fmt(valor)}</p>
  </div>
)

function Movimiento({ m, children }) {
  const cls = m.estado === 'confirmado' || m.estado === 'resuelto' ? 'bg-mint/15 text-mint' : m.estado === 'propuesto' ? 'bg-tangelo/15 text-tangelo' : 'bg-pepper/10 text-pepper'
  return (
    <div className="card-quiet flex flex-col gap-2">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="font-body text-sm font-semibold text-coal">
            {m.tipo === 'fondo' ? 'Fondo para cambio' : 'Entrega a la caja'} · {fmt(m.monto)}
          </p>
          <p className="font-body text-[11px] text-coal/50">{m.driverName} · {hora(m.creadoAt)}{m.pedidos?.length ? ` · ${m.pedidos.length} pedido${m.pedidos.length > 1 ? 's' : ''}` : ''}</p>
        </div>
        <span className={`font-body text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full whitespace-nowrap ${cls}`}>{ESTADOS[m.estado]?.texto || m.estado}</span>
      </div>
      {m.montoRecibido != null && m.estado !== 'propuesto' && m.diferencia !== 0 && (
        <p className="font-body text-xs text-pepper">{m.tipo === 'fondo' ? 'Recibió' : 'La caja contó'} {fmt(m.montoRecibido)} · {textoDiferencia(m.diferencia)}{m.motivo ? ` · ${m.motivo}` : ''}</p>
      )}
      {m.correcciones?.length > 0 && <p className="font-body text-[11px] text-coal/50">Corregido {m.correcciones.length} vez{m.correcciones.length > 1 ? 'es' : ''} (antes {fmt(m.correcciones[m.correcciones.length - 1].anterior)})</p>}
      {m.resolucion?.nota && <p className="font-body text-xs text-coal/70">Administración: {m.resolucion.nota}</p>}
      {children}
    </div>
  )
}

function LadoDomiciliario({ sedeId, movs, pedidos, llamar, busy, error }) {
  const [monto, setMonto] = useState('')
  const [abrir, setAbrir] = useState(false)
  const [recibido, setRecibido] = useState({})
  const c = useMemo(() => cuentasDelTurno(pedidos, movs), [pedidos, movs])
  const pendientes = pedidos.filter(porCuadrar)
  const fondosPorConfirmar = movs.filter(m => m.tipo === 'fondo' && m.estado === 'propuesto')

  const entregar = async () => {
    const n = montoValido(monto || String(c.porCuadrar))
    if (!n) return
    if (await llamar('cuadres/entregas', { sedeId, monto: n, pedidos: pendientes.map(p => p.id) })) { setMonto(''); setAbrir(false) }
  }

  return (
    <div className="card border border-mustard/30 flex flex-col gap-3">
      <p className="font-display text-base tracking-wide flex items-center gap-2"><HandCoins size={18} className="text-mustard" aria-hidden="true" /> Plata con la caja</p>
      <Cuentas c={c} lado="domiciliario" />
      {fondosPorConfirmar.map(m => (
        <Movimiento key={m.id} m={m}>
          <p className="font-body text-xs text-coal/70">¿Recibiste {fmt(m.monto)} de la caja para dar cambio?</p>
          <div className="flex gap-2">
            <button onClick={() => llamar(`cuadres/${m.id}/responder`, { acepta: true })} disabled={busy} className="btn-mint btn-sm flex-1"><Check size={15} aria-hidden="true" /> Sí, los recibí</button>
          </div>
          <div className="flex gap-2">
            <input className="input-field flex-1" inputMode="numeric" placeholder="Recibí otro valor…" value={recibido[m.id] || ''} onChange={e => setRecibido(r => ({ ...r, [m.id]: e.target.value }))} />
            <button onClick={() => { const n = montoValido(recibido[m.id]); if (n) llamar(`cuadres/${m.id}/responder`, { acepta: false, montoRecibido: n }) }} disabled={busy || !montoValido(recibido[m.id])} className="btn-secondary btn-sm">No cuadra</button>
          </div>
        </Movimiento>
      ))}
      {c.porCuadrar > 0 && !abrir && c.propuesto === 0 && (
        <button onClick={() => { setMonto(String(c.porCuadrar)); setAbrir(true) }} className="btn-mustard w-full">
          <Banknote size={17} aria-hidden="true" /> Entregar efectivo a la caja
        </button>
      )}
      {c.propuesto > 0 && <p className="font-body text-xs text-tangelo flex items-center gap-1.5"><AlertCircle size={13} aria-hidden="true" /> Propusiste entregar {fmt(c.propuesto)}: la caja debe contarlo y confirmarlo.</p>}
      {abrir && (
        <div className="bg-cream/70 rounded-xl p-3 flex flex-col gap-2">
          <label className="label-field">¿Cuánto le entregas a la caja?</label>
          <input className="input-field" inputMode="numeric" value={monto} onChange={e => setMonto(e.target.value)} />
          <p className="font-body text-[11px] text-coal/55">Por cuadrar: {fmt(c.porCuadrar)} de {pendientes.length} pedido{pendientes.length !== 1 ? 's' : ''}. Puedes entregar una parte y el resto después.</p>
          <button onClick={entregar} disabled={busy || !montoValido(monto)} className="btn-primary w-full">{busy ? 'Enviando…' : 'Proponer esta entrega'}</button>
          <button onClick={() => setAbrir(false)} className="btn-ghost w-full">Cancelar</button>
        </div>
      )}
      {movs.filter(m => !(m.tipo === 'fondo' && m.estado === 'propuesto')).slice(0, 8).map(m => <Movimiento key={m.id} m={m} />)}
      {error && <p className="font-body text-xs text-pepper">{error}</p>}
    </div>
  )
}

function LadoCaja({ sedeId, movs, pedidos, drivers, esAdmin, llamar, busy, error }) {
  const [fondo, setFondo] = useState({ driverEmail: '', monto: '' })
  const [conf, setConf] = useState({})     // id -> { montoRecibido, motivo }
  const [notas, setNotas] = useState({})   // id -> nota de resolución
  const [corr, setCorr] = useState({})     // id -> monto corregido
  // Un bloque por domiciliario con pedidos en efectivo hoy o con movimientos.
  const correos = useMemo(() => {
    const s = new Set()
    pedidos.forEach(p => { if (p.driverEmail && efectivoCobrado(p) > 0) s.add(String(p.driverEmail).toLowerCase()) })
    movs.forEach(m => m.driverEmail && s.add(String(m.driverEmail).toLowerCase()))
    return [...s]
  }, [pedidos, movs])
  const nombreDe = (correo) => drivers.find(d => (d.id || '').toLowerCase() === correo)?.name || movs.find(m => m.driverEmail === correo)?.driverName || pedidos.find(p => String(p.driverEmail).toLowerCase() === correo)?.driverName || correo

  const registrarFondo = async () => {
    const n = montoValido(fondo.monto)
    if (!fondo.driverEmail || !n) return
    if (await llamar('cuadres/fondos', { sedeId: sedeId === 'all' ? (drivers.find(d => d.id === fondo.driverEmail)?.sedeId || 'santa_lucia') : sedeId, driverEmail: fondo.driverEmail, driverName: nombreDe(fondo.driverEmail), monto: n })) setFondo({ driverEmail: '', monto: '' })
  }
  const confirmar = async (m) => {
    const c = conf[m.id] || {}
    const recibido = c.montoRecibido ? montoValido(c.montoRecibido) : Number(m.monto)
    if (!recibido) return
    const cuerpo = { montoRecibido: recibido }
    if (recibido !== Number(m.monto)) cuerpo.motivo = c.motivo || ''
    if (await llamar(`cuadres/${m.id}/confirmar`, cuerpo)) setConf(x => ({ ...x, [m.id]: {} }))
  }

  return (
    <div className="card border border-mustard/30 flex flex-col gap-3">
      <p className="font-display text-base tracking-wide flex items-center gap-2"><HandCoins size={18} className="text-mustard" aria-hidden="true" /> Efectivo con los domiciliarios</p>
      {correos.length === 0 && <p className="font-body text-sm text-coal/50">Hoy no hay efectivo en la calle.</p>}
      {correos.map(correo => {
        const misPedidos = pedidos.filter(p => String(p.driverEmail || '').toLowerCase() === correo)
        const misMovs = movs.filter(m => m.driverEmail === correo)
        const c = cuentasDelTurno(misPedidos, misMovs)
        return (
          <div key={correo} className="bg-cream/60 rounded-2xl p-3 flex flex-col gap-2">
            <p className="font-body text-sm font-bold text-coal">{nombreDe(correo)}</p>
            <Cuentas c={c} lado="caja" />
            {c.porCuadrar > 0 && <p className="font-body text-xs text-coal/60">Por cuadrar: {fmt(c.porCuadrar)} de {misPedidos.filter(porCuadrar).length} pedido{misPedidos.filter(porCuadrar).length !== 1 ? 's' : ''}.</p>}
            {misMovs.map(m => (
              <Movimiento key={m.id} m={m}>
                {m.tipo === 'entrega' && m.estado === 'propuesto' && (
                  <div className="flex flex-col gap-2">
                    <p className="font-body text-xs text-coal/70">Cuenta la plata. ¿Recibiste {fmt(m.monto)}?</p>
                    <div className="flex gap-2">
                      <input className="input-field flex-1" inputMode="numeric" placeholder={`Recibido (${fmt(m.monto)})`} value={conf[m.id]?.montoRecibido || ''} onChange={e => setConf(x => ({ ...x, [m.id]: { ...x[m.id], montoRecibido: e.target.value } }))} />
                      <button onClick={() => confirmar(m)} disabled={busy} className="btn-mint btn-sm"><Check size={15} aria-hidden="true" /> Confirmar</button>
                    </div>
                    {conf[m.id]?.montoRecibido && montoValido(conf[m.id].montoRecibido) !== Number(m.monto) && (
                      <input className="input-field" placeholder="Motivo de la diferencia (obligatorio)" value={conf[m.id]?.motivo || ''} onChange={e => setConf(x => ({ ...x, [m.id]: { ...x[m.id], motivo: e.target.value } }))} />
                    )}
                  </div>
                )}
                {m.tipo === 'fondo' && m.estado === 'rechazado' && (
                  <div className="flex gap-2">
                    <input className="input-field flex-1" inputMode="numeric" placeholder={`Corregir a… (dice ${fmt(m.montoRecibido)})`} value={corr[m.id] || ''} onChange={e => setCorr(x => ({ ...x, [m.id]: e.target.value }))} />
                    <button onClick={() => { const n = montoValido(corr[m.id]); if (n) llamar(`cuadres/${m.id}/corregir`, { monto: n }) }} disabled={busy || !montoValido(corr[m.id])} className="btn-secondary btn-sm">Corregir</button>
                  </div>
                )}
                {m.estado === 'con_diferencia' && (esAdmin ? (
                  <div className="flex gap-2">
                    <input className="input-field flex-1" placeholder="Cómo se resolvió" value={notas[m.id] || ''} onChange={e => setNotas(x => ({ ...x, [m.id]: e.target.value }))} />
                    <button onClick={() => llamar(`cuadres/${m.id}/resolver`, { nota: notas[m.id] || '' })} disabled={busy} className="btn-mint btn-sm"><ShieldCheck size={15} aria-hidden="true" /> Resolver</button>
                  </div>
                ) : <p className="font-body text-xs text-coal/60">Pendiente de administración.</p>)}
              </Movimiento>
            ))}
          </div>
        )
      })}
      <div className="bg-cream/70 rounded-xl p-3 flex flex-col gap-2">
        <label className="label-field">Dar fondo para cambio</label>
        <div className="flex gap-2">
          <select className="input-field flex-1" value={fondo.driverEmail} onChange={e => setFondo(f => ({ ...f, driverEmail: e.target.value }))}>
            <option value="">Domiciliario…</option>
            {drivers.map(d => <option key={d.id} value={d.id}>{d.name || d.id}</option>)}
          </select>
          <input className="input-field w-32" inputMode="numeric" placeholder="$" value={fondo.monto} onChange={e => setFondo(f => ({ ...f, monto: e.target.value }))} />
        </div>
        <button onClick={registrarFondo} disabled={busy || !fondo.driverEmail || !montoValido(fondo.monto)} className="btn-secondary w-full"><Banknote size={16} aria-hidden="true" /> Registrar fondo (él lo confirma)</button>
      </div>
      {error && <p className="font-body text-xs text-pepper flex items-start gap-1.5"><X size={13} className="flex-shrink-0 mt-0.5" aria-hidden="true" /> {error}</p>}
    </div>
  )
}
