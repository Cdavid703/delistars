import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { collection, onSnapshot, query, where } from 'firebase/firestore'
import { Printer, AlertTriangle, Check, RotateCcw, X, ChevronDown } from 'lucide-react'
import { db } from '../../services/firebase'
import { llamarApi } from '../../services/pedidosApi'
import { ambiguo } from '../../utils/comanda'

// Impresión de comandas (Fase 7, especificación §19).
//
// El aparato que la caja marca como «impresora» (el computador con la
// impresora USB) hace de puente: escucha la cola de su sede, toma cada trabajo
// en el servidor (así nunca lo imprimen dos aparatos), lo imprime y avisa el
// resultado. Con Chrome abierto con --kiosk-printing sale sin cuadro de
// diálogo; sin eso, Chrome muestra el cuadro y la caja toca Imprimir.
// «Enviada» significa que se mandó a Windows, no que salió el papel.

const hoyColombia = () => new Date(Date.now() - 5 * 3600 * 1000).toISOString().slice(0, 10)
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]))

/** HTML de la comanda para papel térmico de 80 mm. */
function htmlComanda(lineas) {
  const cuerpo = (lineas || []).map((l) => l.e === 'linea' ? '<hr/>' : `<div class="${l.e || ''}">${esc(l.t) || '&nbsp;'}</div>`).join('')
  return `<!DOCTYPE html><html><head><meta charset="utf-8"><title>Comanda</title><style>
    @page{size:80mm auto;margin:3mm}
    body{font-family:ui-monospace,Menlo,Consolas,monospace;font-size:13px;line-height:1.35;width:72mm;margin:0;color:#000}
    .titulo{font-size:30px;font-weight:700;text-align:center;margin:2px 0}
    .grande{font-size:17px;font-weight:700}
    .negrita{font-weight:700}
    hr{border:0;border-top:1px dashed #000;margin:6px 0}
    div{white-space:pre-wrap;word-break:break-word}
  </style></head><body>${cuerpo}</body></html>`
}

/** Imprime en este aparato con un marco oculto (sin abrir otra ventana). */
function imprimirAqui(lineas) {
  return new Promise((resolve, reject) => {
    const marco = document.createElement('iframe')
    marco.setAttribute('aria-hidden', 'true')
    marco.style.cssText = 'position:fixed;right:0;bottom:0;width:0;height:0;border:0;visibility:hidden'
    document.body.appendChild(marco)
    const quitar = () => setTimeout(() => marco.remove(), 1500)
    try {
      const d = marco.contentWindow.document
      d.open(); d.write(htmlComanda(lineas)); d.close()
      setTimeout(() => {
        try {
          marco.contentWindow.focus()
          marco.contentWindow.print() // con --kiosk-printing no muestra cuadro
          quitar(); resolve()
        } catch (e) { quitar(); reject(e) }
      }, 250)
    } catch (e) { quitar(); reject(e) }
  })
}

/** El puente: mientras este aparato sea la impresora, imprime la cola de la sede. */
function usePuente(sedeId, activo, puestoId) {
  const [pendientes, setPendientes] = useState([])
  const [ultimo, setUltimo] = useState(null) // { ok, texto, at }
  const [toque, setToque] = useState(0)
  const ocupado = useRef(false)

  useEffect(() => {
    if (!activo) return
    const q = query(collection(db, 'impresiones'), where('sedeId', '==', sedeId), where('estado', '==', 'pendiente'))
    return onSnapshot(q, (s) => setPendientes(s.docs.map((d) => ({ id: d.id, ...d.data() })).sort((a, b) => a.creadoAt - b.creadoAt)), () => {})
  }, [sedeId, activo])

  // Si algo falló de red, vuelve a intentar tomar la cola cada 15 s.
  useEffect(() => {
    if (!activo || !pendientes.length) return
    const t = setInterval(() => setToque((n) => n + 1), 15000)
    return () => clearInterval(t)
  }, [activo, pendientes.length])

  useEffect(() => {
    if (!activo || ocupado.current || !pendientes.length) return
    const j = pendientes[0]
    ocupado.current = true
    ;(async () => {
      try {
        const t = await llamarApi('POST', `impresiones/${j.id}/tomar`, { puesto: puestoId })
        if (t.estado !== 'enviando') { setUltimo({ ok: false, texto: `#${j.orderNumber || '—'}: ${t.error || 'quedó esperando revisión'}`, at: Date.now() }); return }
        try {
          await imprimirAqui(j.lineas)
          await llamarApi('POST', `impresiones/${j.id}/resultado`, { puesto: puestoId, ok: true })
          setUltimo({ ok: true, texto: j.tipo === 'prueba' ? 'Página de prueba enviada' : `Comanda #${j.orderNumber || '—'} enviada`, at: Date.now() })
        } catch (e) {
          await llamarApi('POST', `impresiones/${j.id}/resultado`, { puesto: puestoId, ok: false, error: e?.message || 'No se pudo imprimir' }).catch(() => {})
          setUltimo({ ok: false, texto: `#${j.orderNumber || '—'}: no se pudo imprimir`, at: Date.now() })
        }
      } catch { /* otro aparato la tomó o no hay red: la cola se vuelve a leer */ } finally {
        ocupado.current = false
        setToque((n) => n + 1)
      }
    })()
  }, [activo, pendientes, puestoId, toque])

  return { enCola: activo ? pendientes.length : 0, ultimo }
}

