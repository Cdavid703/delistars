import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { collection, onSnapshot, query, where } from 'firebase/firestore'
import { Printer, AlertTriangle, Check, RotateCcw, X, ChevronDown } from 'lucide-react'
import { db } from '../../services/firebase'
import ChipEstado from './ChipEstado'
import { llamarApi } from '../../services/pedidosApi'
import { ambiguo } from '../../utils/comanda'
import logoComanda from '../../assets/logos/logo_comanda.png'

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

// Logo en blanco y negro puro (la térmica no imprime grises): la estrella de DeliStars.
const LOGO = new URL(logoComanda, window.location.href).href

/** Un renglón de la comanda → HTML. Los renglones los arma el servidor (comanda.js). */
function renglon(l) {
  if (l.e === 'linea') return '<hr/>'
  const t = String(l.t ?? '')
  if (l.e === 'titulo') return t.startsWith('#') ? `<div class="numero">${esc(t)}</div>` : `<div class="numero chico">${esc(t)}</div>`
  if (l.e === 'grande' && /^(DOMICILIO|RECOGE EN SEDE)$/.test(t)) return `<div class="modo">★ ${esc(t)} ★</div>`
  // Valores: «Subtotal  $59.000» → etiqueta a la izquierda, valor a la derecha.
  const valor = t.match(/^(.+?)\s{2,}(\$[\d.,]+|\d+ gratis.*)$/)
  if (valor) return `<div class="fila${l.e === 'grande' ? ' total' : ''}"><span>${esc(valor[1])}</span><span>${esc(valor[2])}</span></div>`
  // Producto: «1x Hamburguesa | Salsas: … | Cebolla: …» → nombre y sus opciones debajo.
  if (l.e === 'negrita' && /^\d+x /.test(t)) {
    const [nombre, ...opciones] = t.split(/\s*\|\s*/)
    return `<div class="prod">${esc(nombre)}</div>${opciones.map((o) => `<div class="opc">· ${esc(o)}</div>`).join('')}`
  }
  if (/^\s/.test(t)) return `<div class="opc">${esc(t.trim())}</div>`
  const dato = t.match(/^(Cliente|Recibe|Nota): (.*)$/)
  if (dato) return `<div class="${dato[1] === 'Cliente' ? '' : 'negrita'}"><b>${dato[1]}:</b> ${esc(dato[2])}</div>`
  if (/^(COPIA|ACTUALIZADA|\*\*\*)/.test(t)) return `<div class="aviso">${esc(t)}</div>`
  if (/^(Pedido \d|Impresa )/.test(t)) return `<div class="hora">${esc(t)}</div>`
  return `<div class="${l.e || ''}">${esc(t) || '&nbsp;'}</div>`
}

