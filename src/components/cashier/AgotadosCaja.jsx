import { useEffect, useMemo, useState } from 'react'
import { PackageX, Search, X } from 'lucide-react'
import { llamarApi, ErrorApi } from '../../services/pedidosApi'
import useAgotados from '../../hooks/useAgotados'
import useBackClose from '../../hooks/useBackClose'

// Agotado por sede (§7.2, §16.1, P-14). La caja marca lo que se acabó en SU sede:
// el producto sigue en el menú con la etiqueta «Agotado» y nadie lo puede pedir
// ahí hasta que lo vuelva a ofrecer. Queda registrado quién lo marcó. El
// «No disponible» del administrador es otra cosa (lo esconde en las dos sedes).

const SEDES = [
  { id: 'santa_lucia', nombre: 'Santa Lucía' },
  { id: 'santa_teresita', nombre: 'Santa Teresita' },
]

// Un producto con su botón para marcarlo agotado o volver a ofrecerlo.
function Fila({ p, agotado, guardando, onCambiar }) {
  return (
    <li className="flex items-center gap-3 py-2">
      <span className={`flex-1 min-w-0 font-body text-sm ${agotado ? 'text-coal/50 line-through' : 'text-coal'}`}>{p.nombre_producto}</span>
      <button onClick={() => onCambiar(p, !agotado)} disabled={guardando}
        className={`flex-shrink-0 rounded-full px-3 py-1.5 font-body text-xs font-semibold transition-colors disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cherry/40 ${
          agotado ? 'bg-mint text-cream hover:bg-mint/90' : 'bg-coal/5 text-coal/70 hover:bg-pepper/10 hover:text-pepper'}`}>
        {guardando ? 'Guardando…' : agotado ? 'Volver a ofrecer' : 'Marcar agotado'}
      </button>
    </li>
  )
}

export default function AgotadosCaja({ sede, onClose }) {
  useBackClose(true, onClose)
  const [sedeId, setSedeId] = useState(sede?.id && sede.id !== 'all' ? sede.id : 'santa_lucia')
  const { ids } = useAgotados(sedeId)
  const [productos, setProductos] = useState(null)
  const [categorias, setCategorias] = useState({})
  const [busca, setBusca] = useState('')
  const [ocupado, setOcupado] = useState(null)
  const [error, setError] = useState('')

  useEffect(() => {
    let vivo = true
    Promise.all([
      fetch('/api/v1/products').then((r) => r.json()),
      fetch('/api/v1/categories').then((r) => r.json()).catch(() => ({})),
    ]).then(([p, c]) => {
      if (!vivo) return
      setProductos(p?.data || p || [])
      const cats = {}
      for (const x of c?.data || c || []) cats[x.id_categoria] = x.nombre_categoria || x.nombre || ''
      setCategorias(cats)
    }).catch(() => vivo && setError('No se pudo cargar el menú. Revisa la conexión.'))
    return () => { vivo = false }
  }, [])

  // Lo que se vende en esta sede (el admin no lo ocultó), agrupado por categoría.
  const grupos = useMemo(() => {
    if (!productos) return []
    const t = busca.trim().toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
    const visibles = productos.filter((p) => {
      if (p.disponible === false) return false
      const r = p.reglas
      if (r && !r.visible && !r.esOpcion) return false
      if (r?.soloSedes && !r.soloSedes.includes(sedeId)) return false
      return !t || p.nombre_producto.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').includes(t)
    })
    const porCat = new Map()
    for (const p of visibles) {
      const k = p.reglas?.esOpcion ? 'Adiciones, salsas y cebolla' : (categorias[p.id_categoria] || 'Otros')
      if (!porCat.has(k)) porCat.set(k, [])
      porCat.get(k).push(p)
    }
    return [...porCat].map(([nombre, lista]) => ({ nombre, lista: lista.sort((a, b) => a.nombre_producto.localeCompare(b.nombre_producto)) }))
  }, [productos, categorias, busca, sedeId])

  const agotadosLista = (productos || []).filter((p) => ids.has(p.id_producto))

  const cambiar = async (p, agotado) => {
    setOcupado(p.id_producto); setError('')
    try { await llamarApi('POST', 'agotados', { sedeId, idProducto: p.id_producto, agotado }) }
    catch (err) { setError(err instanceof ErrorApi ? err.message : 'No se pudo guardar. Intenta de nuevo.') }
    finally { setOcupado(null) }
  }

  return (
    <div className="fixed inset-0 z-[100] flex items-end sm:items-center justify-center bg-coal/50 backdrop-blur-sm animate-fade-in"
      onClick={(e) => { if (e.target === e.currentTarget) onClose() }}>
      <div className="bg-cream w-full max-w-lg rounded-t-3xl sm:rounded-3xl max-h-[90dvh] flex flex-col animate-sheet-up sm:animate-scale-in">
        <div className="bg-gradient-to-r from-cherry to-tangelo px-6 py-5 rounded-t-3xl flex items-center justify-between">
          <div>
            <p className="font-display text-2xl text-cream tracking-wide flex items-center gap-2"><PackageX size={22} aria-hidden="true" /> Agotados</p>
            <p className="font-body text-xs text-cream/85">Solo en esta sede. El cliente lo ve como «Agotado» y no lo puede pedir.</p>
          </div>
          <button onClick={onClose} className="text-cream/80 hover:text-cream" aria-label="Cerrar"><X size={22} /></button>
        </div>

        <div className="px-5 pt-4 flex flex-col gap-3">
          {(!sede?.id || sede.id === 'all') && (
            <div className="flex gap-2">
              {SEDES.map((s) => (
                <button key={s.id} onClick={() => setSedeId(s.id)}
                  className={`flex-1 rounded-xl px-3 py-2 font-body text-sm font-semibold ${sedeId === s.id ? 'bg-coal text-cream' : 'bg-coal/5 text-coal/70'}`}>
                  {s.nombre}
                </button>
              ))}
            </div>
          )}
          {agotadosLista.length > 0 && (
            <div className="rounded-2xl bg-pepper/10 border border-pepper/30 px-4 py-2">
              <p className="font-body text-[11px] font-bold uppercase tracking-wider text-pepper pt-1">Agotados ahora ({agotadosLista.length})</p>
              <ul className="divide-y divide-pepper/15">{agotadosLista.map((p) => <Fila key={p.id_producto} p={p} agotado={ids.has(p.id_producto)} guardando={ocupado === p.id_producto} onCambiar={cambiar} />)}</ul>
            </div>
          )}
          <label className="relative block">
            <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-coal/40" aria-hidden="true" />
            <input className="input-field pl-9 text-sm" value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Buscar producto" />
          </label>
          {error && <p className="font-body text-xs text-pepper">{error}</p>}
        </div>

        <div className="flex-1 min-h-0 overflow-y-auto scroll-custom px-5 pb-6 pt-2">
          {!productos && !error && <p className="font-body text-sm text-coal/50 py-6 text-center">Cargando el menú…</p>}
          {grupos.map((g) => (
            <section key={g.nombre} className="mt-3">
              <p className="font-display text-base tracking-wide text-coal/70">{g.nombre}</p>
              <ul className="divide-y divide-coal/10">{g.lista.map((p) => <Fila key={p.id_producto} p={p} agotado={ids.has(p.id_producto)} guardando={ocupado === p.id_producto} onCambiar={cambiar} />)}</ul>
            </section>
          ))}
          {productos && grupos.length === 0 && <p className="font-body text-sm text-coal/50 py-6 text-center">No hay productos con ese nombre.</p>}
        </div>
      </div>
    </div>
  )
}