/** Trabajos de hoy de la sede (para ver los que necesitan revisión). */
function useTrabajosDeHoy(sedeId, activo) {
  const [lista, setLista] = useState([])
  useEffect(() => {
    if (!activo) return
    const q = query(collection(db, 'impresiones'), where('sedeId', '==', sedeId), where('creadoDia', '==', hoyColombia()))
    return onSnapshot(q, (s) => setLista(s.docs.map((d) => ({ id: d.id, ...d.data() }))), () => {})
  }, [sedeId, activo])
  return lista
}

/** Un trabajo que la caja debe revisar: error, viejo o en duda. */
export function RevisarTrabajo({ j, compacto = false }) {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const enDuda = ambiguo(j)
  const accion = async (ruta, cuerpo) => {
    setBusy(true); setError('')
    try { await llamarApi('POST', `impresiones/${j.id}/${ruta}`, cuerpo || {}) } catch (e) { setError(e.message) } finally { setBusy(false) }
  }
  const que = enDuda
    ? 'No se sabe si salió: revisa la impresora antes de repetirla.'
    : j.estado === 'pendiente_reintento' ? (j.error || 'Esperó mucho sin imprimirse.') : (j.error || 'No se pudo imprimir.')
  return (
    <div className={`flex flex-col gap-1.5 ${compacto ? '' : 'bg-cream rounded-xl px-3 py-2'}`}>
      <p className="font-body text-xs text-coal">
        <strong>{j.tipo === 'prueba' ? 'Página de prueba' : `#${j.orderNumber || '—'}`}</strong>
        {j.tipo === 'copia' ? ' (copia)' : j.tipo === 'actualizada' ? ' (actualizada)' : ''} · {que}
      </p>
      <div className="flex flex-wrap gap-1.5">
        {(enDuda || j.estado === 'error') && (
          <button onClick={() => accion('revisar', { salio: true })} disabled={busy} className="btn-secondary btn-sm"><Check size={14} aria-hidden="true" /> Sí salió</button>
        )}
        <button onClick={() => accion('revisar', { salio: false })} disabled={busy} className="btn-primary btn-sm"><RotateCcw size={14} aria-hidden="true" /> Reintentar</button>
        <button onClick={() => accion('descartar')} disabled={busy} className="btn-ghost btn-sm"><X size={14} aria-hidden="true" /> Descartar</button>
      </div>
      {error && <p className="font-body text-[11px] text-pepper">{error}</p>}
    </div>
  )
}

/**
 * Franja de impresión de la caja: qué aparato imprime, el puente en este
 * aparato si es la impresora, y los trabajos que necesitan revisión.
 */