/** HTML de la comanda para papel térmico de 80 mm. */
export function htmlComanda(lineas) {
  const cuerpo = (lineas || []).map(renglon).join('')
  return `<!DOCTYPE html><html><head><meta charset="utf-8"><title>Comanda</title><style>
    @page{margin:0}
    /* La Digital POS solo imprime entre ~5 mm y ~72 mm del papel (se comía la
       primera letra y el final de los renglones): el texto va de 8 mm a 71 mm. */
    html,body{margin:0;padding:0}
    body{font-family:Arial,Helvetica,sans-serif;font-size:14px;line-height:1.3;color:#000;
      box-sizing:border-box;width:100%;max-width:76mm;padding:3mm 5mm 5mm 8mm}
    div{white-space:pre-wrap;word-break:break-word}
    .logo{display:block;width:46mm;max-width:100%;margin:0 auto 2mm}
    .numero{font-size:34px;font-weight:900;text-align:center;letter-spacing:1px;line-height:1.1}
    .numero.chico{font-size:22px}
    .modo{background:#000;color:#fff;font-size:16px;font-weight:700;text-align:center;letter-spacing:2px;padding:3px 0;margin:2mm 0;
      -webkit-print-color-adjust:exact;print-color-adjust:exact}
    .hora{font-size:12px;text-align:center;margin-bottom:1mm}
    .prod{font-size:15px;font-weight:700;margin-top:2mm}
    .opc{font-size:13px;padding-left:3mm}
    .fila{display:flex;justify-content:space-between;gap:3mm}
    .fila.total{font-size:18px;font-weight:900;margin-top:1mm}
    .aviso{border:2px solid #000;font-weight:700;text-align:center;padding:2px 4px;margin-bottom:2mm}
    .grande{font-size:17px;font-weight:700}
    .negrita{font-weight:700}
    hr{border:0;border-top:1px dashed #000;margin:2.5mm 0}
    .pie{text-align:center;font-size:13px;margin-top:3mm;letter-spacing:1px}
  </style></head><body><img class="logo" src="${LOGO}" alt="DeliStars"/>${cuerpo}<div class="pie">★ ¡Gracias por tu pedido! ★</div></body></html>`
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
      // Espera el logo (máximo 2,5 s: sin logo igual se imprime).
      const img = d.querySelector('img')
      const listo = img && !img.complete
        ? new Promise((r) => { img.onload = img.onerror = r; setTimeout(r, 2500) })
        : Promise.resolve()
      listo.then(() => setTimeout(() => {
        try {
          marco.contentWindow.focus()
          marco.contentWindow.print() // con --kiosk-printing no muestra cuadro
          quitar(); resolve()
        } catch (e) { quitar(); reject(e) }
      }, 150))
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

  // Va dentro de la franja de estado de la caja (flex con wrap): la etiqueta en
  // línea; la ayuda y las comandas por revisar ocupan todo el ancho debajo.
  return (
    <>
      {esImpresora ? (
        <ChipEstado tono="bien" icono={Printer} texto={`Las comandas se imprimen aquí${enCola ? ` · ${enCola} en cola` : ''}`}>
          <span className="flex items-center gap-2 pl-1 font-normal">
            <button onClick={prueba} disabled={busy} className="underline underline-offset-2 hover:text-coal">Prueba</button>
            <button onClick={() => setAyuda((v) => !v)} className="underline underline-offset-2 hover:text-coal inline-flex items-center gap-0.5">Sin cuadro <ChevronDown size={11} aria-hidden="true" /></button>
            <button onClick={dejarImpresora} className="underline underline-offset-2 text-coal/50 hover:text-coal">Dejar</button>
          </span>
        </ChipEstado>
      ) : impresoraActiva ? (
        <ChipEstado tono="neutro" icono={Printer} texto={`Las comandas se imprimen en ${impresoraNombre}`}
          accion={{ texto: 'Imprimir en este', onClick: hacerImpresora }} />
      ) : (
        <ChipEstado tono="atencion" icono={Printer}
          texto={hayImpresora ? `La impresora se desconectó${esperando ? ` · ${esperando} en cola` : ''}` : 'Sin impresora de comandas'}
          titulo={hayImpresora ? `El aparato que imprime (${impresoraNombre}) se desconectó: las comandas esperan en la cola.` : 'Ningún aparato imprime las comandas. Elige el computador que tiene la impresora.'}
          accion={{ texto: 'Imprimir en este', onClick: hacerImpresora }} />
      )}
      {esImpresora && ultimo && (
        <span className={`font-body text-xs ${ultimo.ok ? 'text-coal/50' : 'text-pepper font-semibold'}`}>{ultimo.texto}</span>
      )}

      {esImpresora && ayuda && (
        <div className="basis-full bg-cream rounded-xl px-3 py-2 font-body text-xs text-coal/75 flex flex-col gap-1">
          <p>Para que las comandas salgan solas, sin el cuadro de imprimir, en el computador de la impresora:</p>
          <p>1. Pon la impresora de comandas como <strong>predeterminada</strong> en Windows.</p>
          <p>2. Crea un acceso directo de Chrome y en «Destino» agrega al final:</p>
          <code className="bg-smoked/60 rounded px-2 py-1 break-all">{`--kiosk-printing --user-data-dir="C:\\DeliStars-impresora" ${window.location.origin}/domicilios/`}</code>
          <p>3. Abre DeliStars con ese acceso, entra con la cuenta de la caja y toca «Imprimir en este».</p>
        </div>
      )}

      {revisar.length > 0 && (
        <div className="basis-full bg-pepper/10 border border-pepper/30 rounded-2xl px-3 py-2 flex flex-col gap-2">
          <p className="font-body text-xs font-semibold text-pepper flex items-center gap-1.5"><AlertTriangle size={14} aria-hidden="true" /> Comandas por revisar</p>
          {revisar.map((j) => <RevisarTrabajo key={j.id} j={j} compacto />)}
        </div>
      )}
    </>
  )
}