export default function ImpresoraCaja({ puesto, sedeId }) {
  const activo = !!puesto?.disponible && !puesto.cargando
  const { enCola, ultimo } = usePuente(sedeId, activo && puesto.esImpresora, puesto?.aparatoId)
  const trabajos = useTrabajosDeHoy(sedeId, activo)
  const [ayuda, setAyuda] = useState(false)
  const [busy, setBusy] = useState(false)
  const [, setReloj] = useState(0)
  useEffect(() => { const t = setInterval(() => setReloj((n) => n + 1), 30000); return () => clearInterval(t) }, [])

  const revisar = useMemo(() => trabajos
    .filter((j) => j.estado === 'error' || j.estado === 'pendiente_reintento' || ambiguo(j))
    .sort((a, b) => a.creadoAt - b.creadoAt), [trabajos])
  const esperando = trabajos.filter((j) => j.estado === 'pendiente').length

  const prueba = useCallback(async () => {
    setBusy(true)
    try { await llamarApi('POST', 'impresiones/prueba', { sedeId }) } catch { /* se ve en la cola */ } finally { setBusy(false) }
  }, [sedeId])

  if (!activo) return null
  const { esImpresora, impresoraActiva, impresoraNombre, hayImpresora, hacerImpresora, dejarImpresora } = puesto

  return (
    <div className="mx-4 mt-2 flex flex-col gap-2">
      {esImpresora ? (
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 font-body text-xs text-mint">
          <span className="flex items-center gap-2"><Printer size={14} aria-hidden="true" /> Este aparato imprime las comandas{enCola ? ` · ${enCola} en cola` : ''}.</span>
          {ultimo && <span className={ultimo.ok ? 'text-coal/55' : 'text-pepper'}>{ultimo.texto}</span>}
          <span className="flex gap-3 ml-auto">
            <button onClick={prueba} disabled={busy} className="btn-link text-xs">Página de prueba</button>
            <button onClick={() => setAyuda((v) => !v)} className="btn-link text-xs inline-flex items-center gap-1">Imprimir sin cuadro <ChevronDown size={12} aria-hidden="true" /></button>
            <button onClick={dejarImpresora} className="btn-link text-xs text-coal/55">Dejar de imprimir</button>
          </span>
        </div>
      ) : impresoraActiva ? (
        <div className="flex items-center justify-between gap-2 font-body text-xs text-coal/55">
          <span className="flex items-center gap-2"><Printer size={14} aria-hidden="true" /> Las comandas se imprimen en {impresoraNombre}.</span>
          <button onClick={hacerImpresora} className="btn-link text-xs flex-shrink-0">Imprimir en este</button>
        </div>
      ) : (
        <div className="bg-tangelo/15 border border-tangelo/50 rounded-2xl px-4 py-3 flex flex-col sm:flex-row sm:items-center gap-3">
          <p className="font-body text-xs text-coal leading-snug flex items-start gap-2 flex-1">
            <Printer size={14} className="text-tangelo flex-shrink-0 mt-0.5" aria-hidden="true" />
            <span>
              {hayImpresora
                ? <>El aparato que imprime ({impresoraNombre}) se desconectó. Las comandas esperan en la cola{esperando ? ` (${esperando})` : ''}.</>
                : <>Ningún aparato imprime las comandas. Elige el computador que tiene la impresora.</>}
            </span>
          </p>
          <button onClick={hacerImpresora} className="btn-primary btn-sm whitespace-nowrap flex-shrink-0">Imprimir en este</button>
        </div>
      )}

      {esImpresora && ayuda && (
        <div className="bg-cream rounded-xl px-3 py-2 font-body text-xs text-coal/75 flex flex-col gap-1">
          <p>Para que las comandas salgan solas, sin el cuadro de imprimir, en el computador de la impresora:</p>
          <p>1. Pon la impresora de comandas como <strong>predeterminada</strong> en Windows.</p>
          <p>2. Crea un acceso directo de Chrome y en «Destino» agrega al final:</p>
          <code className="bg-smoked/60 rounded px-2 py-1 break-all">{`--kiosk-printing --user-data-dir="C:\\DeliStars-impresora" ${window.location.origin}/domicilios/`}</code>
          <p>3. Abre DeliStars con ese acceso, entra con la cuenta de la caja y toca «Imprimir en este».</p>
        </div>
      )}

      {revisar.length > 0 && (
        <div className="bg-pepper/10 border border-pepper/30 rounded-2xl px-3 py-2 flex flex-col gap-2">
          <p className="font-body text-xs font-semibold text-pepper flex items-center gap-1.5"><AlertTriangle size={14} aria-hidden="true" /> Comandas por revisar</p>
          {revisar.map((j) => <RevisarTrabajo key={j.id} j={j} compacto />)}
        </div>
      )}
    </div>
  )
}

